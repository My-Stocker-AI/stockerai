"""Regression guards for the two session-lifecycle fixes that shipped this session:

  1. Route completion marks the session 'completed' (items.py get_next_item path).
     The RPC returned a 'complete' action but never set sessions.status, so a
     finished route stayed 'stocking' and jammed the next route. (commit 4646515)

  2. Fresh-session hygiene (set_route_sequence): a brand-new session sets
     pick_direction='forward' explicitly and clears stale skipped_at_item marks
     so re-running a route doesn't inherit a prior run's skip state. (commit 236ed01)

Needs live Supabase creds (SUPABASE_URL + SUPABASE_SERVICE_KEY); skips cleanly
without them. Uses a far-future sentinel date + cleanup so it never touches real data.
"""
import os
import pytest

pytestmark = pytest.mark.skipif(
    not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")),
    reason="needs live Supabase creds (SUPABASE_URL + SUPABASE_SERVICE_KEY)",
)

TEST_USER = os.environ.get("TEST_USER_ID", "25df14da-6183-4380-9313-8ff0a2da0969")
DATE = "2099-12-29"  # far-future sentinel, never a real route
ROUTE_NAME = "LIFECYCLE_TEST"


def _cleanup(db):
    db.table("sessions").delete().eq("user_id", TEST_USER).execute()
    db.table("routes").delete().eq("user_id", TEST_USER).eq("delivery_date", DATE).execute()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


# ─── 1. Route completion marks the session 'completed' ──────────────────────────

@pytest.fixture
def one_item_route():
    """A 1-machine / 1-item route with an active session — one pick finishes it."""
    from app.services.database import get_client
    db = get_client()
    _cleanup(db)
    rid = db.table("routes").insert({
        "user_id": TEST_USER, "route_name": ROUTE_NAME, "delivery_date": DATE,
        "total_machines": 1, "total_items": 1,
    }).execute().data[0]["id"]
    mid = db.table("machines").insert({
        "route_id": rid, "route_name": ROUTE_NAME, "machine_name": "M1", "machine_number": 1,
        "location_name": "L1", "sequence": 1, "total_items": 1, "completed_items": 0, "status": "pending",
    }).execute().data[0]["id"]
    db.table("items").insert({
        "machine_id": mid, "machine_name": "M1", "product_name": "P1", "quantity": 1,
        "slot": "1", "sequence": 1, "status": "pending", "inventory_current": 0, "inventory_parlevel": 0,
    }).execute()
    sid = db.table("sessions").insert({
        "user_id": TEST_USER, "session_key": f"stocking_{rid}", "status": "stocking",
        "current_route_id": rid, "current_machine_id": mid, "delivery_date": DATE, "pick_direction": "forward",
    }).execute().data[0]["id"]
    yield {"db": db, "session_id": sid}
    _cleanup(db)


def test_route_completion_marks_session_completed(client, one_item_route):
    db, sid = one_item_route["db"], one_item_route["session_id"]
    # Start the only machine, then walk it to the end.
    assert client.post("/api/start-machine", json={
        "session_id": sid, "user_id": TEST_USER, "direction": "beginning", "count": 1}).status_code == 200
    action = None
    for _ in range(4):  # loop is robust to the exact step count; expect 'complete' fast
        r = client.post("/api/get-next-item", json={"session_id": sid, "user_id": TEST_USER, "count": 1})
        assert r.status_code == 200
        action = r.json().get("action")
        if action == "complete":
            break
    assert action == "complete", f"route never reported complete (last action={action})"
    # THE FIX: the session must be flipped to 'completed', not left 'stocking'.
    status = db.table("sessions").select("status").eq("id", sid).execute().data[0]["status"]
    assert status == "completed", f"session left as '{status}' — would jam the next route"


# ─── 2. Fresh-session hygiene: pick_direction set + skipped_at_item cleared ──────

@pytest.fixture
def stale_skipped_route():
    """A route whose machine carries a stale skip mark and NO active session —
    set_route_sequence must create a clean fresh session."""
    from app.services.database import get_client
    db = get_client()
    _cleanup(db)
    rid = db.table("routes").insert({
        "user_id": TEST_USER, "route_name": ROUTE_NAME, "delivery_date": DATE,
        "total_machines": 1, "total_items": 3,
    }).execute().data[0]["id"]
    # A genuinely fresh route (no progress anywhere) — the only case that resets.
    mid = db.table("machines").insert({
        "route_id": rid, "route_name": ROUTE_NAME, "machine_name": "M1", "machine_number": 1,
        "location_name": "L1", "sequence": 1, "total_items": 3, "completed_items": 0,
        "status": "pending",
    }).execute().data[0]["id"]
    db.table("items").insert([{
        "machine_id": mid, "machine_name": "M1", "product_name": f"P{i}", "quantity": 1,
        "slot": str(i), "sequence": i, "status": "pending", "inventory_current": 0, "inventory_parlevel": 0,
    } for i in range(1, 4)]).execute()
    yield {"db": db, "machine_id": mid}
    _cleanup(db)


