"""Permanent regression guard for the start_machine double-count bug.

History: the n8n engine SET completed_items (idempotent). The Python rewrite
changed it to ADD items_shown to the running count with no guard — so a network
retry or double-tap counted the displayed items twice, inflating the machine's
progress before a single pick. Fixed in routes/items.py with an idempotency
guard (only pre-count when the machine FIRST enters in_progress).

This test fires start_machine twice and asserts the count is added ONCE. If
anyone ever reintroduces the unguarded add, this fails.

Needs live Supabase creds (SUPABASE_URL + SUPABASE_SERVICE_KEY); skips cleanly
without them so CI stays green until those secrets are configured.
"""
import os
import pytest

pytestmark = pytest.mark.skipif(
    not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")),
    reason="needs live Supabase creds (SUPABASE_URL + SUPABASE_SERVICE_KEY)",
)

TEST_USER = os.environ.get("TEST_USER_ID", "00000000-0000-0000-0000-00000000c001")
DATE = "2099-12-31"  # far-future sentinel date, never a real route


def _completed(db, machine_id):
    return db.table("machines").select("completed_items").eq("id", machine_id).execute().data[0]["completed_items"]


@pytest.fixture
def machine():
    """Build a throwaway 7-item machine + stocking session; tear it all down after."""
    from app.services.database import get_client
    db = get_client()

    def _cleanup():
        db.table("sessions").delete().eq("user_id", TEST_USER).execute()
        db.table("routes").delete().eq("user_id", TEST_USER).eq("delivery_date", DATE).execute()

    _cleanup()
    rid = db.table("routes").insert({
        "user_id": TEST_USER, "route_name": "IDEMPOTENT_TEST",
        "delivery_date": DATE, "total_machines": 1, "total_items": 7,
    }).execute().data[0]["id"]
    mid = db.table("machines").insert({
        "route_id": rid, "route_name": "IDEMPOTENT_TEST", "machine_name": "M1",
        "machine_number": 1, "location_name": "L1", "sequence": 1,
        "total_items": 7, "completed_items": 0, "status": "pending",
    }).execute().data[0]["id"]
    db.table("items").insert([{
        "machine_id": mid, "machine_name": "M1", "product_name": f"P{i}", "quantity": 1,
        "slot": str(i), "sequence": i, "status": "pending",
        "inventory_current": 0, "inventory_parlevel": 0,
    } for i in range(1, 8)]).execute()
    sid = db.table("sessions").insert({
        "user_id": TEST_USER, "session_key": f"stocking_{rid}", "status": "stocking",
        "current_route_id": rid, "current_machine_id": mid,
        "delivery_date": DATE, "pick_direction": "forward",
    }).execute().data[0]["id"]

    yield {"db": db, "session_id": sid, "machine_id": mid}
    _cleanup()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def test_start_machine_double_call_counts_once(client, machine):
    """A retried start_machine must not double-count (the regression)."""
    body = {"session_id": machine["session_id"], "user_id": TEST_USER,
            "direction": "beginning", "count": 2}
    assert client.post("/api/start-machine", json=body).status_code == 200
    assert client.post("/api/start-machine", json=body).status_code == 200  # the retry
    # Unguarded code would show 4 here. The fix holds it at 2.
    assert _completed(machine["db"], machine["machine_id"]) == 2


def test_start_machine_triple_call_still_counts_once(client, machine):
    """Even a retry storm stays idempotent."""
    body = {"session_id": machine["session_id"], "user_id": TEST_USER,
            "direction": "beginning", "count": 2}
    for _ in range(3):
        assert client.post("/api/start-machine", json=body).status_code == 200
    assert _completed(machine["db"], machine["machine_id"]) == 2


def test_start_machine_single_count_one_unaffected(client, machine):
    """The guard must not over-correct: a normal single pick still counts 1."""
    body = {"session_id": machine["session_id"], "user_id": TEST_USER,
            "direction": "beginning", "count": 1}
    assert client.post("/api/start-machine", json=body).status_code == 200
    assert _completed(machine["db"], machine["machine_id"]) == 1
