"""
PDF upload endpoint:
  POST /api/upload-pdf — replaces n8n PDF Upload workflow (7kO6o1wASKvbhc2U, 16 nodes)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from app.services.database import get_client
from app.services.pdf_parser import extract_text_from_pdf, parse_route_pdf

router = APIRouter()


@router.post("/upload-pdf")
async def upload_pdf(
    pdf: UploadFile = File(...),
    date: str = Form(...),
    user_id: str = Form(...),
):
    """
    Upload a Canteen/Compass PDF, parse it, and insert route/machines/items.
    """
    db = get_client()

    # Step 1: Read PDF and extract text
    pdf_bytes = await pdf.read()

    try:
        text = extract_text_from_pdf(pdf_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")

    if not text or len(text) < 50:
        raise HTTPException(status_code=400, detail="PDF appears empty or unreadable")

    # Step 2: Parse PDF text into structured data
    parsed = parse_route_pdf(text, date)

    if not parsed["route_name"]:
        raise HTTPException(status_code=400, detail="Could not find route information in PDF")

    if not parsed["locations"]:
        raise HTTPException(status_code=400, detail="No machines/items found in PDF")

    route_name = parsed["route_name"]

    # Step 3: Delete existing route with same name+date for this user (if any)
    existing_routes = (
        db.table("routes")
        .select("id")
        .eq("user_id", user_id)
        .eq("route_name", route_name)
        .eq("delivery_date", date)
        .execute()
    )

    for existing in existing_routes.data or []:
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
            "route_name": route_name,
            "delivery_date": date,
            "pdf_url": pdf_url,
            "driver_name": driver_name,
        })
        .execute()
    )

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
                db.table("items").insert(items_to_insert).execute()
                total_items += len(items_to_insert)

    # Step 7: Update route totals
    db.table("routes").update({
        "total_machines": total_machines,
        "total_items": total_items,
    }).eq("id", route_id).execute()

    return {
        "route": route_name,
        "machines": total_machines,
        "items": total_items,
        "date": date,
        "pdf_url": pdf_url,
    }


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
            slot_display = f"{slots[0]} to {slots[-1]}"

        result.append({
            "product_name": group["product_name"],
            "quantity": group["quantity"],
            "slot": slot_display,
            "inventory_current": group["inventory_current"],
            "inventory_parlevel": group["inventory_parlevel"],
        })

    return result
