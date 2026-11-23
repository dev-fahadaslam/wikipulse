"""Client for the Wikimedia EventStreams `recentchange` feed.

Exposes a single async generator, `iter_events`, that yields parsed JSON
dicts (the raw recentchange payload) regardless of whether the source is the
live SSE endpoint or a recorded `sample_events.jsonl` file. The rest of the
app never needs to know which one it's talking to.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator

import httpx

from app.config import settings

logger = logging.getLogger("wikipulse.stream_client")


def extract_data_line(line: str) -> str | None:
    """Return the JSON payload of an SSE `data:` line, or None if the line
    carries no payload (blank lines, comments, `event:`/`id:` fields, etc).
    """
    if line.startswith("data:"):
        return line[len("data:"):].strip()
    return None


async def _iter_live_events() -> AsyncIterator[dict]:
    """Connect to the real Wikimedia stream and yield decoded events,
    reconnecting with backoff on any connection drop (the firehose is long
    lived and *will* occasionally disconnect).
    """
    backoff = 1.0
    headers = {"Accept": "text/event-stream"}
    while True:
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", settings.stream_url, headers=headers) as response:
                    response.raise_for_status()
                    backoff = 1.0
                    async for line in response.aiter_lines():
                        payload = extract_data_line(line)
                        if not payload:
                            continue
                        try:
                            yield json.loads(payload)
                        except json.JSONDecodeError:
                            logger.warning("Skipping malformed SSE payload")
        except (httpx.HTTPError, asyncio.TimeoutError) as exc:
            logger.warning("Stream connection error (%s); reconnecting in %.1fs", exc, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)


async def _iter_sample_events(path: str, replay_speed: float) -> AsyncIterator[dict]:
    """Replay a recorded `sample_events.jsonl` file, looping forever.

    `replay_speed` scales the gaps between consecutive recorded events'
    timestamps: 1.0 reproduces the original pacing, 0 replays as fast as
    possible. Timestamps in the yielded payloads are rewritten to "now" so
    downstream rolling-window stats behave the same as they would on live
    data.
    """
    while True:
        prev_ts: float | None = None
        with open(path, encoding="utf-8") as f:
            for raw_line in f:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    event = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                recorded_ts = event.get("timestamp")
                gap = 0.0
                if replay_speed > 0 and prev_ts is not None and isinstance(recorded_ts, (int, float)):
                    gap = max(0.0, (recorded_ts - prev_ts)) * replay_speed
                if isinstance(recorded_ts, (int, float)):
                    prev_ts = recorded_ts
                # Always await, even with gap=0 (replay_speed=0, "as fast as
                # possible" mode): this is the only place this generator
                # yields control, so without it the event loop never gets
                # back to the periodic broadcasters, the health endpoint, or
                # new WebSocket connections while a replay is in progress.
                await asyncio.sleep(min(gap, 5.0))

                event["timestamp"] = time.time()
                event["_replayed"] = True
                yield event


async def iter_events() -> AsyncIterator[dict]:
    """Yield raw recentchange event dicts from the source configured in
    settings (`EVENT_SOURCE=live|sample`).
    """
    if settings.event_source == "sample":
        async for event in _iter_sample_events(settings.sample_events_path, settings.replay_speed):
            yield event
    else:
        async for event in _iter_live_events():
            yield event
