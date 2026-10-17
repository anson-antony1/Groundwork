from fastapi import APIRouter

from ..schemas.common import Envelope
from ..schemas.responses import PolicyOut
from ..services.policies import DEMO_POLICY
from .responses import ok

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("", response_model=Envelope[PolicyOut], summary="Labeled demo thresholds and assumptions")
def get_policies():
    return ok(PolicyOut.model_validate(DEMO_POLICY), "simulated")
