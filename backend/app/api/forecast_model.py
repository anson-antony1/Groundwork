from fastapi import APIRouter

from ..core.errors import NotFoundError
from ..schemas.common import Envelope
from ..schemas.responses import ForecastModelOut
from ..services.forecast_model import load_model
from .responses import error_responses, ok

router = APIRouter(prefix="/forecast-model", tags=["forecast-model"])


@router.get("", response_model=Envelope[ForecastModelOut], responses=error_responses(404),
            summary="Model card: the learned STOP-WORK forecast, its training data and held-out evaluation")
def get_forecast_model():
    model = load_model()
    if model is None:
        raise NotFoundError("No trained model. Run python -m backend.ml.train.")
    return ok(ForecastModelOut(**{k: model[k] for k in ("version", "label", "sources", "features", "evaluation")}),
              "cached")
