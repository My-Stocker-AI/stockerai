from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.auth import AuthCaller, Caller, assert_route_in_account
from app.services.database import get_client

router = APIRouter()


class GetRoutesRequest(BaseModel):
    session_id: str
    # user_id is still ACCEPTED so an older app build keeps working, but it is never read.
    # Who you are comes from the login on the Authorization header, and nowhere else.
    user_id: str | None = None
    date: str  # YYYY-MM-DD


class DeleteRouteRequest(BaseModel):
    route_id: str
    user_id: str | None = None


@router.post("/get-routes")
def get_routes(req: GetRoutesRequest, caller: Caller = AuthCaller):
    db = get_client()

    # Routes are shared across everyone in the account, and that membership list is derived
    # from the verified login — so there is no longer any user_id a caller can name to widen it.
    routes_result = (
        db.table("routes")
        .select("id, route_name, delivery_date, machines(id, machine_name, items(id))")
        .in_("user_id", caller.team_user_ids)
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
def delete_route(req: DeleteRouteRequest, caller: Caller = AuthCaller):
    db = get_client()

    # A route in another account and a route that never existed are refused identically —
    # otherwise the difference between the two answers would confirm which ids are real.
    route = assert_route_in_account(db, req.route_id, caller)

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

    # Explicitly delete children first — the FK does NOT cascade (verified: deleting a
    # route was leaving its machines + items orphaned in the DB, which then confused later
    # re-uploads of the same route name). Order: items -> machines -> sessions -> route.
    machine_ids = [m["id"] for m in (db.table("machines").select("id").eq("route_id", req.route_id).execute().data or [])]
    for mid in machine_ids:
        db.table("items").delete().eq("machine_id", mid).execute()
    db.table("machines").delete().eq("route_id", req.route_id).execute()
    db.table("sessions").delete().eq("current_route_id", req.route_id).execute()
    db.table("routes").delete().eq("id", req.route_id).execute()

    return {
        "success": True,
        "deleted_route": route_name,
        "message": f"Route '{route_name}' and all associated data deleted.",
    }
