from fastapi import APIRouter, Depends

from .. import store
from ..deps import get_patient
from ..models import DEFAULT_ADAPT_CONFIG, SampleIn

router = APIRouter(prefix="/api/patients")

# Step 1 stub: approved configs live in memory until step 3.
_adapt_configs: dict[str, dict] = {}


@router.get("/{patient_id}")
def patient(p: dict = Depends(get_patient)):
    return p


@router.get("/{patient_id}/samples")
def samples(p: dict = Depends(get_patient)):
    return store.list_samples(p["id"])


@router.post("/{patient_id}/samples", status_code=201)
def add_sample(body: SampleIn, p: dict = Depends(get_patient)):
    return store.add_sample(p["id"], body.label, body.vector)


@router.delete("/{patient_id}/samples")
def reset_samples(p: dict = Depends(get_patient)):
    return {"deleted": store.delete_samples(p["id"])}


@router.get("/{patient_id}/adapt-config")
def get_adapt_config(p: dict = Depends(get_patient)):
    return _adapt_configs.get(p["id"], DEFAULT_ADAPT_CONFIG)


@router.put("/{patient_id}/adapt-config")
def put_adapt_config(body: dict, p: dict = Depends(get_patient)):
    _adapt_configs[p["id"]] = body
    return body
