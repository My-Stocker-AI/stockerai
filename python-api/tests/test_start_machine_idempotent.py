"""Permanent regression guard for the start_machine double-count bug.

History: the n8n engine SET completed_items (idempotent). The Python rewrite
changed it to ADD items_shown to the running count with no guard — so a network
retry or double-tap counted the displayed items twice, inflating the machine's
progress before a single pick. Fixed in routes/items.py with an idempotency
guard (only pre-count when the machine FIRST enters in_progress).

This test fires start_machine twice and asserts the count is added ONCE. If
anyone ever reintroduces the unguarded add, this fails.

Requires STOCKERAI_DB_TESTS=1 and explicit disposable local test settings.
Never uses production credentials or configured driver identities.
"""
import os
import pytest
from tests.test_safety import FixtureRoutes

pytestmark = pytest.mark.skipif(
    os.environ.get("STOCKERAI_DB_TESTS") != "1",
    reason="requires explicitly enabled disposable local database",
)

FIXTURES = FixtureRoutes()
TEST_USER = FIXTURES.user_id
DATE = "2099-12-31"  # far-future sentinel date, never a real route


def _completed(db, machine_id):
    return db.table("machines").select("completed_items").eq("id", machine_id).execute().data[0]["completed_items"]


@pytest.fixture
def machine():
    """Build a throwaway 7-item machine + stocking session; tear it all down after."""
    from app.services.database import get_client
    db = get_client()

    def _cleanup():
        FIXTURES.cleanup(db)

    _cleanup()
    rid = db.table("routes").insert({
        "user_id": TEST_USER, "route_name": "IDEMPOTENT_TEST",
        "delivery_date": DATE, "total_machines": 1, "total_items": 7,
    }).execute().data[0]["id"]
    FIXTURES.record(rid)
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
