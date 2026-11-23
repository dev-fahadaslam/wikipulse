import asyncio

import pytest

from app import main as main_module


class _FakeWebSocket:
    def __init__(self):
        self.sent: list[str] = []

    async def accept(self):
        pass

    async def send_text(self, text: str) -> None:
        self.sent.append(text)


@pytest.mark.asyncio
async def test_broadcast_tolerates_a_client_connecting_mid_broadcast():
    # Each await inside the broadcast loop yields control back to the
    # event loop; another client connecting in that window must not mutate
    # the set this loop is iterating out from under it.
    manager = main_module.ConnectionManager()
    second = _FakeWebSocket()

    class MutatingWebSocket(_FakeWebSocket):
        async def send_text(self, text: str) -> None:
            await manager.connect(second)
            await super().send_text(text)

    first = MutatingWebSocket()
    manager.active.add(first)

    await manager.broadcast({"type": "stats", "data": {}})

    assert len(first.sent) == 1


def make_raw(title: str, timestamp, wiki: str = "enwiki") -> dict:
    return {
        "type": "edit",
        "title": title,
        "wiki": wiki,
        "server_name": "en.wikipedia.org",
        "user": "Someone",
        "timestamp": timestamp,
        "length": {"old": 100, "new": 110},
    }


@pytest.mark.asyncio
async def test_consume_stream_survives_a_bad_event(monkeypatch):
    # Whatever breaks on a single event -- a parsing quirk, a bug in the
    # heuristic, anything -- must not take the rest of the firehose down
    # with it. Simulate a failure inside stats.record specifically, so
    # this stays a test of consume_stream's own resilience rather than of
    # whatever EditEvent.from_raw happens to already tolerate.
    async def fake_iter_events():
        yield make_raw("Good1", timestamp=1000)
        yield make_raw("Bad", timestamp=1000)
        yield make_raw("Good2", timestamp=1001)

    monkeypatch.setattr(main_module.stream_client, "iter_events", fake_iter_events)

    broadcasts = []

    async def fake_broadcast(message):
        broadcasts.append(message)

    monkeypatch.setattr(main_module.manager, "broadcast", fake_broadcast)

    def flaky_record(event):
        if event.title == "Bad":
            raise RuntimeError("boom")

    monkeypatch.setattr(main_module.stats, "record", flaky_record)

    await main_module.consume_stream()

    titles = [m["data"]["title"] for m in broadcasts if m["type"] == "edit"]
    assert titles == ["Good1", "Good2"]


@pytest.mark.asyncio
async def test_consume_stream_records_stats_and_broadcasts_edit(monkeypatch):
    async def fake_iter_events():
        yield make_raw("Only", timestamp=1000)

    monkeypatch.setattr(main_module.stream_client, "iter_events", fake_iter_events)

    broadcasts = []

    async def fake_broadcast(message):
        broadcasts.append(message)

    monkeypatch.setattr(main_module.manager, "broadcast", fake_broadcast)

    recorded = []
    monkeypatch.setattr(main_module.stats, "record", lambda event: recorded.append(event))

    await main_module.consume_stream()

    assert len(broadcasts) == 1
    assert broadcasts[0]["type"] == "edit"
    assert broadcasts[0]["data"]["title"] == "Only"
    assert broadcasts[0]["data"]["vandalism"]["source"] == "heuristic"
    assert len(recorded) == 1
    assert recorded[0].title == "Only"


@pytest.mark.asyncio
async def test_consume_stream_escalates_to_llm_in_background(monkeypatch):
    # A heuristic score above the LLM threshold should fire a background
    # task (via the real asyncio.create_task/_track machinery) rather
    # than block ingestion on the LLM call.
    async def fake_iter_events():
        yield {
            "type": "edit",
            "title": "Blanked",
            "wiki": "enwiki",
            "server_name": "en.wikipedia.org",
            "user": "123.45.67.89",
            "timestamp": 1000,
            "comment": "",
            "length": {"old": 5000, "new": 20},
        }

    monkeypatch.setattr(main_module.stream_client, "iter_events", fake_iter_events)

    async def fake_broadcast(message):
        return None

    monkeypatch.setattr(main_module.manager, "broadcast", fake_broadcast)

    judged = []

    async def fake_judge_vandalism(event, reasons):
        judged.append(event.title)
        return None

    monkeypatch.setattr(main_module.ai, "judge_vandalism", fake_judge_vandalism)

    await main_module.consume_stream()
    await asyncio.sleep(0)  # let the scheduled background task actually run

    assert judged == ["Blanked"]
