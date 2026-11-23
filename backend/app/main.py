from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app import ai, stream_client, vandalism
from app.config import settings
from app.models import EditEvent, VandalismInfo
from app.stats import StatsAggregator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wikipulse.main")

stats = StatsAggregator()
latest_pulse: dict | None = None
_background_tasks: set[asyncio.Task] = set()


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)

    async def broadcast(self, message: dict) -> None:
        if not self.active:
            return
        payload = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        # Snapshot before iterating: each `await ws.send_text(...)` yields
        # control back to the event loop, and another client connecting or
        # disconnecting in that window would otherwise mutate `self.active`
        # while this loop is iterating it, raising "Set changed size during
        # iteration".
        for ws in list(self.active):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def _track(task: asyncio.Task) -> None:
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _escalate_to_llm(event: EditEvent, reasons: list[str]) -> None:
    """Runs in the background so the heuristic verdict for an edit can be
    broadcast immediately; if the LLM later disagrees, a small correction
    message patches the row client-side instead of holding up ingestion.
    """
    result = await ai.judge_vandalism(event, reasons)
    if result is None:
        return
    await manager.broadcast(
        {
            "type": "vandalism_update",
            "data": {
                "id": event.id,
                "wiki": event.wiki,
                "vandalism": VandalismInfo(
                    flagged=result["flagged"],
                    score=event.vandalism.score if event.vandalism else 0.0,
                    reason=result["reason"] or None,
                    source="ai",
                ).model_dump(),
            },
        }
    )


async def consume_stream() -> None:
    async for raw in stream_client.iter_events():
        try:
            event = EditEvent.from_raw(raw)
            if event is None:
                continue

            vandalism_info, reasons = vandalism.heuristic_assess(event)
            event.vandalism = vandalism_info
            stats.record(event)

            await manager.broadcast({"type": "edit", "data": event.model_dump()})

            if vandalism.should_escalate_to_llm(vandalism_info.score):
                _track(asyncio.create_task(_escalate_to_llm(event, reasons)))
        except Exception:
            # One malformed/unexpected event (the real firehose, and even
            # the assignment's own sample file, can contain surprises)
            # must never take down ingestion for every event after it.
            logger.exception("Failed to process one recentchange event; skipping it")


async def broadcast_stats_periodically() -> None:
    while True:
        await asyncio.sleep(settings.stats_broadcast_interval_seconds)
        try:
            await manager.broadcast({"type": "stats", "data": stats.snapshot()})
        except Exception:
            logger.exception("Failed to broadcast stats")


async def broadcast_pulse_periodically() -> None:
    global latest_pulse
    while True:
        await asyncio.sleep(settings.pulse_interval_seconds)
        try:
            snapshot = stats.snapshot()
            pulse = await ai.generate_pulse_summary(snapshot)
            latest_pulse = pulse
            await manager.broadcast({"type": "pulse", "data": pulse})
        except Exception:
            logger.exception("Failed to generate/broadcast pulse summary")


@asynccontextmanager
async def lifespan(_: FastAPI):
    tasks = [
        asyncio.create_task(consume_stream()),
        asyncio.create_task(broadcast_stats_periodically()),
        asyncio.create_task(broadcast_pulse_periodically()),
    ]
    for t in tasks:
        _track(t)
    logger.info(
        "WikiPulse backend started (event_source=%s, llm_provider=%s)",
        settings.event_source,
        settings.llm_provider,
    )
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="WikiPulse", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "event_source": settings.event_source,
        "llm_provider": settings.llm_provider,
        "connected_clients": len(manager.active),
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        await ws.send_text(
            json.dumps(
                {
                    "type": "init",
                    "data": {"stats": stats.snapshot(), "pulse": latest_pulse},
                },
                default=str,
            )
        )
        while True:
            # The dashboard is read-only from the client's perspective; we
            # still need to await recv() to detect disconnects promptly.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)
