from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.database import get_client

router = APIRouter()


class GetRoutesRequest(BaseModel):
    session_id: str
    user_id: str
    date: str  # YYYY-MM-DD


class DeleteRouteRequest(BaseModel):
    route_id: str
    user_id: str


@router.post("/get-routes")
def get_routes(req: GetRoutesRequest):
    db = get_client()

    # Get all user_ids in the same account (team-scoped)
    team_user_ids = _get_team_user_ids(db, req.user_id)

    # Get routes for date with nested machine data
    routes_result = (
        db.table("routes")
        .select("id, route_name, delivery_date, machines(id, machine_name, items(id))")
        .in_("user_id", team_user_ids)
        .eq("delivery_date", req.date)
        .execute()
    )

    routes_list = []
    for route in routes_result.data or []:
        machines = route.get("machines", [])
        total_items = sum(len(m.get("items", [])) for m in machines)
        machine_names = [m["machine_name"] for m in machines]

        routes_list.append({
            "id": route["id"],
            "route_name": route["route_name"],
            "machines": len(machines),
            "items": total_items,
            "machine_names": machine_names,
        })

    return {
        "routes": routes_list,
        "count": len(routes_list),
        "queried_date": req.date,
    }


@router.post("/delete-route")
def delete_route(req: DeleteRouteRequest):
    db = get_client()

    # Get route
    route_result = (
        db.table("routes")
        .select("id, route_name, user_id")
        .eq("id", req.route_id)
        .single()
        .execute()
    )

    if not route_result.data:
        raise HTTPException(status_code=404, detail="Route not found")

    route = route_result.data

    # Verify requesting user is in the same account as route owner
    team_user_ids = _get_team_user_ids(db, req.user_id)
    if route["user_id"] not in team_user_ids:
        raise HTTPException(status_code=403, detail="Not authorized to delete this route")

    # Check for active sessions using this route
    active_sessions = (
        db.table("sessions")
        .select("id")
        .eq("current_route_id", req.route_id)
        .eq("status", "stocking")
        .limit(1)
        .execute()
    )

    if active_sessions.data:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete route with active session",
        )

    route_name = route["route_name"]

    # Delete route (CASCADE handles machines/items)
    db.table("routes").delete().eq("id", req.route_id).execute()

    return {
        "success": True,
        "deleted_route": route_name,
        "message": f"Route '{route_name}' and all associated data deleted.",
    }


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
