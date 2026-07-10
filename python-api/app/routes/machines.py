"""
Machine management endpoints:
  POST /api/skip-machine        — replaces n8n skip_current_machine workflow
  POST /api/go-back-to-skipped  — replaces n8n go_back_to_skipped workflow
  POST /api/set-route-sequence  — replaces n8n set_route_sequence workflow
"""

import random
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.database import get_client

router = APIRouter()

SKIP_PHRASES = [
    "Got it, skipping {machine}. Moving to {next} at {location}.",
    "No problem! We'll come back to {machine}. Next up: {next} at {location}.",
    "Skipping {machine} for now. Heading to {next} at {location}.",
    "Alright, moving past {machine}. Next is {next} at {location}.",
    "Okay, we'll skip {machine}. On to {next} at {location}.",
]


# ─── Request Models ───────────────────────────────────────────────────────────


class SkipMachineRequest(BaseModel):
    session_id: str
    user_id: str


class GoBackToSkippedRequest(BaseModel):
    session_id: str
    user_id: str


class SetRouteSequenceRequest(BaseModel):
    session_id: str
    user_id: str
    route_name: str
    date: str  # YYYY-MM-DD


# ─── SKIP MACHINE ────────────────────────────────────────────────────────────


@router.post("/skip-machine")
def skip_machine(req: SkipMachineRequest):
    """
    Mark current machine as skipped and move to next.
    Replaces: n8n workflow ElCSMeguJNxwp0HO (11 nodes).
    """
    db = get_client()

    # Step 1: Get active session
    session = _get_active_session(db, req.user_id)
    machine_id = session["current_machine_id"]
    route_id = session["current_route_id"]

    # Guard: a session can exist with no machine selected yet (route picked but
    # start_machine never ran). Without this, the query below silently 404s with a
    # confusing "Current machine not found" instead of the real cause.
    if not machine_id:
        raise HTTPException(status_code=400, detail="No machine selected yet. Say a route to start.")

    # Step 2: Get current machine
    machine_result = (
        db.table("machines")
        .select("id, machine_name, sequence, status, completed_items")
        .eq("id", machine_id)
        .limit(1)
        .execute()
    )

    if not machine_result.data:
        raise HTTPException(status_code=404, detail="Current machine not found")

    current_machine = machine_result.data[0]

    if current_machine["status"] == "skipped":
        raise HTTPException(status_code=400, detail="Machine is already skipped")

    if current_machine["status"] == "completed":
        raise HTTPException(status_code=400, detail="Machine is already completed")

    # Step 3: Mark machine as skipped (trigger auto_set_skipped_at_item handles skipped_at_item)
    db.table("machines").update({"status": "skipped"}).eq("id", machine_id).execute()

    # Step 4: Find next machine with higher sequence (exclude skipped AND completed)
    next_machine_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name, sequence")
        .eq("route_id", route_id)
        .gt("sequence", current_machine["sequence"])
        .filter("status", "not.in", '("skipped","completed")')
        .order("sequence")
        .limit(1)
        .execute()
    )

    if next_machine_result.data:
        next_machine = next_machine_result.data[0]

        # Update session to point to next machine
        db.table("sessions").update({
            "current_machine_id": next_machine["id"],
        }).eq("id", session["id"]).execute()

        phrase = random.choice(SKIP_PHRASES).format(
            machine=current_machine["machine_name"],
            next=next_machine["machine_name"],
            location=next_machine["location_name"],
        )

        return {
            "action": "next_machine",
            "skipped_machine": current_machine["machine_name"],
            "next_machine": next_machine["machine_name"],
            "next_machine_id": next_machine["id"],
            "next_machine_number": next_machine.get("machine_number"),
            "next_location": next_machine["location_name"],
            "voice_text": phrase,
            "spoken": phrase,
            "display": f"Skipped: {current_machine['machine_name']} → Next: {next_machine['machine_name']}",
        }

    # Step 5: No next machine — check for OTHER skipped machines to return to
    # Exclude the machine we just skipped to prevent infinite loop
    skipped_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name")
        .eq("route_id", route_id)
        .eq("status", "skipped")
        .neq("id", machine_id)
        .order("sequence")
        .limit(1)
        .execute()
    )

    if skipped_result.data:
        skipped = skipped_result.data[0]
        db.table("sessions").update({
            "current_machine_id": skipped["id"],
        }).eq("id", session["id"]).execute()

        skip_phrase = f"No more machines ahead. Going back to {skipped['machine_name']} at {skipped['location_name']}. Top or bottom?"
        return {
            "action": "next_machine",
            "skipped_machine": current_machine["machine_name"],
            "next_machine": skipped["machine_name"],
            "next_machine_id": skipped["id"],
            "next_location": skipped["location_name"],
            "voice_text": skip_phrase,
            "spoken": skip_phrase,
            "display": f"Returning to: {skipped['machine_name']}",
        }

    # Step 6: All machines done/skipped — route complete.
    # Mark the session 'completed' here too (same gap as the get_next_item path):
    # without this the session stays 'stocking' and jams the next route.
    db.table("sessions").update({
        "status": "completed",
    }).eq("id", session["id"]).execute()

    complete_phrase = "All machines are done or skipped. Route complete!"
    return {
        "action": "route_complete",
        "voice_text": complete_phrase,
        "spoken": complete_phrase,
    }


