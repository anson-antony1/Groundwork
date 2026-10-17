from fastapi import APIRouter

from ..envelope import envelope
from ..services.policies import DEMO_POLICY

router = APIRouter(tags=["policies"])


@router.get("/policies")
def get_policies():
    return envelope(DEMO_POLICY, "simulated")
