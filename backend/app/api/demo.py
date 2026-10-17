from fastapi import APIRouter, Depends

from ..schemas.common import Envelope
from ..schemas.responses import DemoResetOut
from ..services import demo
from ..core.auth import require_sensor_or_role
from .responses import error_responses, ok

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset", response_model=Envelope[DemoResetOut],
             dependencies=[Depends(require_sensor_or_role("supervisor"))], responses=error_responses(401, 403), summary="Demo only: end replay, clear session reports/acks, re-arm beacon")
def reset_demo():
    r = demo.reset_demo()
    return ok(DemoResetOut(replay_stopped=r.replay_stopped, reports_cleared=r.reports_cleared,
                           device_events_cleared=r.device_events_cleared), "sensor_demo")