# ─── GO BACK TO SKIPPED ──────────────────────────────────────────────────────


@router.post("/go-back-to-skipped")
def go_back_to_skipped(req: GoBackToSkippedRequest):
    """
    Return to the first skipped machine.
    Replaces: n8n workflow rpNfINhjbFCuFrlZ (11 nodes).
    """
    db = get_client()

    # Step 1: Get active session
    session = _get_active_session(db, req.user_id)
    route_id = session["current_route_id"]

    # Step 2: Find first skipped machine ordered by sequence
    skipped_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name, total_items, completed_items")
        .eq("route_id", route_id)
        .eq("status", "skipped")
        .order("sequence")
        .limit(1)
        .execute()
    )

    if not skipped_result.data:
        raise HTTPException(status_code=404, detail="No skipped machines found")

    machine = skipped_result.data[0]

    # Step 3: Count remaining skipped machines (including this one)
    all_skipped = (
        db.table("machines")
        .select("id")
        .eq("route_id", route_id)
        .eq("status", "skipped")
        .execute()
    )
    remaining_skipped = len(all_skipped.data) - 1  # exclude the one we're returning to

    # Step 4: Mark machine as pending
    db.table("machines").update({"status": "pending"}).eq("id", machine["id"]).execute()

    # Step 5: Update session to point to this machine
    db.table("sessions").update({
        "current_machine_id": machine["id"],
    }).eq("id", session["id"]).execute()

    # Step 6: Get first item from this machine for immediate voice announcement
    items_result = (
        db.table("items")
        .select("product_name, quantity, slot")
        .eq("machine_id", machine["id"])
        .order("sequence")
        .limit(1)
        .execute()
    )

    first_item = items_result.data[0] if items_result.data else None

    back_phrase = f"Going back to {machine['machine_name']} at {machine['location_name']}. Say top or bottom to start."
    response = {
        "action": "machine_ready",
        "machine_id": machine["id"],
        "machine_name": machine["machine_name"],
        "machine_number": machine.get("machine_number"),
        "location": machine["location_name"],
        "total_items": machine["total_items"],
        "completed_items": machine["completed_items"],
        "remaining_skipped": remaining_skipped,
        "voice_text": back_phrase,
        "spoken": back_phrase,
        "display": f"Returning to: {machine['machine_name']}",
    }

    if first_item:
        response["first_item"] = first_item["product_name"]
        response["first_quantity"] = first_item["quantity"]
        response["slot"] = first_item["slot"]

    return response


# ─── SET ROUTE SEQUENCE ──────────────────────────────────────────────────────


