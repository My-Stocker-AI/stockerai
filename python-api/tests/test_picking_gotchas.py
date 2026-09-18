"""Regression guard for the picking-flow gotchas fixed 2026-07-10 (XFFI cycle
`.xf/specs/2026-07-10-picking-gotchas-xffi.md`). Each test pins one confirmed terminal.

Branches:
  1  direction-flip resume — a go-back resumed in the OPPOSITE direction restarts from the
     true first/last item instead of landing 2 items up (the phantom). Same-direction resume
     still continues from the saved point.
  2a start-machine rejects re-opening a COMPLETED machine (finished route + "top" would have
     reset it to 1/N and re-announced stocked items).
  2c the skip marker (skipped_at_item) clears when a machine RESUMES, so a later skip re-arms.
  2d the skip marker clears when a machine COMPLETES (Russ's catch), so a finished machine
     never carries a stale marker.
  3  skipping the LAST/only remaining machine offers go-back instead of stranding it with a
     false "route complete" (session stays active; the machine is marked skipped, never
     silently abandoned).
  2b VERIFY-ONLY — NOT a real bug. Logout does not delete the session (the destructive
     clearServer is dead code), so set-route-sequence resumes the existing session and keeps
     pick_direction. This test proves the current code already satisfies the terminal.

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
DATE = "2099-12-29"  # far-future sentinel (distinct from phantom test's 2099-12-30); never a real route
ROUTE = "GOTCHAS_TEST"


def _clean(db):
    FIXTURES.cleanup(db)


def _machine(db, mid):
    return db.table("machines").select("*").eq("id", mid).execute().data[0]


def _build(db, *, machines, current_index=0, pick_direction="forward"):
    """Build a throwaway route. `machines` is a list of dicts:
       {seq, name, status, completed, skipped_at_item, n_items}. A single stocking session
       points at machines[current_index] with the given session-level pick_direction.
    """
    _clean(db)
    rid = db.table("routes").insert({
        "user_id": TEST_USER, "route_name": ROUTE, "delivery_date": DATE,
        "total_machines": len(machines), "total_items": sum(m["n_items"] for m in machines),
    }).execute().data[0]["id"]
    FIXTURES.record(rid)
    mids = []
    for m in machines:
        mid = db.table("machines").insert({
            "route_id": rid, "route_name": ROUTE, "machine_name": m["name"],
            "machine_number": m["seq"], "location_name": f"L{m['seq']}", "sequence": m["seq"],
            "total_items": m["n_items"], "completed_items": m["completed"],
            "status": m["status"], "skipped_at_item": m.get("skipped_at_item"),
        }).execute().data[0]["id"]
        db.table("items").insert([{
            "machine_id": mid, "machine_name": m["name"], "product_name": f"P{i}", "quantity": 1,
            "slot": str(i), "sequence": i, "status": "pending",
            "inventory_current": 0, "inventory_parlevel": 0,
        } for i in range(1, m["n_items"] + 1)]).execute()
        mids.append(mid)
    sid = db.table("sessions").insert({
        "user_id": TEST_USER, "session_key": f"stocking_{rid}", "status": "stocking",
        "current_route_id": rid, "current_machine_id": mids[current_index],
        "delivery_date": DATE, "pick_direction": pick_direction,
    }).execute().data[0]["id"]
    return {"route_id": rid, "machine_ids": mids, "session_id": sid}


@pytest.fixture
def db():
    from app.services.database import get_client
    d = get_client()
    yield d
    _clean(d)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def _start(client, sid, direction, count=1):
    return client.post("/api/start-machine",
                       json={"session_id": sid, "user_id": TEST_USER, "direction": direction, "count": count})


def _next(client, sid, count=1):
    return client.post("/api/get-next-item",
                       json={"session_id": sid, "user_id": TEST_USER, "count": count})


# ── Branch 1: direction-flip resume ──────────────────────────────────────────

def test_flip_direction_on_resume_restarts_at_true_end(client, db):
    """Picked 2 from the TOP, skipped (marker set), come back and say BOTTOM. The flip can't
    continue a one-directional count, so it restarts from the TRUE bottom (seq 5) — not the
    phantom seq 3 the old code produced."""
    b = _build(db, machines=[{"seq": 1, "name": "M1", "status": "pending",
                              "completed": 2, "skipped_at_item": 2, "n_items": 5}],
               pick_direction="forward")
    r = _start(client, b["session_id"], "end")
    assert r.status_code == 200
    assert r.json()["new_item_index"] == 5   # true bottom, not the phantom 3


def test_same_direction_resume_continues_from_saved_point(client, db):
    """Same setup but say TOP again — same direction — so it CONTINUES from item 3, no restart."""
    b = _build(db, machines=[{"seq": 1, "name": "M1", "status": "pending",
                              "completed": 2, "skipped_at_item": 2, "n_items": 5}],
               pick_direction="forward")
    r = _start(client, b["session_id"], "beginning")
    assert r.status_code == 200
    assert r.json()["new_item_index"] == 3   # resume continues, does not restart


# ── Branch 2a: reject re-opening a completed machine ─────────────────────────

def test_start_machine_rejects_completed_machine(client, db):
    b = _build(db, machines=[{"seq": 1, "name": "M1", "status": "completed",
                              "completed": 5, "skipped_at_item": None, "n_items": 5}])
    r = _start(client, b["session_id"], "beginning")
    assert r.status_code == 400                                   # rejected, not re-opened
    m = _machine(db, b["machine_ids"][0])
    assert m["status"] == "completed" and m["completed_items"] == 5   # untouched (no reset to 1/5)


# ── Branch 2c: skip marker clears on resume ──────────────────────────────────

def test_skip_marker_cleared_on_resume(client, db):
    b = _build(db, machines=[{"seq": 1, "name": "M1", "status": "pending",
                              "completed": 2, "skipped_at_item": 2, "n_items": 5}],
               pick_direction="forward")
    assert _start(client, b["session_id"], "beginning").status_code == 200
    assert _machine(db, b["machine_ids"][0])["skipped_at_item"] is None   # re-arms a later skip


# ── Branch 2d: skip marker clears on completion (Russ's catch) ───────────────

def test_skip_marker_cleared_on_completion(client, db):
    """A machine that carried a skip marker must not keep it once it finishes."""
    b = _build(db, machines=[{"seq": 1, "name": "M1", "status": "in_progress",
                              "completed": 4, "skipped_at_item": 2, "n_items": 5}],
               pick_direction="forward")
    assert _next(client, b["session_id"]).status_code == 200   # picks item 5 → completed 5
    assert _next(client, b["session_id"]).status_code == 200   # detects completion, marks done
    m = _machine(db, b["machine_ids"][0])
    assert m["status"] == "completed"
    assert m["skipped_at_item"] is None


# ── Branch 3: skipping the last machine never strands it ─────────────────────

def test_skip_last_machine_offers_go_back_not_strand(client, db):
    """M1 done, M2 current. Skip M2 (the last one). The old code marked the route complete and
    abandoned M2 forever; now it OFFERS go-back and keeps the session active."""
    b = _build(db, machines=[
        {"seq": 1, "name": "M1", "status": "completed", "completed": 5, "skipped_at_item": None, "n_items": 5},
        {"seq": 2, "name": "M2", "status": "in_progress", "completed": 1, "skipped_at_item": None, "n_items": 5},
    ], current_index=1, pick_direction="forward")
    r = client.post("/api/skip-machine", json={"session_id": b["session_id"], "user_id": TEST_USER})
    assert r.status_code == 200
    assert r.json()["action"] == "offer_go_back"                              # not a stranding route_complete
    assert db.table("sessions").select("status").eq("user_id", TEST_USER).execute().data[0]["status"] == "stocking"
    assert _machine(db, b["machine_ids"][1])["status"] == "skipped"           # marked skipped, never silently passed


# ── Branch 2b: VERIFY-ONLY — direction survives a re-login (no code change) ───

def test_pick_direction_preserved_on_route_reload(client, db):
    """Proves the audit's branch-2b bug does NOT reproduce: reloading a reverse route (the
    re-login path) keeps pick_direction='reverse'. The session is never deleted on logout, so
    set-route-sequence resumes it via the UPDATE branch and never resets to 'forward'."""
    b = _build(db, machines=[
        {"seq": 1, "name": "M1", "status": "completed", "completed": 5, "skipped_at_item": None, "n_items": 5},
        {"seq": 2, "name": "M2", "status": "in_progress", "completed": 2, "skipped_at_item": None, "n_items": 5},
    ], current_index=1, pick_direction="reverse")
    r = client.post("/api/set-route-sequence",
                    json={"session_id": b["session_id"], "user_id": TEST_USER, "route_name": ROUTE, "date": DATE})
    assert r.status_code == 200
    s = db.table("sessions").select("pick_direction").eq("user_id", TEST_USER).eq("status", "stocking").execute().data[0]
    assert s["pick_direction"] == "reverse"   # preserved, NOT reset to 'forward'
