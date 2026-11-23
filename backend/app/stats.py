"""Rolling, in-memory statistics over the recent-change stream.

Kept deliberately simple: everything lives in a few deques pruned on write,
recomputed into a snapshot dict on read. No database, no persistence --
restarting the process starts the window over, which is the right trade-off
for a "what's happening right now" dashboard.
"""

from __future__ import annotations

import time
from collections import Counter, defaultdict, deque

from app.config import settings
from app.models import EditEvent

ALL_KEY = "__all__"


class StatsAggregator:
    def __init__(
        self,
        top_pages_window_minutes: int | None = None,
        epm_history_minutes: int | None = None,
        max_tracked_wikis: int | None = None,
    ) -> None:
        self.top_pages_window_s = (
            top_pages_window_minutes or settings.top_pages_window_minutes
        ) * 60
        self.epm_history_s = (epm_history_minutes or settings.epm_history_minutes) * 60
        self.max_tracked_wikis = max_tracked_wikis or settings.max_tracked_wikis

        # key -> deque of edit timestamps, used for the edits-per-minute
        # sparkline and the "edits in the last 60s" headline number.
        self._events: dict[str, deque[float]] = defaultdict(deque)
        # key -> deque of (ts, title) [or (ts, wiki, title) for ALL_KEY],
        # used for the "top pages in the last N minutes" leaderboard.
        self._pages: dict[str, deque[tuple]] = defaultdict(deque)

    def record(self, event: EditEvent) -> None:
        # Pruning below only ever pops from the front of each deque, which
        # is O(1) amortized but assumes events arrive in roughly
        # chronological order -- true for the real stream (events are
        # pushed as they happen, modulo a little cross-partition jitter),
        # so this is never an issue in practice.
        now = event.ts
        for key in (ALL_KEY, event.wiki):
            self._events[key].append(now)
            self._prune_events(key, now)

        self._pages[ALL_KEY].append((now, event.wiki, event.title))
        self._prune_pages(ALL_KEY, now)
        self._pages[event.wiki].append((now, event.title))
        self._prune_pages(event.wiki, now)

    def _prune_events(self, key: str, now: float) -> None:
        dq = self._events[key]
        cutoff = now - self.epm_history_s
        while dq and dq[0] < cutoff:
            dq.popleft()

    def _prune_pages(self, key: str, now: float) -> None:
        dq = self._pages[key]
        cutoff = now - self.top_pages_window_s
        while dq and dq[0][0] < cutoff:
            dq.popleft()

    def _epm_series(self, key: str, now: float) -> list[dict]:
        bucket_count = max(1, self.epm_history_s // 60)
        current_minute = int(now // 60)
        counts = Counter(int(ts // 60) for ts in self._events.get(key, ()))
        series = []
        for i in range(bucket_count - 1, -1, -1):
            minute = current_minute - i
            series.append({"minute": minute * 60, "count": counts.get(minute, 0)})
        return series

    def _top_pages(self, key: str, limit: int = 10) -> list[dict]:
        if key == ALL_KEY:
            counter = Counter(
                (wiki, title) for (_ts, wiki, title) in self._pages.get(key, ())
            )
            return [
                {"wiki": wiki, "title": title, "count": count}
                for (wiki, title), count in counter.most_common(limit)
            ]
        counter = Counter(title for (_ts, title) in self._pages.get(key, ()))
        return [
            {"wiki": key, "title": title, "count": count}
            for title, count in counter.most_common(limit)
        ]

    def _bucket_snapshot(self, key: str, now: float) -> dict:
        edits_last_60s = sum(1 for ts in self._events.get(key, ()) if ts >= now - 60)
        return {
            "epm_series": self._epm_series(key, now),
            "edits_last_60s": edits_last_60s,
            "top_pages": self._top_pages(key),
        }

    def snapshot(self) -> dict:
        now = time.time()
        for key in list(self._events.keys()):
            self._prune_events(key, now)
        for key in list(self._pages.keys()):
            self._prune_pages(key, now)

        wiki_volume = Counter(
            {k: len(v) for k, v in self._events.items() if k != ALL_KEY}
        )
        active_wikis = [w for w, _ in wiki_volume.most_common(self.max_tracked_wikis)]

        return {
            "generated_at": now,
            "wikis": [
                {"wiki": w, "count_recent": wiki_volume[w]} for w in active_wikis
            ],
            "overall": self._bucket_snapshot(ALL_KEY, now),
            "by_wiki": {w: self._bucket_snapshot(w, now) for w in active_wikis},
        }
