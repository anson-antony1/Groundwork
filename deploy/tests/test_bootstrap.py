"""The 6 PM plan the hosted app writes at boot (deploy/bootstrap.py)."""
from backend.app import repositories
from backend.app.services import briefings, narration
from deploy import bootstrap


def test_writes_a_template_plan_straight_to_the_database(monkeypatch):
    repositories.reset_all()

    def gemini(facts):
        raise AssertionError("the automatic plan must not spend Gemini's daily quota")

    monkeypatch.setattr(narration, "narrate", gemini)
    assert not bootstrap.has_plan()
    bootstrap.write_plan()
    [plan] = briefings.list_briefings()
    assert plan.narrative_source == "deterministic_template"
    assert bootstrap.has_plan()
    assert narration.narrate is gemini  # put back for anything else in the process
