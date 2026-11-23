import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Where to read recent-change events from: "live" hits the real Wikimedia
    # stream, "sample" replays backend/sample_events.jsonl on a loop (useful
    # for offline dev, demos, and CI where outbound network may be blocked).
    event_source: str = os.getenv("EVENT_SOURCE", "live")
    sample_events_path: str = os.getenv(
        "SAMPLE_EVENTS_PATH",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_events.jsonl"),
    )
    # Multiplier applied to the gaps between recorded sample events. 1.0 replays
    # at recorded speed; 0 replays as fast as possible.
    replay_speed: float = float(os.getenv("REPLAY_SPEED", "0.3"))

    stream_url: str = os.getenv(
        "WIKIMEDIA_STREAM_URL", "https://stream.wikimedia.org/v2/stream/recentchange"
    )
    # Wikimedia's edge rejects requests with a generic/default User-Agent
    # (e.g. a bare "python-httpx/0.28.1") with a 403, per their API
    # etiquette policy -- it wants something identifiable, ideally with
    # contact info. Override via env var with your own repo/contact.
    stream_user_agent: str = os.getenv(
        "WIKIMEDIA_USER_AGENT",
        "WikiPulse/1.0 (https://github.com/wikipulse/wikipulse; take-home assignment dashboard)",
    )

    # How many minutes of edit history to keep around for the "top pages"
    # window and the edits-per-minute sparkline.
    top_pages_window_minutes: int = int(os.getenv("TOP_PAGES_WINDOW_MINUTES", "5"))
    epm_history_minutes: int = int(os.getenv("EPM_HISTORY_MINUTES", "15"))

    stats_broadcast_interval_seconds: float = float(
        os.getenv("STATS_BROADCAST_INTERVAL_SECONDS", "2")
    )
    pulse_interval_seconds: float = float(os.getenv("PULSE_INTERVAL_SECONDS", "45"))

    # How many wikis to report per-wiki breakdowns for (keeps the stats
    # payload small when hundreds of small wikis are active at once).
    max_tracked_wikis: int = int(os.getenv("MAX_TRACKED_WIKIS", "20"))

    # LLM provider: "anthropic", "gemini", or "none" (heuristic/template-only
    # fallback, no network calls, no API key required). Auto-detected from
    # whichever API key is set (Anthropic takes priority) unless LLM_PROVIDER
    # is set explicitly.
    llm_provider: str = os.getenv(
        "LLM_PROVIDER",
        "anthropic"
        if os.getenv("ANTHROPIC_API_KEY")
        else ("gemini" if os.getenv("GEMINI_API_KEY") else "none"),
    )
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5")
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

    # Heuristic score (0-1) above which an edit is forwarded to the LLM for a
    # second-pass judgement + human-readable reason. Keeps API spend low by
    # only ever calling the LLM on the subset the cheap heuristic already
    # thinks is suspicious.
    vandalism_llm_threshold: float = float(os.getenv("VANDALISM_LLM_THRESHOLD", "0.5"))
    vandalism_flag_threshold: float = float(os.getenv("VANDALISM_FLAG_THRESHOLD", "0.35"))

    cors_origins: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
        ).split(",")
        if origin.strip()
    ]


settings = Settings()
