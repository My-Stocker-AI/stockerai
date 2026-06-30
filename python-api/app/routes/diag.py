"""
Voice diagnostics sink:
  POST /api/diag — receives device-side voice events and prints them to stdout so they
  land in Render logs (read remotely via the Render API). Lets us see EXACTLY what a
  driver's phone did — what Deepgram heard, what the AI said, connection events, timing —
  instead of guessing at device-side audio bugs we can't observe. No DB table required.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
import json

router = APIRouter()


class DiagEvent(BaseModel):
    t: int | None = None        # client timestamp (ms)
    type: str | None = None     # event type (transcript / spoken / deepgram-* / error / ...)
    data: Any = None            # event payload


class DiagBatch(BaseModel):
    session_id: str | None = None
    user_id: str | None = None
    user_agent: str | None = None
    events: list[DiagEvent] = []


@router.post("/diag")
def diag(batch: DiagBatch):
    # One line per event, prefixed VOICEDIAG so it's trivially greppable in Render logs.
    for e in batch.events:
        line = json.dumps(
            {
                "sid": batch.session_id,
                "uid": batch.user_id,
                "ua": (batch.user_agent or "")[:60],
                "t": e.t,
                "type": e.type,
                "data": e.data,
            },
            default=str,
        )
        print(f"VOICEDIAG {line}", flush=True)
    return {"ok": True, "received": len(batch.events)}
