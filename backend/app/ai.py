"""LLM integration: pulse summaries and a second-pass vandalism judgement.

Both entry points degrade gracefully to a deterministic, no-network fallback
when `settings.llm_provider == "none"` (no API key configured) or when the
API call itself fails -- the dashboard should never go down because the LLM
is slow, rate-limited, or unreachable.
"""

from __future__ import annotations

import json
import logging
import time

from app.config import settings
from app.models import EditEvent

logger = logging.getLogger("wikipulse.ai")

_anthropic_client = None
_gemini_client = None


def _get_client():
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import AsyncAnthropic

        _anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        from google import genai as gemini_genai

        _gemini_client = gemini_genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


def _enabled() -> bool:
    if settings.llm_provider == "anthropic":
        return bool(settings.anthropic_api_key)
    if settings.llm_provider == "gemini":
        return bool(settings.gemini_api_key)
    return False


def _strip_code_fence(text: str) -> str:
    """Gemini sometimes wraps JSON replies in a ```json ... ``` fence."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    return text.strip()


async def _complete(system: str, user_content: str, max_tokens: int) -> str:
    """Runs one completion against whichever provider is configured."""
    if settings.llm_provider == "gemini":
        from google.genai import types

        client = _get_gemini_client()
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_tokens,
                # Newer Gemini models spend part of max_output_tokens on
                # internal reasoning before writing the answer; for these
                # short, low-latency completions that can eat the whole
                # budget and leave a truncated reply, so it's disabled.
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        return (response.text or "").strip()

    client = _get_client()
    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return "".join(
        block.text for block in response.content if block.type == "text"
    ).strip()


# ---------------------------------------------------------------------------
# Pulse summary
# ---------------------------------------------------------------------------

PULSE_SYSTEM_PROMPT = (
    "You are writing a one-glance 'pulse' summary for a live Wikipedia "
    "activity dashboard aimed at a general audience. Given the current "
    "top edited pages and edit rate, write 2-3 short plain-English "
    "sentences describing what's trending right now and speculate briefly "
    "on why, if a page's topic suggests an obvious reason (breaking news, "
    "a sports result, an anniversary, etc). Do not invent facts you aren't "
    "given. No markdown, no preamble, just the sentences."
)


def _digest_for_pulse(stats: dict) -> str:
    overall = stats.get("overall", {})
    top_pages = overall.get("top_pages", [])[:10]
    edits_last_60s = overall.get("edits_last_60s", 0)
    wikis = stats.get("wikis", [])[:8]

    lines = [f"Edits in the last 60s (all wikis): {edits_last_60s}."]
    if wikis:
        wiki_bits = ", ".join(f"{w['wiki']} ({w['count_recent']})" for w in wikis)
        lines.append(f"Most active wikis right now: {wiki_bits}.")
    if top_pages:
        lines.append("Top edited pages in the last 5 minutes:")
        for p in top_pages:
            lines.append(f"- {p['title']} [{p['wiki']}]: {p['count']} edits")
    else:
        lines.append("No page has more than one edit in the last 5 minutes yet.")
    return "\n".join(lines)


def _fallback_pulse(stats: dict) -> dict:
    overall = stats.get("overall", {})
    top_pages = overall.get("top_pages", [])
    edits_last_60s = overall.get("edits_last_60s", 0)

    if not top_pages:
        summary = (
            f"Tracking {edits_last_60s} edits/min across Wikimedia right now, "
            "with no single page standing out yet."
        )
    else:
        leader = top_pages[0]
        others = ", ".join(p["title"] for p in top_pages[1:4])
        summary = (
            f"\"{leader['title']}\" ({leader['wiki']}) is the most-edited page "
            f"right now with {leader['count']} edits in the last 5 minutes, "
            f"alongside {edits_last_60s} edits/min across the firehose."
        )
        if others:
            summary += f" Also seeing activity on {others}."

    return {"summary": summary, "generated_at": time.time(), "source": "fallback"}


async def generate_pulse_summary(stats: dict) -> dict:
    if not _enabled():
        return _fallback_pulse(stats)

    try:
        digest = _digest_for_pulse(stats)
        text = await _complete(PULSE_SYSTEM_PROMPT, digest, max_tokens=160)
        if not text:
            raise ValueError("empty response from model")
        return {"summary": text, "generated_at": time.time(), "source": "ai"}
    except Exception:
        logger.exception("Pulse summary generation failed, using fallback")
        return _fallback_pulse(stats)


# ---------------------------------------------------------------------------
# Vandalism second pass
# ---------------------------------------------------------------------------

VANDALISM_SYSTEM_PROMPT = (
    "You review a single Wikipedia edit that an automated heuristic already "
    "flagged as POSSIBLY vandalism. Decide whether it genuinely looks like "
    "vandalism (blanking, graffiti, spam, abuse) as opposed to a legitimate "
    "large edit (e.g. merging content, removing a hoax, copyediting). Reply "
    "with strict JSON only: {\"flagged\": bool, \"reason\": \"<=15 words\"}. "
    "If unsure, prefer flagged=false."
)


def _event_digest(event: EditEvent, heuristic_reasons: list[str]) -> str:
    return json.dumps(
        {
            "title": event.title,
            "wiki": event.wiki,
            "user": event.user,
            "change_type": event.change_type,
            "comment": event.comment,
            "bytes_old": event.length_old,
            "bytes_new": event.length_new,
            "byte_delta": event.delta,
            "heuristic_flags": heuristic_reasons,
        }
    )


async def judge_vandalism(event: EditEvent, heuristic_reasons: list[str]) -> dict | None:
    """Returns {"flagged": bool, "reason": str} from the LLM, or None if the
    LLM is unavailable/unconfigured/failed -- callers should fall back to the
    heuristic verdict in that case.
    """
    if not _enabled():
        return None

    try:
        digest = _event_digest(event, heuristic_reasons)
        text = await _complete(VANDALISM_SYSTEM_PROMPT, digest, max_tokens=80)
        parsed = json.loads(_strip_code_fence(text))
        return {
            "flagged": bool(parsed["flagged"]),
            "reason": str(parsed.get("reason", ""))[:200],
        }
    except Exception:
        logger.exception("Vandalism LLM judgement failed, falling back to heuristic")
        return None
