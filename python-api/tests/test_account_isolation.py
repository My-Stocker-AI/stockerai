"""
THE LOGIN GATE — what it must refuse, and what it must never leak.

Before this, all twelve API commands believed whatever a request claimed about who was
calling, and none of them required a login. On 2026-08-15 a real driver's route was fetched
from the live server with no credentials at all. These tests hold the door shut.

The live, end-to-end version of this — signing in as one real account and reaching for
another's actual data — is tests/api/isolation_proof.py. These are the fast unit checks that
run without a network: what the gate does with a bad header, and what it refuses to say.
"""

import pytest
from fastapi import HTTPException

from app.services.auth import (
    FORBIDDEN_MESSAGE,
    Caller,
    assert_machine_in_account,
    assert_route_in_account,
    forbidden,
    is_uuid_like,
    require_auth,
    resolve_target_user,
)

RUSS = "bdc96b72-3f35-4cae-9e79-99473eb4a23b"
TEAMMATE = "25df14da-6183-4380-9313-8ff0a2da0969"
OUTSIDER = "365ffef8-d9b5-45fd-b58e-ff828fe96148"

CALLER = Caller(user_id=RUSS, account_id="acct-1", team_user_ids=[RUSS, TEAMMATE])


class FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


# ── A request with no usable login never reaches any data ─────────────────────────────────

@pytest.mark.parametrize("header,why", [
    (None, "no Authorization header at all"),
    ("", "an empty header"),
    ("Bearer", "the word Bearer with nothing after it"),
    ("Bearer ", "Bearer followed by only whitespace"),
    ("Basic abc123", "the wrong kind of credential"),
    ("eyJhbGciOiJFUzI1NiJ9.x.y", "a token with the Bearer prefix missing"),
    ("Bearer not-a-token", "something that is not a token"),
    ("Bearer a.b.c", "a token-shaped string that is not signed"),
])
def test_a_request_without_a_valid_login_is_refused(header, why):
    headers = {} if header is None else {"authorization": header}
    with pytest.raises(HTTPException) as caught:
        require_auth(FakeRequest(headers))
    assert caught.value.status_code == 401, why


def test_the_refusal_never_explains_what_was_wrong_with_the_token():
    """
    Saying "expired" versus "bad signature" versus "unknown key" hands someone a map for
    guessing their way in. Every rejection says the same thing.
    """
    seen = set()
    for header in ["Bearer a.b.c", "Bearer not-a-token", "Basic abc", "Bearer "]:
        with pytest.raises(HTTPException) as caught:
            require_auth(FakeRequest({"authorization": header}))
        seen.add(caught.value.detail)
    assert len(seen) == 1, f"the reason leaked: {seen}"


# ── The one refusal used for anything out of reach ────────────────────────────────────────

def test_the_cross_account_refusal_names_nothing():
    detail = forbidden().detail
    assert detail == FORBIDDEN_MESSAGE
    assert forbidden().status_code == 403
    # No id, name, date or count can appear in it — a refusal that describes what it is
    # refusing is itself a disclosure.
    assert not any(ch.isdigit() for ch in detail)
    for word in ("route", "machine", "account_id", "user", "session"):
        assert word not in detail.lower().replace("this account", "")


def test_a_signed_in_caller_reaching_out_is_told_apart_from_one_with_no_login():
    """403 and 401 must stay distinct, so a machine check can prove which happened."""
    assert forbidden().status_code == 403
    with pytest.raises(HTTPException) as caught:
        require_auth(FakeRequest({}))
    assert caught.value.status_code == 401


# ── Acting for a teammate is allowed; acting for an outsider is not ───────────────────────

def test_naming_nobody_acts_as_yourself():
    assert resolve_target_user(CALLER, None) == RUSS
    assert resolve_target_user(CALLER, "") == RUSS


def test_an_admin_may_upload_for_a_driver_in_their_own_account():
    """A real feature: the upload screen lets an admin load a route FOR one of their drivers."""
    assert resolve_target_user(CALLER, TEAMMATE) == TEAMMATE


def test_naming_someone_outside_the_account_is_refused():
    with pytest.raises(HTTPException) as caught:
        resolve_target_user(CALLER, OUTSIDER)
    assert caught.value.status_code == 403
    assert caught.value.detail == FORBIDDEN_MESSAGE


def test_a_made_up_user_id_is_refused_rather_than_silently_used():
    with pytest.raises(HTTPException) as caught:
        resolve_target_user(CALLER, "00000000-0000-0000-0000-000000000000")
    assert caught.value.status_code == 403


