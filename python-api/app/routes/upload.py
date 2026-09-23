"""
PDF upload endpoint:
  POST /api/upload-pdf — replaces n8n PDF Upload workflow (7kO6o1wASKvbhc2U, 16 nodes)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
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

_SUPABASE_STORAGE_BASE = "https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs"


def _capture_pending(db, pdf_bytes: bytes, user_id: str, vendor, filename: str, reason: str) -> dict:
    """Capture-and-wait: save an unparseable upload, log who sent it + which system,
    alert Russ, and return a warm 'we'll email you' payload for the operator.

    Every side-effect is best-effort — capture must never itself 500 the upload.
    """
    # Store the raw file so Russ can build a template from it.
    pdf_url = None
    try:
        safe = (filename or "upload.pdf").replace(" ", "_")
        storage_path = f"pending/{user_id}/{safe}"
        db.storage.from_("route-pdfs").upload(
            storage_path, pdf_bytes, {"content-type": "application/pdf", "upsert": "true"}
        )
        pdf_url = f"{_SUPABASE_STORAGE_BASE}/{storage_path}"
    except Exception:
        pass

    # Look up the operator's email so Russ can follow up.
    account_email = None
    try:
        pr = db.table("profiles").select("email").eq("id", user_id).limit(1).execute()
        if pr.data:
            account_email = pr.data[0].get("email")
    except Exception:
        pass

    # Drop it in the review queue.
    try:
        db.table("pending_unrecognized_formats").insert({
            "user_id": user_id,
            "account_email": account_email,
            "vendor": vendor,
            "filename": filename,
            "pdf_url": pdf_url,
            "reason": reason,
        }).execute()
    except Exception:
        pass

    # Ping Russ (best-effort — never fails the upload).
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
        return _capture_pending(db, pdf_bytes, user_id, vendor, filename, "vendor_other")

    # Try to read the report. A file we can't extract text from (scanned/image/corrupt)
    # is a format we don't handle — capture it rather than error out.
    try:
        text = extract_text_from_pdf(pdf_bytes)
    except Exception:
        return _capture_pending(db, pdf_bytes, user_id, vendor, filename, "unreadable_pdf")

    if not text or len(text) < 50:
        return _capture_pending(db, pdf_bytes, user_id, vendor, filename, "empty_or_unreadable")

    # Step 2: Parse PDF text into structured data
    parsed = parse_route_pdf(text, date)

    # Recognized format but no route/machines found → treat as an unsupported layout.
    if not parsed["route_name"] or not parsed["locations"]:
        return _capture_pending(db, pdf_bytes, user_id, vendor, filename, "unrecognized_format")

    route_name = parsed["route_name"]

    # Step 3: Delete existing route with same name+date for this user (if any)
    existing_routes = (
        db.table("routes")
        .select("id")
        .eq("account_id", caller.account_id)
        .eq("user_id", user_id)
        .eq("route_name", route_name)
        .eq("delivery_date", date)
        .execute()
    )

    for existing in existing_routes.data or []:
        # Cascade-delete children (the FK does NOT auto-cascade) so re-uploading a route
        # doesn't orphan the old copy's machines/items.
        old_mids = [m["id"] for m in (db.table("machines").select("id").eq("route_id", existing["id"]).execute().data or [])]
        for mid in old_mids:
            db.table("items").delete().eq("machine_id", mid).execute()
        db.table("machines").delete().eq("route_id", existing["id"]).execute()
        db.table("sessions").delete().eq("current_route_id", existing["id"]).execute()
        db.table("routes").delete().eq("id", existing["id"]).execute()

    # Step 4: Upload PDF to Supabase Storage and get URL
    pdf_url = None
    try:
        storage_path = f"{user_id}/{date}/{route_name.replace(' ', '_')}.pdf"
        db.storage.from_("route-pdfs").upload(storage_path, pdf_bytes, {
            "content-type": "application/pdf",
            "upsert": "true",
        })
        pdf_url = f"https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/{storage_path}"
    except Exception:
        # Storage upload is optional — don't fail the whole upload
        pass

    # Step 5: Get driver name from profile (optional — don't fail upload)
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

    # Step 6: Insert route (with all schema columns)
    route_insert = (
        db.table("routes")
        .insert({
            "user_id": user_id,
            "account_id": caller.account_id,
            "route_name": route_name,
            "delivery_date": date,
            "pdf_url": pdf_url,
            "driver_name": driver_name,
        })
        .execute()
    )

    if not route_insert.data:
        raise HTTPException(status_code=500, detail="Failed to create route in database")
    route_id = route_insert.data[0]["id"]

    # Step 6: Insert machines and items (with denormalized fields)
    total_machines = 0
    total_items = 0
    machine_sequence = 0

    for location in parsed["locations"]:
        for machine_data in location["machines"]:
            machine_sequence += 1
            raw_items = machine_data["items"]

            # Combine ALL same-product items (matches n8n Flatten Data behavior)
            combined_items = _combine_same_product_items(raw_items)

            machine_name = machine_data["machine_name"]

            # Insert machine (includes route_name for denormalized queries)
            machine_insert = (
                db.table("machines")
                .insert({
                    "route_id": route_id,
                    "route_name": route_name,
                    "machine_name": machine_name,
                    "machine_number": machine_data.get("asset_number", 0),
                    "location_name": location["location_name"],
                    "sequence": machine_sequence,
                    "total_items": len(combined_items),
                    "completed_items": 0,
                    "status": "pending",
                })
                .execute()
            )

            if not machine_insert.data:
                db.table("routes").delete().eq("id", route_id).execute()  # don't strand a half-built route
                raise HTTPException(status_code=500, detail=f"Upload failed on machine '{machine_name}'. No partial route was saved — please retry.")
            machine_id = machine_insert.data[0]["id"]
            total_machines += 1

            # Insert items (includes machine_name for denormalized queries)
            items_to_insert = []
            for idx, item in enumerate(combined_items, start=1):
                items_to_insert.append({
                    "machine_id": machine_id,
                    "machine_name": machine_name,
                    "product_name": item["product_name"],
                    "quantity": item["quantity"],
                    "slot": item["slot"],
                    "sequence": idx,
                    "status": "pending",
                    "inventory_current": item.get("inventory_current", 0),
                    "inventory_parlevel": item.get("inventory_parlevel", 0),
                })

            if items_to_insert:
                try:
                    db.table("items").insert(items_to_insert).execute()
                except Exception:
                    db.table("routes").delete().eq("id", route_id).execute()  # don't strand a half-built route
                    raise HTTPException(status_code=500, detail=f"Upload failed saving items for '{machine_name}'. No partial route was saved — please retry.")
                total_items += len(items_to_insert)

    # Guard: if every machine parsed empty, we'd otherwise leave a 0-machine route
    # that the driver sees listed but errors on ("No machines found"). Reject cleanly.
    if total_machines == 0:
        db.table("routes").delete().eq("id", route_id).execute()
        raise HTTPException(status_code=400, detail="No machines with items found in PDF.")

    # Step 7: Update route totals
    db.table("routes").update({
        "total_machines": total_machines,
        "total_items": total_items,
    }).eq("id", route_id).execute()

    warnings = parsed.get("warnings") or []
    response = {
        "route": route_name,
        "machines": total_machines,
        "items": total_items,
        # Surfaced as a first-class field so the driver SEES partial parses instead
        # of a silent short machine. The frontend can warn loudly when this is > 0.
        "items_dropped": len(warnings),
        "date": date,
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
