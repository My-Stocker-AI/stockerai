from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from app.services.auth import AuthCaller, Caller, forbidden
from app.services.database import get_client

router = APIRouter()


class UpdateSessionRequest(BaseModel):
    session_id: str
    # Accepted for older app builds, never read. Identity comes from the login.
    user_id: str | None = None
    new_status: str


@router.post("/update-session")
def update_session(req: UpdateSessionRequest, caller: Caller = AuthCaller):
    db = get_client()

    # The session is matched on its id AND the user from the verified login together, so a
    # session id belonging to another account simply finds nothing.
    session_result = (
        db.table("sessions")
        .select("id, status")
        .eq("user_id", caller.user_id)
        .eq("id", req.session_id)
        .limit(1)
        .execute()
    )

    if not session_result.data:
        # Someone else's session and a session that does not exist give the same answer, so
        # the response can never be used to work out which session ids are real.
        raise forbidden()

    # Update session status
    update_data = {"status": req.new_status}
    if req.new_status == "completed":
        update_data["completed_at"] = datetime.utcnow().isoformat()

    (
        db.table("sessions")
        .update(update_data)
        .eq("id", req.session_id)
        .eq("user_id", caller.user_id)
        .execute()
    )

    return {
        "success": True,
        "new_status": req.new_status,
        "session_id": req.session_id,
    }
