import time

from app.models import EditEvent
from app.stats import StatsAggregator


def make_event(id_, wiki, title, ts, bot=False, delta=10, url=None) -> EditEvent:
    return EditEvent(
        id=id_,
        ts=ts,
        wiki=wiki,
        server_name=f"{wiki}.example.org",
        title=title,
        url=url,
        user="Someone",
        bot=bot,
        minor=False,
        change_type="edit",
        comment="",
        length_old=100,
        length_new=100 + delta,
        delta=delta,
    )


def test_top_pages_within_window():
    agg = StatsAggregator(top_pages_window_minutes=5, epm_history_minutes=15)
    now = time.time()

    # Recorded in chronological order, same as the real stream delivers them.
    # Outside the 5-minute window by the time we snapshot below: should not
    # count toward top pages.
    agg.record(make_event(4, "enwiki", "Alpha", now - 10 * 60))
    agg.record(make_event(1, "enwiki", "Alpha", now))
    agg.record(make_event(2, "enwiki", "Alpha", now + 1))
    agg.record(make_event(3, "enwiki", "Beta", now + 2))

    snapshot = agg.snapshot()
    top = snapshot["overall"]["top_pages"]
    assert top[0]["wiki"] == "enwiki"
    assert top[0]["title"] == "Alpha"
    assert top[0]["count"] == 2
    assert any(p["title"] == "Beta" and p["count"] == 1 for p in top)


def test_top_pages_pruned_after_window_expires():
    agg = StatsAggregator(top_pages_window_minutes=5, epm_history_minutes=15)
    now = time.time()
    agg.record(make_event(1, "enwiki", "Alpha", now))

    # Force a snapshot far enough in the future that the entry has expired.
    # We simulate this by recording a later event and checking Alpha is gone.
    future_event = make_event(2, "enwiki", "Gamma", now + 6 * 60)
    agg.record(future_event)
    snapshot = agg.snapshot()
    titles = [p["title"] for p in agg._top_pages("enwiki")]
    assert "Alpha" not in titles
    assert "Gamma" in titles


def test_per_wiki_breakdown_is_isolated():
    agg = StatsAggregator()
    now = time.time()
    agg.record(make_event(1, "enwiki", "Alpha", now))
    agg.record(make_event(2, "dewiki", "Alpha", now))
    agg.record(make_event(3, "dewiki", "Alpha", now + 1))

    snapshot = agg.snapshot()
    assert snapshot["by_wiki"]["enwiki"]["top_pages"][0]["count"] == 1
    assert snapshot["by_wiki"]["dewiki"]["top_pages"][0]["count"] == 2
    # Overall combines both wikis' edits to the same title.
    overall_alpha = next(
        p for p in snapshot["overall"]["top_pages"] if p["title"] == "Alpha" and p["wiki"] == "dewiki"
    )
    assert overall_alpha["count"] == 2


def test_edits_last_60s():
    agg = StatsAggregator()
    now = time.time()
    for i in range(5):
        agg.record(make_event(i, "enwiki", f"Page{i}", now))
    # One stale event well outside the 60s window.
    agg.record(make_event(99, "enwiki", "Old", now - 120))

    snapshot = agg.snapshot()
    assert snapshot["overall"]["edits_last_60s"] == 5
    assert snapshot["by_wiki"]["enwiki"]["edits_last_60s"] == 5


def test_wikis_ranked_by_recent_volume():
    agg = StatsAggregator(max_tracked_wikis=2)
    now = time.time()
    for _ in range(3):
        agg.record(make_event(1, "enwiki", "A", now))
    for _ in range(2):
        agg.record(make_event(2, "dewiki", "A", now))
    agg.record(make_event(3, "frwiki", "A", now))

    snapshot = agg.snapshot()
    wikis = [w["wiki"] for w in snapshot["wikis"]]
    assert wikis == ["enwiki", "dewiki"]
    assert "frwiki" not in snapshot["by_wiki"]


def test_top_pages_include_a_url_to_link_to():
    agg = StatsAggregator()
    now = time.time()
    agg.record(make_event(1, "enwiki", "Alpha", now, url="https://en.wikipedia.org/wiki/Alpha"))
    agg.record(make_event(2, "enwiki", "Alpha", now + 1, url="https://en.wikipedia.org/wiki/Alpha"))
    agg.record(make_event(3, "enwiki", "Beta", now + 2, url=None))

    snapshot = agg.snapshot()
    top = {p["title"]: p["url"] for p in snapshot["overall"]["top_pages"]}
    assert top["Alpha"] == "https://en.wikipedia.org/wiki/Alpha"
    assert top["Beta"] is None
