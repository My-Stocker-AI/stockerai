"""
Voice diagnostics sink:
  POST /api/diag — receives device-side voice events and prints them to stdout so they
  land in Render logs (read remotely via the Render API). Lets us see EXACTLY what a
  driver's phone did — what Deepgram heard, what the AI said, connection events, timing —
  instead of guessing at device-side audio bugs we can't observe. No DB table required.

THE ONE COMMAND THAT DOES NOT REQUIRE A LOGIN, on purpose.

It is write-only: it hands back nothing but a count, so there is no data here to protect.
And the public demo at /demo/live is used by people who have never signed in. Requiring a
login here silenced exactly the reports we depend on to see why a demo failed on a
prospect's phone — the thing this pipe exists to make readable rather than guessed at.

So an anonymous report is accepted and clearly LABELLED as anonymous. It is received, never
trusted. Two protections stand in place of the login: the batch is capped so one caller
cannot flood the logs in a single request, and the caller is stamped from their login when
they have one, so a signed-in driver's events can never be attributed to anyone else.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
import json

from app.services.auth import Caller, OptionalCaller

router = APIRouter()

# One phone sends a handful of events per batch. A cap well above that costs a real driver
# nothing and stops a single request from dumping unbounded text into the logs.
MAX_EVENTS_PER_BATCH = 200


class DiagEvent(BaseModel):
    t: int | None = None        # client timestamp (ms)
    type: str | None = None     # event type (transcript / spoken / deepgram-* / error / ...)
    data: Any = None            # event payload


class DiagBatch(BaseModel):
    session_id: str | None = None
    # Accepted for older app builds, never read. A signed-in caller is identified by their
    # login, so a report can never be attributed to the wrong person by claiming to be them.
    user_id: str | None = None
    user_agent: str | None = None
    events: list[DiagEvent] = []


@router.post("/diag")
def diag(batch: DiagBatch, caller: Caller | None = OptionalCaller):
    # "anonymous" is the honest label for a demo visitor. It is never a real user id, so a
    # line in the log can't be mistaken for one belonging to an account.
    who = caller.user_id if caller else "anonymous"

    events = batch.events[:MAX_EVENTS_PER_BATCH]
    dropped = len(batch.events) - len(events)

    # One line per event, prefixed VOICEDIAG so it's trivially greppable in Render logs.
    for e in events:
        line = json.dumps(
            {
                "sid": batch.session_id,
                "uid": who,
                "ua": (batch.user_agent or "")[:60],
                "t": e.t,
                "type": e.type,
                "data": e.data,
            },
            default=str,
        )
        print(f"VOICEDIAG {line}", flush=True)

    if dropped:
        # Say so rather than truncate in silence — a missing tail in the record would read
        # as "nothing happened next", which is the opposite of the truth.
        print(f"VOICEDIAG {json.dumps({'sid': batch.session_id, 'uid': who, 'type': 'batch-capped', 'dropped': dropped})}", flush=True)

    return {"ok": True, "received": len(events)}