@router.post("/set-route-sequence")
def set_route_sequence(req: SetRouteSequenceRequest):
    """
    Find route by name, create/update session, return machine list.
    Replaces: n8n workflow 46lMRdxTgD1E3WFz (19 nodes).
    """
    db = get_client()

    # Step 1: Get all user_ids in the same account (team-scoped)
    team_user_ids = _get_team_user_ids(db, req.user_id)

    # Step 2: Find route (exact match first, then partial)
    routes_result = (
        db.table("routes")
        .select("id, route_name, delivery_date")
        .in_("user_id", team_user_ids)
        .eq("delivery_date", req.date)
        .execute()
    )

    routes = routes_result.data or []
    if not routes:
        raise HTTPException(status_code=404, detail=f"No routes found for date {req.date}")

    # Exact match (case-insensitive)
    route = None
    for r in routes:
        if r["route_name"].lower() == req.route_name.lower():
            route = r
            break

    # Partial match if no exact
    if not route:
        for r in routes:
            if req.route_name.lower() in r["route_name"].lower():
                route = r
                break

    if not route:
        available = ", ".join(r["route_name"] for r in routes)
        raise HTTPException(
            status_code=404,
            detail=f"Route '{req.route_name}' not found. Available: {available}",
        )

    route_id = route["id"]

    # Step 3: Pause ALL other active sessions for this user
    db.table("sessions").update({"status": "paused"}).eq(
        "user_id", req.user_id
    ).eq("status", "stocking").execute()

    # Step 4: Upsert session
    session_key = f"stocking_{route_id}"

    # Check for existing session with this key
    existing_session = (
        db.table("sessions")
        .select("id")
        .eq("user_id", req.user_id)
        .eq("session_key", session_key)
        .limit(1)
        .execute()
    )

    is_new_session = False
    if existing_session.data:
        # Update existing session — preserve progress
        session_id = existing_session.data[0]["id"]
        db.table("sessions").update({
            "status": "stocking",
            "current_route_id": route_id,
            "delivery_date": req.date,
            "started_at": datetime.utcnow().isoformat(),
        }).eq("id", session_id).execute()
    else:
        # Create new session — fresh start. Set pick_direction explicitly rather
        # than relying on a DB default (the old set-route-sequence did this); a
        # get_next_item issued before start_machine would otherwise read a NULL
        # direction and pick in reverse.
        is_new_session = True
        insert_result = (
            db.table("sessions")
            .insert({
                "user_id": req.user_id,
                "session_key": session_key,
                "status": "stocking",
                "current_route_id": route_id,
                "delivery_date": req.date,
                "started_at": datetime.utcnow().isoformat(),
                "pick_direction": "forward",
            })
            .execute()
        )
        session_id = insert_result.data[0]["id"]

    # Step 5: Get machines for this route
    machines_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name, sequence, total_items, completed_items, status, skipped_at_item")
        .eq("route_id", route_id)
        .order("sequence")
        .execute()
    )
    machines = machines_result.data or []
    if not machines:
        raise HTTPException(status_code=404, detail="No machines found for this route")

    # PHANTOM-PROGRESS RESET (2026-07-10). A machine that is still 'pending' but shows
    # completed_items > 0 with NO skip marker never actually started stocking — the count was
    # advanced by an out-of-order get-next-item fired before start-machine. Davy's North walk
    # proved the damage: a pre-start get-next-item left completed_items=2, and a later 'bottom'
    # start then began 2 items up, skipping the true bottom two. Reset that phantom count to 0
    # here so route setup never carries it forward. A GENUINE go-back resume keeps its skip
    # marker (skipped_at_item set), so it is left untouched — we never wipe real progress.
    phantom_ids = [
        m["id"] for m in machines
        if m["status"] == "pending" and (m.get("completed_items") or 0) > 0 and not m.get("skipped_at_item")
    ]
    if phantom_ids:
        db.table("machines").update({"completed_items": 0}).in_("id", phantom_ids).execute()
        for m in machines:
            if m["id"] in phantom_ids:
                m["completed_items"] = 0

    # Step 6: Decide RESET vs RESUME by the ROUTE's actual progress, NOT by whether a
    # session row exists. Logging out clears the session row, so a re-login looks
    # brand-new even when the route was already worked — resetting on is_new_session
    # WIPED a driver's real progress (the logout-then-login data-loss bug). A route with
    # ANY progress always resumes; only a zero-progress route (fresh upload) starts clean.
    route_has_progress = any(
        (m.get("completed_items") or 0) > 0 or m["status"] in ("in_progress", "completed", "skipped")
        for m in machines
    )

    if not route_has_progress:
        # Genuine fresh start. (A re-upload already inserts machines at 0, so this is a
        # no-op there; it only matters as belt-and-suspenders for a truly clean route.)
        db.table("machines").update({
            "status": "pending",
            "completed_items": 0,
            "skipped_at_item": None,
        }).eq("route_id", route_id).execute()
        first_machine = machines[0]
    else:
        # Resume: jump to the first machine that isn't finished/skipped.
        first_machine = next(
            (m for m in machines if m["status"] not in ("completed", "skipped")),
            machines[0],  # fallback to first if all done
        )

    # Compute 1-based machine index for frontend "Machine X of Y" display
    machine_index = next(
        (i + 1 for i, m in enumerate(machines) if m["id"] == first_machine["id"]),
        1,
    )

    db.table("sessions").update({
        "current_machine_id": first_machine["id"],
    }).eq("id", session_id).execute()

    # Step 8: Build response
    machines_list = [
        {
            "id": m["id"],
            "name": m["machine_name"],
            "location": m["location_name"],
            "sequence": m["sequence"],
            "totalItems": m["total_items"],
            "completedItems": m["completed_items"],
            "status": m["status"],
        }
        for m in machines
    ]

    route_phrase = f"Starting route. First machine is {first_machine['machine_name']} at {first_machine['location_name']}. Say top or bottom."
    return {
        "action": "machine_ready",
        "route_name": route["route_name"],
        "route_id": route_id,
        "route_date": route["delivery_date"],
        "date": route["delivery_date"],
        "first_machine": first_machine["machine_name"],
        "first_machine_id": first_machine["id"],
        "first_machine_number": first_machine.get("machine_number"),
        "first_location": first_machine["location_name"],
        # Frontend contract expects machine_id/machine_name (not first_machine_*)
        "machine_id": first_machine["id"],
        "machine_name": first_machine["machine_name"],
        "total_machines": len(machines),
        "machine_index": machine_index,
        "machines": machines_list,
        "session_id": session_id,
        "voice_text": route_phrase,
        "spoken": route_phrase,
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _get_team_user_ids(db, user_id: str) -> list[str]:
    """Get all user_ids in the same account as the given user."""
    account_user = (
        db.table("account_users")
        .select("account_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not account_user.data:
        raise HTTPException(status_code=403, detail="User has no account access")

    account_id = account_user.data[0]["account_id"]

    team_members = (
        db.table("account_users")
        .select("user_id")
        .eq("account_id", account_id)
        .execute()
    )

    return [m["user_id"] for m in team_members.data]


def _get_active_session(db, user_id: str) -> dict:
    """Get the most recent active stocking session for a user."""
    result = (
        db.table("sessions")
        .select("id, current_machine_id, current_route_id")
        .eq("user_id", user_id)
        .eq("status", "stocking")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="No active session found")

    return result.data[0]
