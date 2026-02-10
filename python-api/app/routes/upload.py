"""
PDF upload endpoint:
  POST /api/upload-pdf — replaces n8n PDF Upload workflow (7kO6o1wASKvbhc2U, 16 nodes)
"""

import uuid
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

    # Step 3: Parse PDF text into structured data
    parsed = parse_route_pdf(text, date)

    if not parsed["route_name"]:
        raise HTTPException(status_code=400, detail="Could not find route information in PDF")

    if not parsed["locations"]:
        raise HTTPException(status_code=400, detail="No machines/items found in PDF")

    route_name = parsed["route_name"]

    # Step 4: Delete existing route with same name+date for this user (if any)
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

    # Step 5: Insert route
    route_insert = (
        db.table("routes")
        .insert({
            "user_id": user_id,
            "route_name": route_name,
            "delivery_date": date,
        })
        .execute()
    )

    route_id = route_insert.data[0]["id"]

    # Step 6: Insert machines and items
    total_machines = 0
    total_items = 0
    machine_sequence = 0

    for location in parsed["locations"]:
        for machine_data in location["machines"]:
            machine_sequence += 1
            items_list = machine_data["items"]

            # Insert machine
            machine_insert = (
                db.table("machines")
                .insert({
                    "route_id": route_id,
                    "machine_name": machine_data["machine_name"],
                    "machine_number": machine_data.get("asset_number", 0),
                    "location_name": location["location_name"],
                    "sequence": machine_sequence,
                    "total_items": len(items_list),
                    "completed_items": 0,
                    "status": "pending",
                })
                .execute()
            )

            machine_id = machine_insert.data[0]["id"]
            total_machines += 1

            # Insert items with sequence numbers
            items_to_insert = []
            for idx, item in enumerate(items_list, start=1):
                items_to_insert.append({
                    "machine_id": machine_id,
                    "product_name": item["product_name"],
                    "quantity": item["quantity"],
                    "slot": item["slot"],
                    "sequence": idx,
                    "inventory_current": item.get("inventory_current", 0),
                    "inventory_parlevel": item.get("inventory_parlevel", 0),
                })

            if items_to_insert:
                db.table("items").insert(items_to_insert).execute()
                total_items += len(items_to_insert)

    return {
        "route": route_name,
        "machines": total_machines,
        "items": total_items,
        "date": date,
    }
