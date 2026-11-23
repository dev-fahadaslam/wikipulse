from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class VandalismInfo(BaseModel):
    flagged: bool
    score: float
    reason: str | None = None
    source: Literal["heuristic", "ai"]


class EditEvent(BaseModel):
    """Normalized view of a Wikimedia `mediawiki.recentchange` event.

    Only the subset of the raw stream schema the dashboard actually uses is
    kept; everything else from the raw payload is dropped at parse time.
    """

    id: int
    ts: float
    wiki: str
    server_name: str
    title: str
    url: str | None
    user: str
    bot: bool
    minor: bool
    change_type: Literal["edit", "new"]
    comment: str
    length_old: int | None
    length_new: int | None
    delta: int
    vandalism: VandalismInfo | None = None

    @classmethod
    def from_raw(cls, raw: dict[str, Any]) -> "EditEvent | None":
        change_type = raw.get("type")
        if change_type not in ("edit", "new"):
            return None
        length = raw.get("length") or {}
        length_old = length.get("old")
        length_new = length.get("new")
        delta = 0
        if isinstance(length_old, int) and isinstance(length_new, int):
            delta = length_new - length_old
        elif isinstance(length_new, int):
            delta = length_new

        try:
            ts = float(raw.get("timestamp", 0))
        except (TypeError, ValueError):
            # A non-numeric timestamp (seen on malformed stream entries)
            # must not crash parsing -- fall back rather than propagate.
            ts = 0.0

        wiki = raw.get("wiki") or raw.get("server_name") or "unknown"
        rc_id = raw.get("id")
        if rc_id is None:
            # Some log-ish entries lack an `id`; fall back to a value that is
            # still unique enough for our in-memory de-dup/key purposes.
            rc_id = int(ts * 1000) % (2**31)

        return cls(
            id=rc_id,
            ts=ts,
            wiki=wiki,
            server_name=raw.get("server_name", wiki),
            title=raw.get("title", "(unknown title)"),
            url=raw.get("notify_url") or raw.get("title_url"),
            user=raw.get("user", "(unknown)"),
            bot=bool(raw.get("bot", False)),
            minor=bool(raw.get("minor", False)),
            change_type=change_type,
            comment=raw.get("comment") or "",
            length_old=length_old,
            length_new=length_new,
            delta=delta,
        )
