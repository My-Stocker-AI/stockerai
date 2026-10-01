from urllib.parse import unquote, urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config import SUPABASE_URL
from app.services.auth import AuthCaller, Caller, assert_route_in_account, forbidden
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


_ROUTE_PDF_BUCKET = "route-pdfs"
_ROUTE_PDF_TTL_SECONDS = 60


def _storage_path_from_reference(reference: str) -> str:
    """Return the object path from a stored route-PDF reference.

    Existing rows contain the former public URL. Keeping that database value readable lets
    the bucket become private without a risky customer-row rewrite. New callers never receive
    the stored reference; they receive a one-minute signed URL instead.
    """
    value = (reference or "").strip()
    if not value:
        raise ValueError("missing storage reference")

    public_prefix = f"/storage/v1/object/public/{_ROUTE_PDF_BUCKET}/"
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        expected = urlparse(SUPABASE_URL)
        if parsed.scheme != expected.scheme or parsed.netloc != expected.netloc:
            raise ValueError("unexpected storage origin")
        if not parsed.path.startswith(public_prefix):
            raise ValueError("unexpected storage path")
        value = unquote(parsed.path[len(public_prefix):])
    else:
        value = value.removeprefix(f"{_ROUTE_PDF_BUCKET}/").lstrip("/")

    parts = value.split("/")
    if not value or any(part in {"", ".", ".."} for part in parts):
        raise ValueError("unsafe storage path")
    return value


def _can_view_route_pdf(db, route: dict, caller: Caller) -> bool:
    """Match the route screen: owner/assignee, or an account-wide route viewer."""
    if route.get("user_id") == caller.user_id:
        return True

    assignment = (
        db.table("route_assignments")
        .select("route_id")
        .eq("route_id", route["id"])
        .eq("user_id", caller.user_id)
        .limit(1)
        .execute()
    )
    if assignment.data:
        return True

    membership = (
        db.table("account_users")
        .select("role, can_view_all_routes")
        .eq("account_id", caller.account_id)
        .eq("user_id", caller.user_id)
        .limit(1)
        .execute()
    )
    row = membership.data[0] if membership.data else {}
    return row.get("role") == "primary_admin" or row.get("can_view_all_routes") is True


@router.get("/route-pdf-url")
def get_route_pdf_url(route_id: str, caller: Caller = AuthCaller):
    """Issue a short-lived URL only after checking the current caller and route."""
    db = get_client()
    result = (
        db.table("routes")
        .select("id, user_id, account_id, pdf_url")
        .eq("id", route_id)
        .limit(1)
        .execute()
    )
    if not result.data or result.data[0].get("account_id") != caller.account_id:
        raise forbidden()

    route = result.data[0]
    if not _can_view_route_pdf(db, route, caller):
        raise forbidden()
    if not route.get("pdf_url"):
        raise HTTPException(status_code=404, detail="Route PDF is not available.")

    try:
        object_path = _storage_path_from_reference(route["pdf_url"])
        signed = db.storage.from_(_ROUTE_PDF_BUCKET).create_signed_url(
            object_path,
            _ROUTE_PDF_TTL_SECONDS,
        )
        signed_url = signed.get("signedURL")
        if not signed_url:
            raise ValueError("storage did not return a signed URL")
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Could not open the route PDF. Try again.",
        ) from None

    return {"url": signed_url, "expires_in": _ROUTE_PDF_TTL_SECONDS}


@router.post("/get-routes")
def get_routes(req: GetRoutesRequest, caller: Caller = AuthCaller):
    db = get_client()

    # Company ownership is stored on the route itself. Driver membership can change without
    # orphaning company data or changing which company is allowed to see the route.
    routes_result = (
        db.table("routes")
        .select("id, route_name, delivery_date, machines(id, machine_name, items(id))")
        .eq("account_id", caller.account_id)
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

    # DELIBERATE WIDENING (2026-08-15). This used to be creator-only — the old comment read
    # "strict ownership for destructive ops", so a teammate could not delete a route even
    # inside their own account. It is now account-wide, for two reasons. Teammates already
    # see and stock each other's routes, so forbidding only deletion was inconsistent. And an
    # admin can now load a route FOR one of their drivers, which makes the DRIVER its owner —
    # under the old rule the admin could not delete the route they had just created.
    #
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
