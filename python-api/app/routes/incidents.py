"""Durable, tenant-bound user incident reports with optional admin email."""

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.auth import AuthCaller, Caller, assert_route_in_account, is_uuid_like
from app.services.database import get_client
from app.services.incident_notify import send_incident_email

router = APIRouter()


class IncidentReport(BaseModel):
    client_report_id: UUID
    description: str = Field(min_length=3, max_length=2000)
    session_id: str | None = Field(default=None, max_length=120)
    route_id: str | None = Field(default=None, max_length=80)
    context: dict[str, Any] = Field(default_factory=dict)


def _bounded_context(context: dict[str, Any]) -> dict[str, Any]:
    encoded = json.dumps(context, default=str)
    if len(encoded.encode("utf-8")) > 64_000:
        raise HTTPException(status_code=413, detail="The incident report is too large.")
    return context


@router.post("/incidents", status_code=201)
def create_incident(report: IncidentReport, caller: Caller = AuthCaller):
    db = get_client()
    route_id = report.route_id if is_uuid_like(report.route_id) else None
    if route_id:
        assert_route_in_account(db, route_id, caller)

    profile_result = (
        db.table("profiles").select("email, first_name, last_name")
        .eq("id", caller.user_id).limit(1).execute()
    )
    profile = (profile_result.data or [{}])[0]
    reporter = {
        "email": profile.get("email"),
        "name": " ".join(filter(None, [profile.get("first_name"), profile.get("last_name")])).strip(),
    }
    incident_id = str(report.client_report_id)
    row = {
        "id": incident_id,
        "account_id": caller.account_id,
        "reporter_user_id": caller.user_id,
        "route_id": route_id,
        "client_session_id": report.session_id,
        "description": report.description.strip(),
        "context": _bounded_context(report.context),
        "status": "open",
        "notification_status": "pending",
    }
    try:
        inserted = db.table("support_incidents").upsert(
            row, on_conflict="id", ignore_duplicates=True
        ).execute()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Could not save the report. It will retry when connected.",
        ) from None

    if not inserted.data:
        existing = (
            db.table("support_incidents").select("notification_status")
            .eq("id", incident_id).eq("reporter_user_id", caller.user_id)
            .limit(1).execute()
        )
        if not existing.data:
            raise HTTPException(status_code=409, detail="That report identifier is already in use.")
        status = existing.data[0].get("notification_status")
        return {
            "ok": True,
            "incident_id": incident_id,
            "notification_sent": status == "sent",
            "created": False,
        }

    sent, notification_error = send_incident_email(
        incident_id, reporter, report.context, row["description"]
    )
    try:
        (
            db.table("support_incidents").update({
                "notification_status": "sent" if sent else "failed",
                "notification_error": notification_error,
            }).eq("id", incident_id).eq("reporter_user_id", caller.user_id).execute()
        )
    except Exception:
        pass
    print(
        f"INCIDENT id={incident_id} account={caller.account_id} "
        f"email={'sent' if sent else 'not-sent'}",
        flush=True,
    )
    return {
        "ok": True,
        "incident_id": incident_id,
        "notification_sent": sent,
        "created": True,
    }