def test_fresh_session_sets_direction_and_clears_skip_marks(client, stale_skipped_route):
    db, mid = stale_skipped_route["db"], stale_skipped_route["machine_id"]
    r = client.post("/api/set-route-sequence", json={
        "session_id": "00000000-0000-0000-0000-0000000000ff",  # client-supplied; server derives the real one
        "user_id": TEST_USER, "date": DATE, "route_name": ROUTE_NAME})
    assert r.status_code == 200, r.text
    # FIX A: the new session has an explicit forward direction (not NULL → reverse).
    sess = db.table("sessions").select("pick_direction").eq("user_id", TEST_USER).eq(
        "status", "stocking").execute().data
    assert sess and sess[0]["pick_direction"] == "forward", f"pick_direction={sess and sess[0].get('pick_direction')}"
    # FIX B: the machine was reset clean — no inherited skip mark, fresh count.
    m = db.table("machines").select("status, completed_items, skipped_at_item").eq("id", mid).execute().data[0]
    assert m["skipped_at_item"] is None, f"stale skipped_at_item not cleared: {m['skipped_at_item']}"
    assert m["completed_items"] == 0 and m["status"] == "pending", f"machine not reset: {m}"


# ─── 3. Logout-then-login must RESUME, never wipe progress ──────────────────────

@pytest.fixture
def worked_route_no_session():
    """A route already worked (M1 done 3/3, M2 mid 1/2) with NO active session — the
    exact state a logout leaves behind (session row gone, machine progress in the DB)."""
    from app.services.database import get_client
    db = get_client()
    _cleanup(db)
    rid = db.table("routes").insert({"user_id": TEST_USER, "route_name": ROUTE_NAME, "delivery_date": DATE,
        "total_machines": 2, "total_items": 5}).execute().data[0]["id"]
    m1 = db.table("machines").insert({"route_id": rid, "route_name": ROUTE_NAME, "machine_name": "M1",
        "machine_number": 1, "location_name": "L", "sequence": 1, "total_items": 3, "completed_items": 3,
        "status": "completed"}).execute().data[0]["id"]
    m2 = db.table("machines").insert({"route_id": rid, "route_name": ROUTE_NAME, "machine_name": "M2",
        "machine_number": 2, "location_name": "L", "sequence": 2, "total_items": 2, "completed_items": 1,
        "status": "in_progress"}).execute().data[0]["id"]
    for mid, n in ((m1, 3), (m2, 2)):
        db.table("items").insert([{"machine_id": mid, "machine_name": "M", "product_name": f"P{i}",
            "quantity": 1, "slot": str(i), "sequence": i, "status": "pending",
            "inventory_current": 0, "inventory_parlevel": 0} for i in range(1, n + 1)]).execute()
    yield {"db": db, "m1": m1, "m2": m2}
    _cleanup(db)


def test_relogin_resumes_and_preserves_progress(client, worked_route_no_session):
    """THE logout/login data-loss bug: re-selecting a worked route must keep its
    progress and resume at the right machine — not reset everything to zero."""
    db, m1, m2 = worked_route_no_session["db"], worked_route_no_session["m1"], worked_route_no_session["m2"]
    r = client.post("/api/set-route-sequence", json={
        "session_id": "00000000-0000-0000-0000-0000000000ff",
        "user_id": TEST_USER, "date": DATE, "route_name": ROUTE_NAME})
    assert r.status_code == 200, r.text
    # progress PRESERVED (the bug wiped these to 0)
    a = db.table("machines").select("completed_items,status").eq("id", m1).execute().data[0]
    b = db.table("machines").select("completed_items,status").eq("id", m2).execute().data[0]
    assert a["completed_items"] == 3, f"M1 progress wiped: {a}"
    assert b["completed_items"] == 1, f"M2 progress wiped: {b}"
    # resumes at the in-progress machine (M2), not back at machine 1
    sess = db.table("sessions").select("current_machine_id").eq("user_id", TEST_USER).eq("status", "stocking").execute().data
    assert sess and sess[0]["current_machine_id"] == m2, f"did not resume at M2: {sess}"
