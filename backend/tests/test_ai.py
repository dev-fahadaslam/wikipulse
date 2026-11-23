import pytest

from app import ai
from app.config import settings
from app.models import EditEvent


@pytest.fixture(autouse=True)
def no_llm(monkeypatch):
    """Default every test to the no-API-key path; individual tests opt back
    into "enabled" by monkeypatching settings directly.
    """
    monkeypatch.setattr(settings, "llm_provider", "none")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    yield


def make_event(**overrides) -> EditEvent:
    defaults = dict(
        id=1,
        ts=1_000_000.0,
        wiki="enwiki",
        server_name="en.wikipedia.org",
        title="Some Article",
        url=None,
        user="RegularEditor",
        bot=False,
        minor=False,
        change_type="edit",
        comment="copyedit",
        length_old=1000,
        length_new=1010,
        delta=10,
    )
    defaults.update(overrides)
    return EditEvent(**defaults)


@pytest.mark.asyncio
async def test_pulse_summary_falls_back_without_api_key():
    stats = {
        "overall": {
            "edits_last_60s": 12,
            "top_pages": [{"wiki": "enwiki", "title": "Example", "count": 4}],
        },
        "wikis": [{"wiki": "enwiki", "count_recent": 10}],
    }
    result = await ai.generate_pulse_summary(stats)
    assert result["source"] == "fallback"
    assert "Example" in result["summary"]


@pytest.mark.asyncio
async def test_pulse_summary_fallback_handles_empty_stats():
    stats = {"overall": {"edits_last_60s": 0, "top_pages": []}, "wikis": []}
    result = await ai.generate_pulse_summary(stats)
    assert result["source"] == "fallback"
    assert result["summary"]


@pytest.mark.asyncio
async def test_judge_vandalism_returns_none_without_api_key():
    event = make_event()
    result = await ai.judge_vandalism(event, ["removed almost all of the page's content"])
    assert result is None


@pytest.mark.asyncio
async def test_judge_vandalism_uses_llm_when_enabled(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    class FakeBlock:
        type = "text"
        text = '{"flagged": true, "reason": "blanked the page with no explanation"}'

    class FakeResponse:
        content = [FakeBlock()]

    class FakeMessages:
        async def create(self, **kwargs):
            return FakeResponse()

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(ai, "_get_client", lambda: FakeClient())

    event = make_event()
    result = await ai.judge_vandalism(event, ["removed almost all of the page's content"])
    assert result == {"flagged": True, "reason": "blanked the page with no explanation"}


@pytest.mark.asyncio
async def test_judge_vandalism_falls_back_on_llm_error(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")

    class FakeMessages:
        async def create(self, **kwargs):
            raise RuntimeError("rate limited")

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(ai, "_get_client", lambda: FakeClient())

    event = make_event()
    result = await ai.judge_vandalism(event, [])
    assert result is None


class _FakeGeminiResponse:
    def __init__(self, text):
        self.text = text


class _FakeGeminiModels:
    def __init__(self, text):
        self._text = text

    async def generate_content(self, **kwargs):
        return _FakeGeminiResponse(self._text)


class _FakeGeminiClient:
    def __init__(self, text):
        self.aio = type("Aio", (), {"models": _FakeGeminiModels(text)})()


@pytest.mark.asyncio
async def test_judge_vandalism_uses_gemini_when_enabled(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")

    reply = '```json\n{"flagged": true, "reason": "blanked the page"}\n```'
    monkeypatch.setattr(ai, "_get_gemini_client", lambda: _FakeGeminiClient(reply))

    event = make_event()
    result = await ai.judge_vandalism(event, ["removed almost all of the page's content"])
    assert result == {"flagged": True, "reason": "blanked the page"}


@pytest.mark.asyncio
async def test_pulse_summary_uses_gemini_when_enabled(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(ai, "_get_gemini_client", lambda: _FakeGeminiClient("Things are happening."))

    stats = {
        "overall": {
            "edits_last_60s": 12,
            "top_pages": [{"wiki": "enwiki", "title": "Example", "count": 4}],
        },
        "wikis": [{"wiki": "enwiki", "count_recent": 10}],
    }
    result = await ai.generate_pulse_summary(stats)
    assert result == {
        "summary": "Things are happening.",
        "source": "ai",
        "generated_at": result["generated_at"],
    }
