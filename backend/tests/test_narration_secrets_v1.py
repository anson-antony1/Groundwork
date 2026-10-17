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
