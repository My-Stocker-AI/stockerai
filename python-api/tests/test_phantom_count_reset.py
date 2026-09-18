"""Permanent regression guard for the phantom-count skip bug (Davy, 2026-07-10 North walk).

History: an out-of-order get-next-item fired BEFORE start-machine advanced a still-'pending'
machine's completed_items to 2. set-route-sequence then treated that phantom count as real
progress and preserved it, and a later 'bottom' start began 2 items up — skipping the true
bottom two items. Fixed across two seams:
  - machines.py set-route-sequence: reset completed_items to 0 for any PENDING machine with
    completed_items>0 and NO skip marker (phantom), while leaving genuine go-back resumes
    (skipped_at_item set) untouched.
  - items.py start-machine: an explicit top/bottom on a not-in_progress machine WITHOUT a skip
    marker is a FRESH start at the true first/last item (base 0), not a resume from a stale count.

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
DATE = "2099-12-30"  # far-future sentinel date, never a real route
ROUTE = "PHANTOM_TEST"
N = 5  # items 1..5; true bottom = seq 5


def _completed(db, machine_id):
    return db.table("machines").select("completed_items").eq("id", machine_id).execute().data[0]["completed_items"]


def _build(db, *, completed, skipped_at_item):
    """A throwaway N-item machine seeded with a given (possibly phantom) count."""
    FIXTURES.cleanup(db)
    rid = db.table("routes").insert({
        "user_id": TEST_USER, "route_name": ROUTE,
        "delivery_date": DATE, "total_machines": 1, "total_items": N,
    }).execute().data[0]["id"]
    FIXTURES.record(rid)
    mid = db.table("machines").insert({
        "route_id": rid, "route_name": ROUTE, "machine_name": "M1",
        "machine_number": 1, "location_name": "L1", "sequence": 1,
        "total_items": N, "completed_items": completed, "status": "pending",
        "skipped_at_item": skipped_at_item,
    }).execute().data[0]["id"]
    db.table("items").insert([{
        "machine_id": mid, "machine_name": "M1", "product_name": f"P{i}", "quantity": 1,
        "slot": str(i), "sequence": i, "status": "pending",
        "inventory_current": 0, "inventory_parlevel": 0,
    } for i in range(1, N + 1)]).execute()
    sid = db.table("sessions").insert({
        "user_id": TEST_USER, "session_key": f"stocking_{rid}", "status": "stocking",
        "current_route_id": rid, "current_machine_id": mid,
        "delivery_date": DATE, "pick_direction": "forward",
    }).execute().data[0]["id"]
    return {"route_id": rid, "machine_id": mid, "session_id": sid}


@pytest.fixture
def db():
    from app.services.database import get_client
    d = get_client()
    yield d
    FIXTURES.cleanup(d)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def _set_route(client, session_id):
    return client.post("/api/set-route-sequence",
                       json={"session_id": session_id, "user_id": TEST_USER,
                             "route_name": ROUTE, "date": DATE})


def test_phantom_count_is_reset_on_route_load(client, db):
    """A pending machine showing progress with NO skip marker is phantom → reset to 0."""
    m = _build(db, completed=2, skipped_at_item=None)
    assert _set_route(client, m["session_id"]).status_code == 200
    # Unfixed code preserved 2 here; the fix zeroes the phantom count.
    assert _completed(db, m["machine_id"]) == 0


def test_bottom_start_announces_true_last_item(client, db):
    """Davy's exact bug: fresh 'bottom' start must land on the TRUE last item, skip nothing."""
    m = _build(db, completed=2, skipped_at_item=None)
    assert _set_route(client, m["session_id"]).status_code == 200
    r = client.post("/api/start-machine",
                    json={"session_id": m["session_id"], "user_id": TEST_USER, "direction": "end", "count": 1})
    assert r.status_code == 200
    # True bottom = seq N (5). Unfixed code landed on seq 3, skipping items 5 and 4.
    assert r.json()["new_item_index"] == N


def test_top_start_announces_true_first_item(client, db):
    """Symmetric: fresh 'top' start lands on the true first item."""
    m = _build(db, completed=2, skipped_at_item=None)
    assert _set_route(client, m["session_id"]).status_code == 200
    r = client.post("/api/start-machine",
                    json={"session_id": m["session_id"], "user_id": TEST_USER, "direction": "beginning", "count": 1})
    assert r.status_code == 200
    assert r.json()["new_item_index"] == 1


def test_genuine_go_back_resume_is_preserved(client, db):
    """A real go-back-to-skipped resume (skip marker set) must NOT be reset — no lost work."""
    m = _build(db, completed=2, skipped_at_item=2)
    assert _set_route(client, m["session_id"]).status_code == 200
    # Skip marker present → legitimate progress → count preserved, not wiped.
    assert _completed(db, m["machine_id"]) == 2


def test_get_next_item_blocked_before_machine_started(client, db):
    """RPC guard (seam 1): get-next-item must NOT advance a machine that was never started."""
    m = _build(db, completed=0, skipped_at_item=None)
    r = client.post("/api/get-next-item",
                    json={"session_id": m["session_id"], "user_id": TEST_USER, "count": 1})
    assert r.status_code == 500                       # guard raises on a not-in_progress machine
    assert _completed(db, m["machine_id"]) == 0       # and the phantom advance never happens


def test_get_next_item_works_after_start(client, db):
    """Normal flow unaffected: after start-machine (in_progress), get-next-item advances."""
    m = _build(db, completed=0, skipped_at_item=None)
    assert client.post("/api/start-machine",
                       json={"session_id": m["session_id"], "user_id": TEST_USER,
                             "direction": "beginning", "count": 1}).status_code == 200
    r = client.post("/api/get-next-item",
                    json={"session_id": m["session_id"], "user_id": TEST_USER, "count": 1})
    assert r.status_code == 200
    assert _completed(db, m["machine_id"]) == 2       # start set 1 (in_progress), get-next advanced to 2
