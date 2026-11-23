import asyncio
import json

import pytest

from app import stream_client


def test_extract_data_line_returns_payload():
    assert stream_client.extract_data_line('data: {"a": 1}') == '{"a": 1}'


def test_extract_data_line_ignores_non_data_lines():
    assert stream_client.extract_data_line("") is None
    assert stream_client.extract_data_line("event: message") is None
    assert stream_client.extract_data_line(': heartbeat') is None
    assert stream_client.extract_data_line("id: 123") is None


@pytest.mark.asyncio
async def test_iter_sample_events_replays_recorded_file(tmp_path):
    sample = tmp_path / "events.jsonl"
    events = [
        {"type": "edit", "title": "A", "timestamp": 1000, "wiki": "enwiki"},
        {"type": "edit", "title": "B", "timestamp": 1000.1, "wiki": "enwiki"},
    ]
    sample.write_text("\n".join(json.dumps(e) for e in events) + "\n")

    seen = []
    gen = stream_client._iter_sample_events(str(sample), replay_speed=0)
    async for event in gen:
        seen.append(event["title"])
        if len(seen) == 2:
            break

    assert seen == ["A", "B"]


@pytest.mark.asyncio
async def test_iter_sample_events_loops_forever(tmp_path):
    sample = tmp_path / "events.jsonl"
    sample.write_text(json.dumps({"type": "edit", "title": "Only", "timestamp": 1}) + "\n")

    gen = stream_client._iter_sample_events(str(sample), replay_speed=0)
    titles = []
    async for event in gen:
        titles.append(event["title"])
        if len(titles) == 3:
            break

    assert titles == ["Only", "Only", "Only"]


@pytest.mark.asyncio
async def test_iter_sample_events_skips_malformed_lines(tmp_path):
    sample = tmp_path / "events.jsonl"
    sample.write_text(
        "not json\n" + json.dumps({"type": "edit", "title": "Good", "timestamp": 1}) + "\n"
    )

    gen = stream_client._iter_sample_events(str(sample), replay_speed=0)
    event = await gen.__anext__()
    assert event["title"] == "Good"


@pytest.mark.asyncio
async def test_iter_sample_events_yields_control_even_at_full_speed(tmp_path):
    # Regression test: replay_speed=0 ("as fast as possible") must still
    # cede control to the event loop between events, or it starves every
    # other task (the periodic broadcasters, the health endpoint, new
    # WebSocket connections) for as long as the replay runs.
    sample = tmp_path / "events.jsonl"
    sample.write_text(
        "\n".join(json.dumps({"type": "edit", "title": f"P{i}", "timestamp": i}) for i in range(5))
        + "\n"
    )

    ticks = 0

    async def background_ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0)
            ticks += 1

    ticker = asyncio.create_task(background_ticker())
    gen = stream_client._iter_sample_events(str(sample), replay_speed=0)
    seen = 0
    async for _event in gen:
        seen += 1
        if seen == 5:
            break
    ticker.cancel()

    assert ticks > 0
