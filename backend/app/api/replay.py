"""Storm replay. start/stop are idempotent: repeating either call changes nothing."""
from fastapi import APIRouter

from ..core.clock import now_utc
from ..schemas.common import Envelope
from ..schemas.requests import ReplayIn
from ..schemas.responses import ReplayOut
from ..services import replay
from . import mappers
from .responses import ok

router = APIRouter(prefix="/replay", tags=["replay"])


def _respond(state) -> dict:
    return ok(mappers.replay_out(state), "replay" if state.replay_active else "simulated",
              errors=replay.warnings(state))


@router.get("", response_model=Envelope[ReplayOut], summary="Current replay state")
def get_replay():
    return _respond(replay.get_replay())


@router.post("/start", response_model=Envelope[ReplayOut], summary="Switch to a historical storm scenario")
def start_replay(body: ReplayIn | None = None):
    return _respond(replay.start_replay((body or ReplayIn()).scenario_id, now_utc()))


@router.post("/stop", response_model=Envelope[ReplayOut], summary="Restore the current scenario")
def stop_replay():
    return _respond(replay.stop_replay(now_utc()))
