"""Vandalism detection: a cheap heuristic pre-filter, with an optional LLM
second pass for the edits the heuristic thinks are worth a closer look.

Running the heuristic on every single edit costs nothing and never touches
the network. Only edits that cross `settings.vandalism_llm_threshold` get
sent to the LLM, which keeps API spend bounded and roughly proportional to
how much actual vandalism-shaped activity is happening, rather than to the
total firehose volume.
"""

from __future__ import annotations

import re

from app.config import settings
from app.models import EditEvent, VandalismInfo

_IP_RE = re.compile(
    r"^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+:[0-9a-fA-F:]+$"
)
_SHOUTING_RE = re.compile(r"[A-Z]{6,}")
_SUSPICIOUS_WORDS = (
    "poop", "stupid", "idiot", "hate", "sucks", "fuck", "shit", "ass ",
    "gay", "nazi", "kill you", "lol", "haha", "penis", "butt",
)


def _signal_score(event: EditEvent) -> tuple[float, list[str]]:
    if event.bot:
        return 0.0, []

    score = 0.0
    reasons: list[str] = []
    old, new, delta = event.length_old, event.length_new, event.delta

    if old is not None and new is not None and old > 200 and new < max(5, old * 0.1):
        score += 0.6
        reasons.append("removed almost all of the page's content")
    elif old and delta < 0 and old > 0 and abs(delta) / old > 0.5:
        score += 0.4
        reasons.append(f"deleted {abs(delta)} bytes (~{abs(delta) / old:.0%} of the page)")
    elif delta < -800:
        score += 0.25
        reasons.append(f"large deletion of {abs(delta)} bytes")

    if delta > 8000:
        score += 0.15
        reasons.append(f"unusually large insertion of {delta} bytes")

    comment = (event.comment or "").strip()
    lowered = comment.lower()
    if not comment and abs(delta) > 500:
        score += 0.15
        reasons.append("no edit summary for a large change")

    if any(word in lowered for word in _SUSPICIOUS_WORDS):
        score += 0.35
        reasons.append("edit summary contains language commonly associated with vandalism")

    if _SHOUTING_RE.search(comment):
        score += 0.1
        reasons.append("edit summary is in all caps")

    if event.change_type == "new" and new is not None and new < 40:
        score += 0.15
        reasons.append("newly created page with almost no content")

    if _IP_RE.match(event.user):
        score += 0.1

    return min(score, 1.0), reasons


def heuristic_assess(event: EditEvent) -> tuple[VandalismInfo, list[str]]:
    """Fast, local-only assessment. Returns the VandalismInfo to use when no
    LLM pass is warranted (or available), plus the raw reason fragments so a
    caller can decide whether to escalate to the LLM.
    """
    score, reasons = _signal_score(event)
    flagged = score >= settings.vandalism_flag_threshold
    reason = "; ".join(reasons) if (flagged and reasons) else None
    return (
        VandalismInfo(flagged=flagged, score=round(score, 2), reason=reason, source="heuristic"),
        reasons,
    )


def should_escalate_to_llm(score: float) -> bool:
    return score >= settings.vandalism_llm_threshold