# ── A record you cannot reach looks the same as one that does not exist ───────────────────

class FakeTable:
    def __init__(self, rows):
        self._rows = rows
    def select(self, *_a, **_k): return self
    def eq(self, *_a, **_k): return self
    def limit(self, *_a, **_k): return self
    def execute(self): return type("R", (), {"data": self._rows})()


class FakeDB:
    def __init__(self, rows):
        self._rows = rows
    def table(self, _name):
        return FakeTable(self._rows)


def test_a_route_in_another_account_and_a_route_that_does_not_exist_are_indistinguishable():
    missing = FakeDB([])
    other_account = FakeDB([{"id": "r1", "route_name": "South", "user_id": OUTSIDER}])

    errors = []
    for db in (missing, other_account):
        with pytest.raises(HTTPException) as caught:
            assert_route_in_account(db, "r1", CALLER)
        errors.append((caught.value.status_code, caught.value.detail))

    assert errors[0] == errors[1], "the two answers differ, which reveals whether the id is real"
    assert errors[0] == (403, FORBIDDEN_MESSAGE)


def test_a_route_inside_the_account_comes_back():
    db = FakeDB([{"id": "r1", "route_name": "North", "user_id": TEAMMATE}])
    assert assert_route_in_account(db, "r1", CALLER)["route_name"] == "North"


def test_a_machine_whose_route_belongs_elsewhere_is_refused():
    db = FakeDB([{"id": "m1", "machine_name": "M", "routes": {"user_id": OUTSIDER}}])
    with pytest.raises(HTTPException) as caught:
        assert_machine_in_account(db, "m1", CALLER, "id, machine_name")
    assert (caught.value.status_code, caught.value.detail) == (403, FORBIDDEN_MESSAGE)


def test_a_machine_inside_the_account_comes_back_without_its_parent_route_attached():
    db = FakeDB([{"id": "m1", "machine_name": "M", "routes": {"user_id": RUSS}}])
    machine = assert_machine_in_account(db, "m1", CALLER, "id, machine_name")
    assert machine["machine_name"] == "M"
    # The parent is stripped so it cannot leak into a response the driver sees.
    assert "routes" not in machine


def test_a_machine_that_does_not_exist_is_refused_the_same_way():
    with pytest.raises(HTTPException) as caught:
        assert_machine_in_account(FakeDB([]), "nope", CALLER, "id")
    assert (caught.value.status_code, caught.value.detail) == (403, FORBIDDEN_MESSAGE)


# ── The app's own locally-minted session ids must not be mistaken for database ids ────────

def test_the_apps_own_session_id_is_not_treated_as_a_database_id():
    """
    The app mints `session_1723...` before a route is chosen. Demanding a database id there
    would strand a driver at the very start of a route, so only real ids are checked.
    """
    assert is_uuid_like("bdc96b72-3f35-4cae-9e79-99473eb4a23b")
    assert not is_uuid_like("session_1755284730123_ab12cd34e")
    assert not is_uuid_like("")
    assert not is_uuid_like(None)
    assert not is_uuid_like("bdc96b72-3f35-4cae-9e79-99473eb4a23")     # one char short
    assert not is_uuid_like("gggggggg-3f35-4cae-9e79-99473eb4a23b")    # not hex


# ── Every command is behind the gate ──────────────────────────────────────────────────────

def test_every_api_command_requires_a_login():
    """
    A new endpoint added later without the gate is exactly how this hole reopens. This walks
    the real app and fails if any command can be reached without a login.
    """
    from app.main import app

    def dependencies_of(dependant):
        found = []
        for dep in dependant.dependencies:
            found.append(dep.call)
            found += dependencies_of(dep)
        return found

    ungated = [
        r.path for r in app.routes
        if getattr(r, "path", "").startswith("/api")
        and require_auth not in dependencies_of(r.dependant)
    ]
    assert not ungated, f"these commands answer without a login: {ungated}"


def test_all_twelve_commands_are_present():
    """If a command disappears from this list, the gate audit above stops covering it."""
    from app.main import app
    paths = {r.path for r in app.routes if getattr(r, "path", "").startswith("/api")}
    assert paths == {
        "/api/get-routes", "/api/delete-route", "/api/set-route-sequence",
        "/api/start-machine", "/api/get-next-item", "/api/skip-machine",
        "/api/go-back-to-skipped", "/api/update-session", "/api/resume-state",
        "/api/upload-pdf", "/api/diag", "/api/openai-chat",
    }, sorted(paths)
