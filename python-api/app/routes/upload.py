"""
PDF upload endpoint:
  POST /api/upload-pdf — replaces n8n PDF Upload workflow (7kO6o1wASKvbhc2U, 16 nodes)
"""

import hashlib
import re
from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from app.config import SUPABASE_URL
from app.services.auth import AuthCaller, Caller, resolve_target_user
from app.services.database import get_client
from app.services.pdf_parser import extract_text_from_pdf, parse_route_pdf
from app.services.notify import notify_russ

router = APIRouter()

# Vending management systems we present in the upload dropdown. "Other" (and any
# report we can't parse) routes to the capture-and-wait holding pen.
SUPPORTED_VENDORS = {
    "Parlevel", "Nayax", "Cantaloupe/Seed", "Gimme",
    "VendSoft", "VendSys", "Vagabond", "Vend-Trak", "VendMAX",
}

_SUPABASE_STORAGE_BASE = f"{SUPABASE_URL}/storage/v1/object/public/route-pdfs"


def _safe_storage_name(value: str | None, fallback: str) -> str:
    """Return a short, path-free ASCII object-name component."""
    basename = (value or fallback).replace("\\", "/").split("/")[-1]
    sanitized = re.sub(r"[^A-Za-z0-9._-]", "_", basename).strip(".")[:120]
    return sanitized or fallback


def _require_upload_capability(db, caller: Caller) -> None:
    """Refuse before parsing or Storage side effects.

    The transactional database function repeats this check as the authority for the
    route mutation. This preflight exists because the PDF object must be uploaded before
    that transaction receives its reference; a denied caller must not be able to create
    orphaned Storage objects first.
    """
    try:
        membership = (
            db.table("account_users")
            .select("role, can_upload_routes")
            .eq("account_id", caller.account_id)
            .eq("user_id", caller.user_id)
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Could not verify route-upload access. Try again.",
        ) from None

    row = membership.data[0] if membership.data else {}
    if row.get("role") != "primary_admin" and row.get("can_upload_routes") is not True:
        raise HTTPException(status_code=403, detail="Not available on this account.")


def _remove_uncommitted_pdf(db, storage_path: str) -> None:
    """Best-effort cleanup only after a definite transaction refusal.

    Unknown transport failures deliberately do not call this: the transaction might have
    committed even if its response was lost, in which case deleting the object would break
    the newly saved route.
    """
    try:
        db.storage.from_("route-pdfs").remove([storage_path])
    except Exception:
        pass


def _capture_pending(
    db,
    pdf_bytes: bytes,
    user_id: str,
    vendor,
    filename: str,
    reason: str,
    operation_id: str,
    caller: Caller,
) -> dict:
    """Durably and idempotently capture an unsupported format for review."""
    safe_name = _safe_storage_name(filename, "upload.pdf")
    request_hash = hashlib.sha256(
        pdf_bytes
        + b"\0"
        + user_id.encode()
        + b"\0"
        + (vendor or "").encode()
        + b"\0"
        + reason.encode()
    ).hexdigest()
    storage_path = f"pending/{user_id}/{operation_id}-{request_hash}-{safe_name}"
    try:
        db.storage.from_("route-pdfs").upload(
            storage_path, pdf_bytes, {"content-type": "application/pdf", "upsert": "true"}
        )
        pdf_url = f"{_SUPABASE_STORAGE_BASE}/{storage_path}"
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="The report could not be saved for review. Please retry.",
        ) from None

    # Look up the operator's email so Russ can follow up.
    account_email = None
    try:
        pr = db.table("profiles").select("email").eq("id", user_id).limit(1).execute()
        if pr.data:
            account_email = pr.data[0].get("email")
    except Exception:
        pass

    # Record the queue item transactionally. The operation id makes a lost response retry
    # return the existing row rather than creating a duplicate review request.
    try:
        queue_result = db.rpc("record_pending_format_upload", {
            "p_operation_id": operation_id,
            "p_caller_id": caller.user_id,
            "p_account_id": caller.account_id,
            "p_user_id": user_id,
            "p_request_hash": request_hash,
            "p_account_email": account_email,
            "p_vendor": vendor,
            "p_filename": filename,
            "p_pdf_url": pdf_url,
            "p_reason": reason,
        }).execute().data
    except Exception as exc:
        code = getattr(exc, "code", None)
        if code in {"22023", "42501", "55000"}:
            _remove_uncommitted_pdf(db, storage_path)
        if code == "42501":
            raise HTTPException(status_code=403, detail="Not available on this account.") from None
        if code in {"22023", "55000"}:
            raise HTTPException(
                status_code=409,
                detail="The review upload could not be safely matched to this request. Please choose the file again.",
            ) from None
        raise HTTPException(
            status_code=503,
            detail="The report could not be added to the review queue. Please retry.",
        ) from None

    if (
        not isinstance(queue_result, dict)
        or not queue_result.get("pending_id")
        or not isinstance(queue_result.get("created"), bool)
    ):
        raise HTTPException(
            status_code=503,
            detail="The report review request could not be confirmed. Please retry.",
        )

    # Ping Russ only for the first committed queue row. Notification remains best-effort.
    if queue_result.get("created") is True:
        notify_russ(
            "New format to add — StockerAI\n"
            f"System: {vendor or 'Unknown'}\n"
            f"From: {account_email or user_id}\n"
            f"File: {filename}\n"
            f"Why: {reason}"
        )

    return {
        "status": "pending_format",
        "vendor": vendor,
        "filename": filename,
        "message": (
            "We've got your report and we're setting up support for your format. "
            "We'll email you the moment it's ready."
        ),
    }


