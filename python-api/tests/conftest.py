"""
Shared setup for the server tests.

NOTHING HERE MAY IMPORT THE APP AT LOAD TIME. The app reads its database settings the moment
it is imported and stops dead if they are absent. The automated runner has no settings, so a
top-level import kills the whole suite before a single test starts — which is exactly what
happened on 2026-08-15: every push reported a failed test run, and the failure had nothing to
do with any test. Every import below therefore happens inside a fixture, where it can be
caught, and the suite still runs whatever does not need a live database.
"""

import json
import os

import pytest
from fastapi import Request
from unittest.mock import patch

DEFAULT_TEST_USER = "00000000-0000-0000-0000-00000000c001"


def _load_app():
    """Import the app, or return None where there are no settings to load it with."""
    try:
        from app.main import app
        from app.services.auth import Caller, require_auth
        return app, Caller, require_auth
    except Exception:
        return None, None, None


def _make_stand_in(Caller):
    """
    Stands in for the login gate while the server tests run.

    Every command needs a verified login now. These tests are about picking logic — resume
    points, skip handling, double-count guards — and they use throwaway users that do not
    exist in Supabase Auth at all, so a real login could never be issued for them.

    So the gate is replaced by one that takes the caller from the request, as the server used
    to. That is only safe because it is confined to this file: the real gate is proved by
    tests/test_account_isolation.py (what it refuses) and by tests/api/isolation_proof.py
    (one real account reaching for another's data, against a live server).
    """
    async def _caller_for_tests(request: Request):
        user_id = None
        try:
            content_type = request.headers.get("content-type", "")
            if "json" in content_type:
                raw = await request.body()
                if raw:
                    user_id = json.loads(raw).get("user_id")
            elif "form" in content_type:
                user_id = (await request.form()).get("user_id")
        except Exception:
            pass
        user_id = user_id or os.environ.get("TEST_USER_ID") or DEFAULT_TEST_USER
        return Caller(user_id=user_id, account_id="test-account", team_user_ids=[user_id])

    return _caller_for_tests


@pytest.fixture(autouse=True)
def _stand_in_for_the_login_gate():
    """Applied to every test, so no test file has to know the gate exists."""
    app, Caller, require_auth = _load_app()
    if app is None:
        yield  # no settings here — the tests that need them skip themselves
        return
    app.dependency_overrides[require_auth] = _make_stand_in(Caller)
    yield
    app.dependency_overrides.pop(require_auth, None)


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for unit tests."""
    with patch("app.services.database._client") as mock_client:
        yield mock_client


@pytest.fixture
def client():
    """A test client for the real app."""
    from fastapi.testclient import TestClient
    app, _, _ = _load_app()
    if app is None:
        pytest.skip("no database settings available, so the app cannot be loaded")
    return TestClient(app)
