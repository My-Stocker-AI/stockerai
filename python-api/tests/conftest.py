"""Isolated server tests: install test settings before importing application modules."""

import json
import os
import socket

import pytest
from fastapi import Request
from unittest.mock import patch
from tests.test_safety import require_local_target

# Establish isolation BEFORE collection imports app.config or any fixture.
# Never discover developer/production credentials through dotenv in a test run.
_dotenv_patch = patch("dotenv.load_dotenv", return_value=False)
_dotenv_patch.start()
_database_enabled = os.environ.get("STOCKERAI_DB_TESTS") == "1"
DEFAULT_TEST_ACCOUNT = "00000000-0000-0000-0000-00000000a001"
if _database_enabled:
    try:
        os.environ["SUPABASE_URL"] = require_local_target(os.environ.get("STOCKERAI_TEST_SUPABASE_URL", ""))
        key = os.environ.get("STOCKERAI_TEST_SERVICE_KEY", "")
        if not key:
            raise ValueError("Explicit disposable test service key is required")
        os.environ["SUPABASE_SERVICE_KEY"] = key
    except ValueError as exc:
        raise pytest.UsageError(str(exc)) from None
else:
    os.environ["SUPABASE_URL"] = "http://127.0.0.1:54321"
    os.environ["SUPABASE_SERVICE_KEY"] = "unit-test-placeholder"
os.environ["OPENAI_API_KEY"] = ""

import supabase
_create_client = supabase.create_client


def _isolated_client(url, key, *args, **kwargs):
    if not _database_enabled:
        raise RuntimeError("Database access disabled: mock the client or opt into disposable local tests")
    require_local_target(url)
    if url != os.environ["SUPABASE_URL"] or key != os.environ["SUPABASE_SERVICE_KEY"]:
        raise RuntimeError("Database client does not match the explicit test target")
    return _create_client(url, key, *args, **kwargs)


_client_patch = patch("supabase.create_client", side_effect=_isolated_client)
_client_patch.start()

# Cover accidental provider calls and HTTP paths that bypass the database helper.
_socket_connect = socket.socket.connect
def _local_connect(sock, address):
    # Windows asyncio uses a loopback socket pair even for an in-process TestClient.
    if not isinstance(address, tuple) or address[0] not in {"127.0.0.1", "::1", "localhost"}:
        raise RuntimeError("External network disabled in backend tests")
    return _socket_connect(sock, address)

_network_patch = patch("socket.socket.connect", _local_connect)
_network_patch.start()


def pytest_unconfigure(config):
    _network_patch.stop()
    _client_patch.stop()
    _dotenv_patch.stop()


@pytest.fixture(autouse=True)
def _cleanup_recorded_routes(request):
    yield
    fixtures = getattr(request.module, "FIXTURES", None)
    if fixtures is not None and fixtures.route_ids:
        from app.services.database import get_client
        fixtures.cleanup(get_client())


@pytest.fixture(scope="module", autouse=True)
def _disposable_identity(request):
    """Provision the Auth -> profile FK chain only on our marked local database.

    HTTP authentication remains mocked for picking logic tests. Auth creation here
    exercises the captured profile trigger, not the application's signup journey.
    """
    fixtures = getattr(request.module, "FIXTURES", None)
    if not _database_enabled or fixtures is None:
        yield
        return
    import secrets
    from app.services.database import get_client
    db = get_client()
    if db.rpc("stockerai_disposable_marker").execute().data != "stockerai-local-only-20260918":
        raise RuntimeError("Target is not the marked StockerAI disposable database")
    created = db.auth.admin.create_user({
        "id": fixtures.user_id,
        "email": f"{fixtures.user_id}@example.invalid",
        "password": secrets.token_urlsafe(32),
        "email_confirm": True,
    })
    if not created.user or created.user.id != fixtures.user_id:
        raise RuntimeError("Disposable Auth identity did not match the requested fixture")
    db.table("accounts").insert({"id": DEFAULT_TEST_ACCOUNT, "name": "DISPOSABLE_TEST_ACCOUNT"}).execute()
    db.table("account_users").insert({
        "account_id": DEFAULT_TEST_ACCOUNT,
        "user_id": fixtures.user_id,
        "role": "driver",
    }).execute()
    try:
        yield
    finally:
        fixtures.cleanup(db)
        db.auth.admin.delete_user(fixtures.user_id)
        db.table("accounts").delete().eq("id", DEFAULT_TEST_ACCOUNT).execute()

DEFAULT_TEST_USER = "00000000-0000-0000-0000-00000000c001"


def _load_app():
    """Import errors are failures, not missing-configuration skips."""
    from app.main import app
    from app.services.auth import Caller, require_auth
    return app, Caller, require_auth


def _make_stand_in(Caller):
    """
    Stands in for the login gate while the server tests run.

    Every command needs a verified login now. These tests are about picking logic — resume
    points, skip handling, double-count guards. Database-enabled runs create throwaway
    Auth/profile identities, but these requests still bypass the real login gate.

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
        return Caller(user_id=user_id, account_id=DEFAULT_TEST_ACCOUNT, team_user_ids=[user_id])

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
