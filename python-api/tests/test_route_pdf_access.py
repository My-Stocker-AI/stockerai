from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.config import SUPABASE_URL
from app.routes.routes import (
    _ROUTE_PDF_TTL_SECONDS,
    _storage_path_from_reference,
    get_route_pdf_url,
)
from app.services.auth import Caller, FORBIDDEN_MESSAGE


CALLER = Caller(user_id="user-1", account_id="account-1", team_user_ids=["user-1", "user-2"])
PUBLIC_REFERENCE = (
    f"{SUPABASE_URL}/storage/v1/object/public/"
    "route-pdfs/user-2/2026-10-01/North.pdf"
)
SIGNED_URL = (
    f"{SUPABASE_URL}/storage/v1/object/sign/"
    "route-pdfs/user-2/2026-10-01/North.pdf?token=short"
)


class Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        rows = [
            row for row in self.rows
            if all(row.get(column) == value for column, value in self.filters)
        ]
        return SimpleNamespace(data=rows)


class Bucket:
    def __init__(self):
        self.calls = []

    def create_signed_url(self, path, expires_in):
        self.calls.append((path, expires_in))
        return {"signedURL": SIGNED_URL}


class Storage:
    def __init__(self):
        self.bucket = Bucket()
        self.names = []

    def from_(self, name):
        self.names.append(name)
        return self.bucket


class FakeDB:
    def __init__(self, *, routes, assignments=(), memberships=()):
        self.rows = {
            "routes": list(routes),
            "route_assignments": list(assignments),
            "account_users": list(memberships),
        }
        self.storage = Storage()

    def table(self, name):
        return Query(self.rows[name])


def route(**overrides):
    value = {
        "id": "route-1",
        "user_id": "user-2",
        "account_id": "account-1",
        "pdf_url": PUBLIC_REFERENCE,
    }
    value.update(overrides)
    return value


def call(db):
    with patch("app.routes.routes.get_client", return_value=db):
        return get_route_pdf_url("route-1", CALLER)


def test_route_owner_receives_only_a_short_lived_signed_url():
    db = FakeDB(routes=[route(user_id=CALLER.user_id)])

    assert call(db) == {"url": SIGNED_URL, "expires_in": _ROUTE_PDF_TTL_SECONDS}
    assert db.storage.names == ["route-pdfs"]
    assert db.storage.bucket.calls == [("user-2/2026-10-01/North.pdf", 60)]


def test_assigned_driver_can_open_the_route_pdf():
    db = FakeDB(
        routes=[route()],
        assignments=[{"route_id": "route-1", "user_id": CALLER.user_id}],
    )
    assert call(db)["url"] == SIGNED_URL


@pytest.mark.parametrize("membership", [
    {"account_id": "account-1", "user_id": "user-1", "role": "primary_admin", "can_view_all_routes": False},
    {"account_id": "account-1", "user_id": "user-1", "role": "driver", "can_view_all_routes": True},
])
def test_account_wide_route_viewer_can_open_the_route_pdf(membership):
    db = FakeDB(routes=[route()], memberships=[membership])
    assert call(db)["url"] == SIGNED_URL


def test_unassigned_driver_in_same_account_is_refused():
    db = FakeDB(routes=[route()])
    with pytest.raises(HTTPException) as caught:
        call(db)
    assert (caught.value.status_code, caught.value.detail) == (403, FORBIDDEN_MESSAGE)
    assert not db.storage.bucket.calls


def test_foreign_and_missing_routes_are_indistinguishable():
    outcomes = []
    for rows in ([route(account_id="account-2")], []):
        with pytest.raises(HTTPException) as caught:
            call(FakeDB(routes=rows))
        outcomes.append((caught.value.status_code, caught.value.detail))
    assert outcomes == [(403, FORBIDDEN_MESSAGE), (403, FORBIDDEN_MESSAGE)]


def test_stored_reference_must_be_the_expected_project_and_bucket():
    assert _storage_path_from_reference(PUBLIC_REFERENCE) == "user-2/2026-10-01/North.pdf"
    assert _storage_path_from_reference("route-pdfs/user-2/date/report.pdf") == "user-2/date/report.pdf"
    for bad in (
        "https://attacker.invalid/storage/v1/object/public/route-pdfs/report.pdf",
        f"{SUPABASE_URL}/storage/v1/object/public/other/report.pdf",
        "route-pdfs/../report.pdf",
    ):
        with pytest.raises(ValueError):
            _storage_path_from_reference(bad)
