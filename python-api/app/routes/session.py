from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.database import get_client

router = APIRouter()


class UpdateSessionRequest(BaseModel):
    session_id: str
    user_id: str
    new_status: str


@router.post("/update-session")
def update_session(req: UpdateSessionRequest):
    db = get_client()

    # Find active session for user
    session_result = (
        db.table("sessions")
        .select("id, status")
        .eq("user_id", req.user_id)
        .eq("id", req.session_id)
        .limit(1)
        .execute()
    )

    if not session_result.data:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update session status
    update_result = (
        db.table("sessions")
        .update({"status": req.new_status})
        .eq("id", req.session_id)
        .execute()
    )

    return {
        "success": True,
        "new_status": req.new_status,
        "session_id": req.session_id,
    }
