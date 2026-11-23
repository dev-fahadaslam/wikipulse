import json
import os

from app.models import EditEvent

SAMPLE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_events.jsonl")


def test_from_raw_parses_real_recorded_events():
    # sample_events.jsonl (the one supplied with the assignment) includes at
    # least one deliberately malformed line -- the same tolerance the live
    # SSE client needs is exercised here against the recorded file.
    parsed = 0
    skipped_types = set()
    malformed = 0
    with open(SAMPLE_PATH, encoding="utf-8") as f:
        for line in f:
            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                malformed += 1
                continue
            event = EditEvent.from_raw(raw)
            if event is None:
                skipped_types.add(raw.get("type"))
                continue
            parsed += 1
            assert event.wiki
            assert event.title
            assert event.change_type in ("edit", "new")

    assert parsed > 0
    assert malformed > 0
    # log/categorize entries are intentionally out of scope for the dashboard.
    assert skipped_types <= {"log", "categorize"}


def test_from_raw_computes_byte_delta():
    raw = {
        "type": "edit",
        "title": "Test Page",
        "wiki": "enwiki",
        "server_name": "en.wikipedia.org",
        "user": "Someone",
        "timestamp": 123,
        "length": {"old": 100, "new": 150},
    }
    event = EditEvent.from_raw(raw)
    assert event.delta == 50


def test_from_raw_ignores_non_edit_types():
    assert EditEvent.from_raw({"type": "log", "title": "X"}) is None
    assert EditEvent.from_raw({"type": "categorize", "title": "X"}) is None


def test_from_raw_falls_back_to_server_name_when_wiki_is_missing():
    # sample_events.jsonl has a real recorded edit shaped exactly like this
    # (wiki: null, only server_name set) -- handled here rather than
    # letting EditEvent.wiki end up empty/falsy.
    raw = {
        "type": "edit",
        "title": "Some Page",
        "wiki": None,
        "server_name": "en.wikipedia.org",
        "user": "Someone",
        "timestamp": 123,
        "length": {"old": 100, "new": 110},
    }
    event = EditEvent.from_raw(raw)
    assert event is not None
    assert event.wiki == "en.wikipedia.org"
