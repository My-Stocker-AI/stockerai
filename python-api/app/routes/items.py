"""
Core item flow endpoints:
  POST /api/get-next-item  — replaces n8n get_next_item (Optimized) workflow
  POST /api/start-machine  — replaces n8n start_machine workflow
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.services.database import get_client, rpc
from app.services.formatting import (
    parse_product,
    format_slot_for_tts,
    format_item_for_response,
    generate_spoken_next_item,
    generate_spoken_next_machine,
    generate_spoken_complete,
    generate_display_text,
    generate_start_machine_voice,
    generate_start_machine_display,
)

router = APIRouter()


# ─── Request Models ───────────────────────────────────────────────────────────


class GetNextItemRequest(BaseModel):
    session_id: str
    user_id: str
    date: str | None = None
    count: int = Field(1, ge=1, le=2)  # 1- or 2-pick only; reject malformed counts


class StartMachineRequest(BaseModel):
    session_id: str
    user_id: str
    direction: str  # "beginning" or "end"
    count: int = Field(1, ge=1, le=2)  # 1- or 2-pick only; reject malformed counts


# ─── GET NEXT ITEM ────────────────────────────────────────────────────────────


@router.post("/get-next-item")
def get_next_item(req: GetNextItemRequest):
    """
    Calls atomic RPC get_next_item_and_increment, then formats output.
    Replaces: n8n workflow iykbFj7f9222PF7r (4 nodes).
    """
    # Step 1: Call atomic RPC (same as Edge Function get-next-item-data)
    try:
        data = rpc("get_next_item_and_increment", {
            "p_user_id": req.user_id,
            "p_count": req.count,
        })
    except Exception as e:
        err_str = str(e)
        # Parse Postgres RAISE EXCEPTION messages (e.g., 'No active session found')
        if "No active session" in err_str:
            raise HTTPException(status_code=404, detail="No active session found")
        raise HTTPException(status_code=500, detail=err_str)

    if not data:
        raise HTTPException(status_code=404, detail="No active session found")

    row = data[0]
    action = row["action"]

    # Step 2: Mark completed machine as 'completed' in database
    db = get_client()
    if row.get("machine_complete") and row.get("session_record_id"):
        # Session still points to the completed machine — get its ID before updating
        session_result = (
            db.table("sessions")
            .select("current_machine_id")
            .eq("id", row["session_record_id"])
            .limit(1)
            .execute()
        )
        if session_result.data and session_result.data[0].get("current_machine_id"):
            db.table("machines").update({
                "status": "completed"
            }).eq("id", session_result.data[0]["current_machine_id"]).execute()

    # Step 3: Update session current_machine_id if RPC indicates change
    if row.get("new_machine_id") and row.get("session_record_id"):
        db.table("sessions").update({
            "current_machine_id": row["new_machine_id"],
        }).eq("id", row["session_record_id"]).execute()

    # Step 3b: Mark the session 'completed' when the route finishes. The old Edge
    # Function did this server-side; the RPC returns the complete action but never
    # updates the session, leaving it stuck 'stocking' — which then collides with
    # the next route start and blocks deleting the route. (n8n->Python regression.)
    if action == "complete" and row.get("session_record_id"):
        db.table("sessions").update({
            "status": "completed",
        }).eq("id", row["session_record_id"]).execute()

    # Step 4: Format output based on action type
    if action == "next_item":
        return _format_next_item(row, req.count)
    elif action == "next_machine":
        return _format_next_machine(row)
    elif action == "complete":
        return _format_complete(row)
    else:
        raise HTTPException(status_code=500, detail=f"Unknown action: {action}")


def _format_next_item(row: dict, count: int) -> dict:
    """Format next_item action response."""
    parsed = parse_product(row.get("product_name"))
    parsed2 = parse_product(row.get("product_name2")) if row.get("product_name2") else None

    # Build data dict for voice generation
    voice_data = {
        "product_name": row.get("product_name"),
        "quantity": row.get("quantity"),
        "product_name2": row.get("product_name2"),
        "quantity2": row.get("quantity2"),
        "action": "next_item",
        "items_remaining": row.get("items_remaining"),
    }

    output = {
        "action": "next_item",
        "machine_complete": row.get("machine_complete", False),
        "route_complete": row.get("route_complete", False),
        "session_complete": row.get("session_complete", False),
        "machine_id": row.get("machine_id"),
        "machine_name": row.get("machine_name", ""),
        "items_remaining": row.get("items_remaining"),
        "new_item_index": row.get("new_item_index"),
        "items_to_increment": row.get("items_to_increment"),
        "new_completed_items": row.get("new_completed_items"),
        "total_items": row.get("total_items"),
        "item1": format_item_for_response(
            product_name=row.get("product_name", ""),
            quantity=row.get("quantity", 0),
            slot=row.get("slot"),
            slot_spoken=row.get("slot_spoken"),
            inventory_current=row.get("inventory_current", 0),
            inventory_parlevel=row.get("inventory_parlevel", 0),
            parsed=parsed,
        ),
    }

    # Item 2 (2-pick mode)
    if row.get("product_name2") and parsed2:
        output["item2"] = format_item_for_response(
            product_name=row.get("product_name2", ""),
            quantity=row.get("quantity2", 0),
            slot=row.get("slot2"),
            slot_spoken=row.get("slot_spoken2"),
            inventory_current=row.get("inventory_current2", 0),
            inventory_parlevel=row.get("inventory_parlevel2", 0),
            parsed=parsed2,
        )

    output["display_text"] = generate_display_text(voice_data, parsed, parsed2)
    output["voice_text"] = generate_spoken_next_item(voice_data, parsed, parsed2)
    output["spoken"] = output["voice_text"]

    return output


def _format_next_machine(row: dict) -> dict:
    """Format next_machine action response."""
    voice_data = {
        "completed_machine": row.get("completed_machine"),
        "next_machine": row.get("next_machine"),
        "next_location": row.get("next_location"),
        "returning_to_skipped": row.get("returning_to_skipped", False),
    }

    return {
        "action": "next_machine",
        "machine_complete": True,
        "route_complete": False,
        "session_complete": False,
        "completed_machine": row.get("completed_machine"),
        "completed_location": row.get("completed_location"),
        "next_machine": row.get("next_machine"),
        "next_machine_id": row.get("next_machine_id"),
        "next_machine_number": row.get("next_machine_number"),
        "next_location": row.get("next_location"),
        "returning_to_skipped": row.get("returning_to_skipped", False),
        "items_to_increment": row.get("items_to_increment"),
        "voice_text": generate_spoken_next_machine(voice_data),
        "spoken": generate_spoken_next_machine(voice_data),
    }


def _format_complete(row: dict) -> dict:
    """Format route complete action response."""
    voice_data = {
        "completed_route": row.get("completed_route"),
    }

    return {
        "action": "complete",
        "machine_complete": True,
        "route_complete": True,
        "session_complete": True,
        "completed_route": row.get("completed_route"),
        "total_routes": row.get("total_routes"),
        "items_to_increment": row.get("items_to_increment"),
        "message": "All routes finished",
        "voice_text": generate_spoken_complete(voice_data),
        "spoken": generate_spoken_complete(voice_data),
    }


# ─── START MACHINE ────────────────────────────────────────────────────────────


@router.post("/start-machine")
def start_machine(req: StartMachineRequest):
    """
    Start stocking a machine from top or bottom.
    Replaces: n8n workflow JbKdJuKgGbyvzlF0 (9 nodes).
    """
    db = get_client()

    # Map direction
    pick_direction = "reverse" if req.direction == "end" else "forward"

    # Step 1: Get session
    session_result = (
        db.table("sessions")
        .select("id, current_machine_id, current_route_id, pick_direction")
        .eq("user_id", req.user_id)
        .eq("status", "stocking")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not session_result.data:
        raise HTTPException(status_code=404, detail="No active session found")

    session = session_result.data[0]
    machine_id = session["current_machine_id"]

    if not machine_id:
        raise HTTPException(status_code=400, detail="Session has no current machine. Select a route first.")

    # Step 2: Get machine
    machine_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name, total_items, completed_items, status")
        .eq("id", machine_id)
        .limit(1)
        .execute()
    )

    if not machine_result.data:
        raise HTTPException(status_code=404, detail="Machine not found")

    machine = machine_result.data[0]

    # Step 3: Get items ordered by sequence
    items_result = (
        db.table("items")
        .select("id, product_name, quantity, slot, sequence, inventory_current, inventory_parlevel")
        .eq("machine_id", machine_id)
        .order("sequence")
        .execute()
    )

    items = items_result.data or []
    if not items:
        raise HTTPException(status_code=404, detail="No items found for machine")

    # Step 4: Select item(s) from the RESUME POINT — not always item 1.
    # `completed_items` is how many items have already been revealed/accounted on
    # this machine: 0 for a fresh machine, but carried forward for a machine being
    # resumed after a skip (go_back leaves status='pending' and preserves the count).
    # `base` is the index to read from. On a retry the machine is already
    # in_progress and `completed` was advanced by the items THIS call shows, so we
    # subtract them back out to recompute the same base — keeping it idempotent
    # (same item, same count), exactly as the old n8n engine's SET behaved.
    completed = machine.get("completed_items", 0) or 0
    already_started = machine.get("status") == "in_progress"
    want = 2 if (req.count == 2 and len(items) > 1) else 1
    base = (completed - want) if already_started else completed
    base = max(0, min(base, len(items) - 1))

    if pick_direction == "forward":
        item1_data = items[base]
        item2_data = items[base + 1] if want == 2 and base + 1 < len(items) else None
    else:
        idx = max(0, len(items) - 1 - base)
        item1_data = items[idx]
        item2_data = items[idx - 1] if want == 2 and idx - 1 >= 0 else None

    # Step 5: Update machine status to in_progress AND pre-count displayed items.
    # Pre-counting is why the first get_next_item RPC returns the NEXT items rather
    # than re-showing these. We SET completed_items = base + items shown (not ADD),
    # so a network retry / double-tap recomputes the same value instead of inflating
    # the count, and a resumed machine continues from its saved progress.
    # (Regression from the n8n->Python rewrite: the old engine SET; the rewrite ADDed
    # from item 1, which both re-announced stocked items and double-counted.)
    items_shown = 1 + (1 if item2_data else 0)
    new_completed = base + items_shown
    db.table("machines").update({
        "status": "in_progress",
        "completed_items": new_completed,
    }).eq("id", machine_id).execute()

    # Step 6: Update session pick_direction and current_machine_id
    db.table("sessions").update({
        "pick_direction": pick_direction,
        "current_machine_id": machine_id,
    }).eq("id", session["id"]).execute()

    # Step 7: Format output
    parsed = parse_product(item1_data["product_name"])
    parsed2 = parse_product(item2_data["product_name"]) if item2_data else None

    new_item_index = item1_data["sequence"]

    output = {
        "action": "item_ready",
        "machine_complete": False,
        "route_complete": False,
        "session_complete": False,
        "machine_id": machine_id,
        "machine_name": machine.get("machine_name", ""),
        "items_remaining": max(0, (machine.get("total_items") or 0) - new_completed),
        "new_completed_items": new_completed,
        "total_items": machine["total_items"],
        "direction": pick_direction,
        "new_item_index": new_item_index,
        "item1": format_item_for_response(
            product_name=item1_data["product_name"],
            quantity=item1_data["quantity"],
            slot=item1_data.get("slot"),
            slot_spoken=item1_data.get("slot_spoken"),
            inventory_current=item1_data.get("inventory_current", 0),
            inventory_parlevel=item1_data.get("inventory_parlevel", 0),
            parsed=parsed,
        ),
    }

    if item2_data and parsed2:
        output["item2"] = format_item_for_response(
            product_name=item2_data["product_name"],
            quantity=item2_data["quantity"],
            slot=item2_data.get("slot"),
            slot_spoken=item2_data.get("slot_spoken"),
            inventory_current=item2_data.get("inventory_current", 0),
            inventory_parlevel=item2_data.get("inventory_parlevel", 0),
            parsed=parsed2,
        )

    quantity2 = item2_data["quantity"] if item2_data else None
    output["voice_text"] = generate_start_machine_voice(
        pick_direction, parsed, item1_data["quantity"], parsed2, quantity2
    )
    output["display_text"] = generate_start_machine_display(
        pick_direction, parsed, item1_data["quantity"], parsed2, quantity2
    )
    output["spoken"] = output["voice_text"]

    return output


# ─── RESUME STATE (read-only complete snapshot) ───────────────────────────────


class ResumeStateRequest(BaseModel):
    user_id: str


def _item_at_sequence(db, machine_id: str, seq) -> dict | None:
    """Read one item by sequence and format it for the response (no increment)."""
    if seq is None or seq < 1:
        return None
    rows = (
        db.table("items")
        .select("product_name, quantity, slot, sequence, inventory_current, inventory_parlevel")
        .eq("machine_id", machine_id)
        .eq("sequence", seq)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    it = rows[0]
    parsed = parse_product(it.get("product_name"))
    return format_item_for_response(
        product_name=it.get("product_name", ""),
        quantity=it.get("quantity", 0),
        slot=it.get("slot"),
        slot_spoken=None,
        inventory_current=it.get("inventory_current", 0),
        inventory_parlevel=it.get("inventory_parlevel", 0),
        parsed=parsed,
    )


@router.post("/resume-state")
def resume_state(req: ResumeStateRequest):
    """
    READ-ONLY complete snapshot for RESUME — restores the exact state at stop/pause and
    advances NOTHING. The frontend rehydrates the picking screen from this; the next
    'Next' continues via the normal RPC. Resume never re-runs the start-route /
    top-or-bottom flow, so the saved direction + position carry through unchanged.

    Position model (matches get_next_item_and_increment exactly):
      - completed_items counts every item already revealed (incl. the one on screen).
      - On-screen ("current") item = the LAST revealed:
          forward -> sequence = completed_items
          reverse -> sequence = total_items - completed_items + 1
      - The done-list is the (completed_items - 1) items revealed before it, in pick order.
    """
    db = get_client()

    session = (
        db.table("sessions")
        .select("id, current_route_id, current_machine_id, pick_direction, status")
        .eq("user_id", req.user_id)
        .eq("status", "stocking")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not session.data:
        return {"has_session": False}
    s = session.data[0]
    route_id = s.get("current_route_id")
    if not route_id:
        return {"has_session": False}

    route = (
        db.table("routes")
        .select("id, route_name, delivery_date, total_machines, total_items")
        .eq("id", route_id).limit(1).execute().data
    )
    if not route:
        return {"has_session": False}
    r = route[0]

    machines = (
        db.table("machines")
        .select("id, machine_name, location_name, sequence, total_items, completed_items, status")
        .eq("route_id", route_id).order("sequence").execute().data or []
    )
    if not machines:
        return {"has_session": False}

    cur_mid = s.get("current_machine_id") or machines[0]["id"]
    cur = next((m for m in machines if m["id"] == cur_mid), machines[0])
    direction = s.get("pick_direction") or "forward"
    completed = cur.get("completed_items") or 0
    total = cur.get("total_items") or 0

    current_item = None
    done_list = []
    if completed > 0:
        if direction == "forward":
            cur_seq = completed
            done_seqs = list(range(1, completed))                      # 1 .. completed-1
        else:  # reverse
            cur_seq = total - completed + 1
            done_seqs = list(range(total, total - completed + 1, -1))  # total .. cur_seq+1
        current_item = _item_at_sequence(db, cur_mid, cur_seq)
        for sq in done_seqs:
            it = _item_at_sequence(db, cur_mid, sq)
            if it:
                done_list.append(it)

    machine_index = next((i + 1 for i, m in enumerate(machines) if m["id"] == cur_mid), 1)

    return {
        "has_session": True,
        "session_id": s["id"],
        "route": {
            "id": r["id"], "route_name": r["route_name"], "route_date": r["delivery_date"],
            "total_machines": r.get("total_machines"), "total_items": r.get("total_items"),
        },
        "machines": [
            {
                "id": m["id"], "name": m["machine_name"], "location": m["location_name"],
                "sequence": m["sequence"], "totalItems": m["total_items"],
                "completedItems": m["completed_items"], "status": m["status"],
            } for m in machines
        ],
        "current_machine": {
            "id": cur["id"], "name": cur["machine_name"],
            "total_items": total, "completed_items": completed,
            "items_remaining": max(0, total - completed),
        },
        "current_machine_index": machine_index,
        "pick_direction": direction,
        "current_item": current_item,
        "completed_list": done_list,
        "items_remaining": max(0, total - completed),
    }