@router.post("/upload-pdf")
async def upload_pdf(
    pdf: UploadFile = File(...),
    date: str = Form(...),
    for_user_id: str = Form(None, alias="user_id"),
    vendor: str = Form(None),
    operation_id: UUID | None = Form(None),
    caller: Caller = AuthCaller,
):
    """
    Upload a route PDF, parse it, and insert route/machines/items.

    Today we parse the Parlevel "Prekitting Detail" layout. Anything we can't turn
    into a route — or an explicit "Other" vendor selection — is routed to the
    capture-and-wait holding pen instead of dead-ending on an error.

    The upload screen deliberately lets an admin load tomorrow's route FOR one of their
    drivers, so a named driver is honoured — but only one inside the caller's own account.
    A name from outside it is refused, and naming nobody uploads for yourself.
    """
    db = get_client()

    # From here down, user_id is the driver the route will belong to: either the caller, or
    # a teammate they are allowed to act for. It is never simply whatever the body claimed.
    user_id = resolve_target_user(caller, for_user_id)
    if operation_id is None:
        raise HTTPException(
            status_code=409,
            detail="Reload StockerAI before uploading so the route can be saved safely.",
        )
    request_operation_id = str(operation_id)

    # Enforce capability before even reading or retaining the supplied file. The RPC repeats
    # the check transactionally so a role change between these steps still fails closed.
    _require_upload_capability(db, caller)

    # Step 1: Read PDF and extract text
    pdf_bytes = await pdf.read()
    filename = pdf.filename or "upload.pdf"

    # Real route PDFs are ~150 KB; cap the size so an oversized upload can't exhaust
    # server memory.
    MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF too large (max 25 MB).")

    # The operator told us their system isn't one we support yet → capture-and-wait.
    if vendor and vendor.strip().lower() == "other":
        return _capture_pending(
            db, pdf_bytes, user_id, vendor, filename,
            "vendor_other", request_operation_id, caller,
        )

    # Try to read the report. A file we can't extract text from (scanned/image/corrupt)
    # is a format we don't handle — capture it rather than error out.
    try:
        text = extract_text_from_pdf(pdf_bytes)
    except Exception:
        return _capture_pending(
            db, pdf_bytes, user_id, vendor, filename,
            "unreadable_pdf", request_operation_id, caller,
        )

    if not text or len(text) < 50:
        return _capture_pending(
            db, pdf_bytes, user_id, vendor, filename,
            "empty_or_unreadable", request_operation_id, caller,
        )

    # Step 2: Parse PDF text into structured data
    parsed = parse_route_pdf(text, date)

    # Recognized format but no route/machines found → treat as an unsupported layout.
    if not parsed["route_name"] or not parsed["locations"]:
        return _capture_pending(
            db, pdf_bytes, user_id, vendor, filename,
            "unrecognized_format", request_operation_id, caller,
        )

    route_name = parsed["route_name"]

    request_hash = hashlib.sha256(
        pdf_bytes + b"\0" + date.encode() + b"\0" + user_id.encode() + b"\0" +
        (vendor or "").encode()
    ).hexdigest()

    # Upload to an operation-specific object before changing database state. A failed
    # database transaction can leave an unreferenced private object, but it can no longer
    # overwrite the PDF belonging to the still-valid old route.
    storage_path = (
        f"{user_id}/{date}/{request_operation_id}-{request_hash}-"
        f"{_safe_storage_name(route_name, 'route')}.pdf"
    )
    try:
        db.storage.from_("route-pdfs").upload(storage_path, pdf_bytes, {
            "content-type": "application/pdf",
            # The request hash makes this safe: a retry can replace only the byte-identical
            # request's object, while a reused operation id with different content gets a
            # different path and is rejected by the transaction below.
            "upsert": "true",
        })
        pdf_url = f"{_SUPABASE_STORAGE_BASE}/{storage_path}"
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="The route report could not be stored. Your previous route is unchanged; please retry.",
        ) from None

    # Get driver name from profile (optional — don't fail upload)
    driver_name = None
    try:
        profile_result = (
            db.table("profiles")
            .select("first_name, last_name")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if profile_result.data:
            p = profile_result.data[0]
            first = p.get("first_name") or ""
            last = p.get("last_name") or ""
            driver_name = f"{first} {last}".strip() or None
    except Exception:
        pass

    # Flatten the parser result into the exact payload accepted by the transactional RPC.
    machines = []
    machine_sequence = 0

    for location in parsed["locations"]:
        for machine_data in location["machines"]:
            machine_sequence += 1
            raw_items = machine_data["items"]

            # Combine ALL same-product items (matches n8n Flatten Data behavior)
            combined_items = _combine_same_product_items(raw_items)
            machine_name = machine_data["machine_name"]
            items = []
            for idx, item in enumerate(combined_items, start=1):
                items.append({
                    "product_name": item["product_name"],
                    "quantity": item["quantity"],
                    "slot": item["slot"],
                    "sequence": idx,
                    "status": "pending",
                    "inventory_current": item.get("inventory_current", 0),
                    "inventory_parlevel": item.get("inventory_parlevel", 0),
                })
            machines.append({
                "machine_name": machine_name,
                "machine_number": machine_data.get("asset_number", 0),
                "location_name": location["location_name"],
                "sequence": machine_sequence,
                "items": items,
            })

    if not machines:
        raise HTTPException(status_code=400, detail="No machines with items found in PDF.")

    try:
        result = db.rpc("replace_route_upload", {
            "p_operation_id": request_operation_id,
            "p_caller_id": caller.user_id,
            "p_account_id": caller.account_id,
            "p_driver_id": user_id,
            "p_request_hash": request_hash,
            "p_route_name": route_name,
            "p_delivery_date": date,
            "p_pdf_url": pdf_url,
            "p_driver_name": driver_name,
            "p_machines": machines,
        }).execute().data
    except Exception as exc:
        code = getattr(exc, "code", None)
        message = getattr(exc, "message", "")
        if code == "42501":
            _remove_uncommitted_pdf(db, storage_path)
            raise HTTPException(status_code=403, detail="Not available on this account.") from None
        if message == "Cannot replace a route with an active session.":
            _remove_uncommitted_pdf(db, storage_path)
            raise HTTPException(status_code=409, detail=message) from None
        if code in {"22023", "55000"}:
            _remove_uncommitted_pdf(db, storage_path)
            raise HTTPException(status_code=409, detail="The upload could not be safely matched to this request. Please choose the file again.") from None
        raise HTTPException(
            status_code=503,
            detail="The route could not be saved safely. Your previous route is unchanged; please retry.",
        ) from None

    if not isinstance(result, dict) or not result.get("route_id") or result.get("assignment_confirmed") is not True:
        raise HTTPException(status_code=503, detail="The route save could not be confirmed. Please refresh Routes before retrying.")

    warnings = parsed.get("warnings") or []
    response = {
        **result,
        # Surfaced as a first-class field so the driver SEES partial parses instead
        # of a silent short machine. The frontend can warn loudly when this is > 0.
        "items_dropped": len(warnings),
        "pdf_url": pdf_url,
        "warnings": warnings,
    }

    return response


def _combine_same_product_items(items: list[dict]) -> list[dict]:
    """
    Combine ALL items with the same product_name into one row (not just adjacent).
    Matches n8n Flatten Data behavior: groups by product_name, sums quantities,
    and creates "slot 1 to 3" display for multi-slot items.

    Order preserved by first occurrence of each product_name.
    """
    if not items:
        return []

    # Group by product_name, preserving first-occurrence order
    groups: dict[str, dict] = {}
    order: list[str] = []

    for item in items:
        name = item["product_name"]
        if name not in groups:
            order.append(name)
            groups[name] = {
                "product_name": name,
                "quantity": 0,
                "slots": [],
                "inventory_current": 0,
                "inventory_parlevel": 0,
            }
        groups[name]["quantity"] += item["quantity"]
        groups[name]["slots"].append(item["slot"])
        groups[name]["inventory_current"] += item.get("inventory_current", 0)
        groups[name]["inventory_parlevel"] += item.get("inventory_parlevel", 0)

    # Convert slots list to display string
    result = []
    for name in order:
        group = groups[name]
        slots = group["slots"]
        if len(slots) == 1:
            slot_display = slots[0]
        else:
            # Sort so the range reads low->high. PDF extraction order can be jumbled,
            # producing confusing reverse-looking ranges like "045 to 037".
            ordered = sorted(slots, key=lambda s: (int(s) if s.isdigit() else 1_000_000, s))
            slot_display = f"{ordered[0]} to {ordered[-1]}"

        result.append({
            "product_name": group["product_name"],
            "quantity": group["quantity"],
            "slot": slot_display,
            "inventory_current": group["inventory_current"],
            "inventory_parlevel": group["inventory_parlevel"],
        })

    return result
