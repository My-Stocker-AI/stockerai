"""Permanent regression guard for the start_machine resume-after-skip bug.

History: the n8n engine resumed a skipped machine from its SAVED progress. The
Python rewrite always grabbed item #1 and ADDED to the count — so "go back to a
skipped machine" re-announced already-stocked items AND inflated completed_items
(3/5 -> showed item 1 and jumped the count off the wrong base). Fixed in
routes/items.py: read from the resume point (completed_items), and SET
completed_items = base + items shown (idempotent), never ADD from item 1.

These tests put a machine in the exact state go_back_to_skipped produces
(status='pending', completed_items preserved) and assert start_machine resumes
correctly. If anyone reintroduces the from-item-1 / additive behavior, they fail.

Needs live Supabase creds (SUPABASE_URL + SUPABASE_SERVICE_KEY); skips cleanly
without them so CI stays green until those secrets are configured.
"""
import os
import pytest

pytestmark = pytest.mark.skipif(
    not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")),
    reason="needs live Supabase creds (SUPABASE_URL + SUPABASE_SERVICE_KEY)",
)

TEST_USER = os.environ.get("TEST_USER_ID", "00000000-0000-0000-0000-00000000c002")
DATE = "2099-12-30"  # far-future sentinel date, never a real route


def _machine(db, machine_id):
    return db.table("machines").select("completed_items, status").eq("id", machine_id).execute().data[0]


def _build(db, completed_items, status):
    """Create a throwaway 5-item machine + stocking session in a given state."""
    db.table("sessions").delete().eq("user_id", TEST_USER).execute()
    db.table("routes").delete().eq("user_id", TEST_USER).eq("delivery_date", DATE).execute()

    rid = db.table("routes").insert({
        "user_id": TEST_USER, "route_name": "RESUME_TEST",
        "delivery_date": DATE, "total_machines": 1, "total_items": 5,
    }).execute().data[0]["id"]
    mid = db.table("machines").insert({
        "route_id": rid, "route_name": "RESUME_TEST", "machine_name": "M1",
        "machine_number": 1, "location_name": "L1", "sequence": 1,
        "total_items": 5, "completed_items": completed_items, "status": status,
    }).execute().data[0]["id"]
    db.table("items").insert([{
        "machine_id": mid, "machine_name": "M1", "product_name": f"P{i}", "quantity": 1,
        "slot": str(i), "sequence": i, "status": "pending",
        "inventory_current": 0, "inventory_parlevel": 0,
    } for i in range(1, 6)]).execute()
    sid = db.table("sessions").insert({
        "user_id": TEST_USER, "session_key": f"stocking_{rid}", "status": "stocking",
        "current_route_id": rid, "current_machine_id": mid,
        "delivery_date": DATE, "pick_direction": "forward",
    }).execute().data[0]["id"]
    return {"db": db, "session_id": sid, "machine_id": mid}


@pytest.fixture
def resumed_machine():
    """A 5-item machine left mid-way (completed_items=3, status='pending') — the
    exact state go_back_to_skipped produces when returning to a skipped machine."""
    from app.services.database import get_client
    db = get_client()
    ctx = _build(db, completed_items=3, status="pending")
    yield ctx
    db.table("sessions").delete().eq("user_id", TEST_USER).execute()
    db.table("routes").delete().eq("user_id", TEST_USER).eq("delivery_date", DATE).execute()


@pytest.fixture
def fresh_machine():
    """A brand-new 5-item machine (completed_items=0) — guards against over-correction."""
    from app.services.database import get_client
    db = get_client()
    ctx = _build(db, completed_items=0, status="pending")
    yield ctx
    db.table("sessions").delete().eq("user_id", TEST_USER).execute()
    db.table("routes").delete().eq("user_id", TEST_USER).eq("delivery_date", DATE).execute()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def _start(client, ctx, count=1):
    return client.post("/api/start-machine", json={
        "session_id": ctx["session_id"], "user_id": TEST_USER,
        "direction": "beginning", "count": count,
    })


def test_resume_starts_from_saved_point_not_item_one(client, resumed_machine):
    """The headline bug: resuming a machine at 3/5 must show item #4, not item #1."""
    resp = _start(client, resumed_machine)
    assert resp.status_code == 200
    # completed=3 → the next unstocked item is sequence 4. The bug returned 1.
    assert resp.json()["new_item_index"] == 4


def test_resume_does_not_inflate_count(client, resumed_machine):
    """Resuming must continue the count (3 → 4), not add on top of it (3 → 6)."""
    assert _start(client, resumed_machine).status_code == 200
    assert _machine(resumed_machine["db"], resumed_machine["machine_id"])["completed_items"] == 4


def test_resume_retry_stays_idempotent(client, resumed_machine):
    """A retried resume must not advance the item or double-count."""
    for _ in range(3):
        assert _start(client, resumed_machine).status_code == 200
    assert _machine(resumed_machine["db"], resumed_machine["machine_id"])["completed_items"] == 4


def test_fresh_machine_still_starts_at_item_one(client, fresh_machine):
    """Guard against over-correction: a fresh machine still starts at item 1, count 1."""
    resp = _start(client, fresh_machine)
    assert resp.status_code == 200
    assert resp.json()["new_item_index"] == 1
    assert _machine(fresh_machine["db"], fresh_machine["machine_id"])["completed_items"] == 1
