"""
Machine management endpoints:
  POST /api/skip-machine        — replaces n8n skip_current_machine workflow
  POST /api/go-back-to-skipped  — replaces n8n go_back_to_skipped workflow
  POST /api/set-route-sequence  — replaces n8n set_route_sequence workflow
"""

import random
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

    # Step 2: Get current machine
    machine_result = (
        db.table("machines")
        .select("id, machine_name, sequence, status, completed_items")
        .eq("id", machine_id)
        .single()
        .execute()
    )

    if not machine_result.data:
        raise HTTPException(status_code=404, detail="Current machine not found")

    current_machine = machine_result.data

    if current_machine["status"] == "skipped":
        raise HTTPException(status_code=400, detail="Machine is already skipped")

    # Step 3: Mark machine as skipped (trigger auto_set_skipped_at_item handles skipped_at_item)
    db.table("machines").update({"status": "skipped"}).eq("id", machine_id).execute()

    # Step 4: Find next non-skipped machine with higher sequence
    next_machine_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name, sequence")
        .eq("route_id", route_id)
        .gt("sequence", current_machine["sequence"])
        .neq("status", "skipped")
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
            "spoken": phrase,
            "display": f"Skipped: {current_machine['machine_name']} → Next: {next_machine['machine_name']}",
        }

    # Step 5: No next machine — check for skipped machines to return to
    skipped_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name")
        .eq("route_id", route_id)
        .eq("status", "skipped")
        .order("sequence")
        .limit(1)
        .execute()
    )

    if skipped_result.data:
        skipped = skipped_result.data[0]
        db.table("sessions").update({
            "current_machine_id": skipped["id"],
        }).eq("id", session["id"]).execute()

        return {
            "action": "next_machine",
            "skipped_machine": current_machine["machine_name"],
            "next_machine": skipped["machine_name"],
            "next_machine_id": skipped["id"],
            "next_location": skipped["location_name"],
            "spoken": f"No more machines ahead. Going back to {skipped['machine_name']} at {skipped['location_name']}. Top or bottom?",
            "display": f"Returning to: {skipped['machine_name']}",
        }

    # Step 6: All machines done/skipped — route complete
    return {
        "action": "route_complete",
        "spoken": "All machines are done or skipped. Route complete!",
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

    # Step 3: Mark machine as pending
    db.table("machines").update({"status": "pending"}).eq("id", machine["id"]).execute()

    # Step 4: Update session to point to this machine
    db.table("sessions").update({
        "current_machine_id": machine["id"],
    }).eq("id", session["id"]).execute()

    return {
        "action": "machine_ready",
        "machine_id": machine["id"],
        "machine_name": machine["machine_name"],
        "machine_number": machine.get("machine_number"),
        "location": machine["location_name"],
        "total_items": machine["total_items"],
        "completed_items": machine["completed_items"],
        "spoken": f"Going back to {machine['machine_name']} at {machine['location_name']}. Say top or bottom to start.",
        "display": f"Returning to: {machine['machine_name']}",
    }


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

    if existing_session.data:
        # Update existing
        session_id = existing_session.data[0]["id"]
        db.table("sessions").update({
            "status": "stocking",
            "current_route_id": route_id,
        }).eq("id", session_id).execute()
    else:
        # Create new
        insert_result = (
            db.table("sessions")
            .insert({
                "user_id": req.user_id,
                "session_key": session_key,
                "status": "stocking",
                "current_route_id": route_id,
            })
            .execute()
        )
        session_id = insert_result.data[0]["id"]

    # Step 5: Get machines for this route
    machines_result = (
        db.table("machines")
        .select("id, machine_name, machine_number, location_name, sequence, total_items, completed_items, status")
        .eq("route_id", route_id)
        .order("sequence")
        .execute()
    )

    machines = machines_result.data or []
    if not machines:
        raise HTTPException(status_code=404, detail="No machines found for this route")

    # Step 6: Set first machine as current
    first_machine = machines[0]
    db.table("sessions").update({
        "current_machine_id": first_machine["id"],
    }).eq("id", session_id).execute()

    # Step 7: Build response
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

    return {
        "action": "machine_ready",
        "route_name": route["route_name"],
        "route_id": route_id,
        "route_date": route["delivery_date"],
        "first_machine": first_machine["machine_name"],
        "first_machine_id": first_machine["id"],
        "first_machine_number": first_machine.get("machine_number"),
        "first_location": first_machine["location_name"],
        "total_machines": len(machines),
        "machines": machines_list,
        "session_id": session_id,
        "spoken": f"Starting route. First machine is {first_machine['machine_name']} at {first_machine['location_name']}. Say top or bottom.",
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
