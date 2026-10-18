"""The Gemini key must never reach the logs, and a malformed key fails cleanly."""
import logging

from backend.app.services import narration

FAKE_KEY = "AQ.fake-key-for-tests-1234567890"
FACTS = {"sites_evaluated": 1, "stop_work_count": 0}


def test_multi_line_key_is_rejected_without_echoing_it(monkeypatch, caplog):
    monkeypatch.setenv("GEMINI_API_KEY", f"{FAKE_KEY}\nGEMINI_MODEL=some-model")
    with caplog.at_level(logging.WARNING, logger="groundwork.narration"):
        assert narration.narrate(FACTS) is None
    assert "several lines" in caplog.text
    assert FAKE_KEY not in caplog.text


def test_errors_quoting_the_key_are_redacted(monkeypatch, caplog):
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)

    def boom(_facts):
        raise ValueError(f"Illegal header value b'{FAKE_KEY}'")

    monkeypatch.setattr(narration, "_call_gemini", boom)
    with caplog.at_level(logging.WARNING, logger="groundwork.narration"):
        assert narration.narrate(FACTS) is None
    assert FAKE_KEY not in caplog.text
    assert "[REDACTED]" in caplog.text and "ValueError" in caplog.text


class _QuotaError(Exception):
    def __init__(self, code):
        super().__init__(f"{code} error")
        self.code = code


def _fake_client(outcomes: dict, calls: list):
    """A stand-in genai.Client: each model either raises the given error code or answers."""
    class Models:
        def generate_content(self, model, contents):
            calls.append(model)
            result = outcomes.get(model, "ok")
            if isinstance(result, int):
                raise _QuotaError(result)
            return type("Resp", (), {"text": f"narrated by {model}"})()

    class Client:
        def __init__(self, **_kw):
            self.models = Models()
    return Client


def test_model_chain_starts_with_gemini_model_and_skips_duplicates(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "model-b, model-a ,model-c,")
    assert narration.model_chain() == ["model-a", "model-b", "model-c"]


def test_out_of_quota_or_overloaded_model_falls_through_to_the_next(monkeypatch):
    from google import genai
    calls = []
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "model-b,model-c")
    monkeypatch.setattr(genai, "Client", _fake_client({"model-a": 429, "model-b": 503}, calls))
    assert narration._call_gemini(FACTS) == "narrated by model-c"
    assert calls == ["model-a", "model-b", "model-c"]


def test_other_errors_stop_at_the_first_model(monkeypatch):
    from google import genai
    calls = []
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)
    monkeypatch.setenv("GEMINI_MODEL", "model-a")
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "model-b")
    monkeypatch.setattr(genai, "Client", _fake_client({"model-a": 403}, calls))
    assert narration.narrate(FACTS) is None  # e.g. a bad key: trying more models would not help
    assert calls == ["model-a"]
