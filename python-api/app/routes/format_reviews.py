"""Platform-admin report-format review inbox."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.routes.routes import _storage_path_from_reference
from app.services.auth import AuthCaller, Caller, forbidden, require_platform_admin
from app.services.database import get_client
from app.services.notify import notify_russ

router = APIRouter()

ReviewStatus = Literal["new", "mapping", "ready_for_validation", "ready"]
_PDF_TTL_SECONDS = 60


class ReviewUpdate(BaseModel):
    status: ReviewStatus
    notes: str = Field(default="", max_length=5000)


@router.post("/admin/report-formats/test-notification")
def test_report_format_notification(caller: Caller = AuthCaller):
    require_platform_admin(caller)
    delivered = notify_russ(
        "StockerAI report-format alert test\n"
        "The direct Telegram Bot API connection is working."
    )
    if not delivered:
        raise HTTPException(
            status_code=503,
            detail="Telegram did not confirm delivery. Check the Render Telegram settings and bot access.",
        )
    return {"delivered": True}


def _review_row(db, review_id: str) -> dict:
    result = (
        db.table("pending_unrecognized_formats")
        .select(
            "id,account_id,user_id,account_email,vendor,filename,pdf_url,reason,"
            "status,created_at,updated_at,review_notes"
        )
        .eq("id", review_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise forbidden()
    return result.data[0]


@router.get("/admin/report-formats")
def list_report_formats(caller: Caller = AuthCaller):
    require_platform_admin(caller)
    db = get_client()
    result = (
        db.table("pending_unrecognized_formats")
        .select(
            "id,account_id,user_id,account_email,vendor,filename,reason,status,"
            "created_at,updated_at,review_notes,pdf_url"
        )
        .order("created_at", desc=True)
        .execute()
    )
    rows = result.data or []
    account_ids = sorted({row.get("account_id") for row in rows if row.get("account_id")})
    accounts = {}
    if account_ids:
        account_result = (
            db.table("accounts")
            .select("id,name,report_source,report_source_name,report_format_status")
            .in_("id", account_ids)
            .execute()
        )
        accounts = {row["id"]: row for row in account_result.data or []}

    return {
        "items": [
            {
                "id": row["id"],
                "account_id": row.get("account_id"),
                "account_name": (accounts.get(row.get("account_id")) or {}).get("name"),
                "account_email": row.get("account_email"),
                "vendor": row.get("vendor"),
                "filename": row.get("filename"),
                "reason": row.get("reason"),
                "status": row.get("status") or "new",
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "review_notes": row.get("review_notes") or "",
                "pdf_available": bool(row.get("pdf_url")),
            }
            for row in rows
        ]
    }


@router.get("/admin/report-formats/{review_id}/pdf-url")
def get_report_format_pdf(review_id: str, caller: Caller = AuthCaller):
    require_platform_admin(caller)
    db = get_client()
    row = _review_row(db, review_id)
    if not row.get("pdf_url"):
        raise HTTPException(status_code=404, detail="The submitted PDF is not available.")
    try:
        path = _storage_path_from_reference(row["pdf_url"])
        signed = db.storage.from_("route-pdfs").create_signed_url(path, _PDF_TTL_SECONDS)
        signed_url = signed.get("signedURL")
        if not signed_url:
            raise ValueError("missing signed URL")
    except Exception:
        raise HTTPException(status_code=503, detail="Could not open the submitted PDF. Try again.") from None
    return {"url": signed_url, "expires_in": _PDF_TTL_SECONDS}


@router.patch("/admin/report-formats/{review_id}")
def update_report_format(review_id: str, update: ReviewUpdate, caller: Caller = AuthCaller):
    require_platform_admin(caller)
    db = get_client()
    try:
        result = db.rpc("update_report_format_review", {
            "p_item_id": review_id,
            "p_reviewer_id": caller.user_id,
            "p_status": update.status,
            "p_notes": update.notes.strip() or None,
        }).execute().data
    except Exception as exc:
        if getattr(exc, "code", None) == "42501":
            raise forbidden() from None
        if getattr(exc, "code", None) == "22023":
            raise HTTPException(status_code=400, detail="Choose a valid report status.") from None
        raise HTTPException(status_code=503, detail="The report status could not be saved. Try again.") from None
    if not isinstance(result, dict) or result.get("id") != review_id:
        raise HTTPException(status_code=503, detail="The report status update could not be confirmed.")
    return result
