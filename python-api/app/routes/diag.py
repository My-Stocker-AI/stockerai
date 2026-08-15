"""
Voice diagnostics sink:
  POST /api/diag — receives device-side voice events and prints them to stdout so they
  land in Render logs (read remotely via the Render API). Lets us see EXACTLY what a
  driver's phone did — what Deepgram heard, what the AI said, connection events, timing —
  instead of guessing at device-side audio bugs we can't observe. No DB table required.

Requires a login. Without one this was an open write channel into the production logs, and
the logs it writes are read by hand during live incidents — anyone could have flooded or
poisoned the record we were relying on to debug a driver's phone.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
import json

from app.services.auth import AuthCaller, Caller

router = APIRouter()


class DiagEvent(BaseModel):
    t: int | None = None        # client timestamp (ms)
    type: str | None = None     # event type (transcript / spoken / deepgram-* / error / ...)
    data: Any = None            # event payload


class DiagBatch(BaseModel):
    session_id: str | None = None
    # Accepted for older app builds, never read — the uid stamped on each line is the one
    # from the verified login, so a diagnostic line cannot be attributed to the wrong person.
    user_id: str | None = None
    user_agent: str | None = None
    events: list[DiagEvent] = []


@router.post("/diag")
def diag(batch: DiagBatch, caller: Caller = AuthCaller):
    # One line per event, prefixed VOICEDIAG so it's trivially greppable in Render logs.
    for e in batch.events:
        line = json.dumps(
            {
                "sid": batch.session_id,
                "uid": caller.user_id,
                "ua": (batch.user_agent or "")[:60],
                "t": e.t,
                "type": e.type,
                "data": e.data,
            },
            default=str,
        )
        print(f"VOICEDIAG {line}", flush=True)
    return {"ok": True, "received": len(batch.events)}
