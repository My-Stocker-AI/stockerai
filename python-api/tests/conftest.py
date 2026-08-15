import json
import os

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.services.auth import Caller, require_auth

DEFAULT_TEST_USER = "00000000-0000-0000-0000-00000000c001"


async def _caller_for_tests(request: Request) -> Caller:
    """
    Stands in for the login gate while unit tests run.

    Every API command now requires a verified login. These tests are about picking logic —
    resume points, skip handling, double-count guards — and they use throwaway users that do
    not exist in Supabase Auth at all, so a real token could never be minted for them.

    So the gate is replaced here by one that takes the caller from the request, exactly as
    the server used to. That is safe ONLY because it is confined to this file: the real gate
    is proved separately by tests/test_account_isolation.py (what it refuses) and by
    tests/api/isolation_proof.py (one real account reaching for another's data, live).
    """
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


@pytest.fixture(autouse=True)
def _stand_in_for_the_login_gate():
    """Applied to every test in this suite, so no test file needs to know the gate exists."""
    app.dependency_overrides[require_auth] = _caller_for_tests
    yield
    app.dependency_overrides.pop(require_auth, None)


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for unit tests."""
    with patch("app.services.database._client") as mock_client:
        yield mock_client


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)
