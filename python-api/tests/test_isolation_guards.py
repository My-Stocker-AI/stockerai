from unittest.mock import MagicMock
import pytest
import supabase
from tests.test_safety import FixtureRoutes, require_local_target


@pytest.mark.parametrize("url", [
    "https://wvtkuposrlvadyeixlke.supabase.co", "https://staging.supabase.co",
    "http://localhost.evil.test:54321", "http://localhost:54321@evil.test",
    "http://user:secret@localhost:54321", "http://localhost", "",
    "http://127.0.0.1:54321/path", "http://127.0.0.1:54321?target=production",
])
def test_refuses_non_disposable_targets(url):
    with pytest.raises(ValueError):
        require_local_target(url)


@pytest.mark.parametrize("url", ["http://localhost:54321", "http://127.0.0.1:54321/", "http://[::1]:54321"])
def test_accepts_explicit_loopback_target(url):
    assert require_local_target(url) == url.rstrip("/")


def test_cleanup_is_scoped_to_created_route_and_fresh_identity():
    fixtures = FixtureRoutes()
    other = FixtureRoutes()
    assert fixtures.user_id != other.user_id
    db = MagicMock()
    fixtures.cleanup(db)
    db.table.assert_not_called()
    fixtures.record("created-route")
    fixtures.cleanup(db)
    sessions = db.table.return_value.delete.return_value
    sessions.eq.assert_any_call("current_route_id", "created-route")
    sessions.eq.assert_any_call("id", "created-route")
    sessions.eq.return_value.eq.assert_called_with("user_id", fixtures.user_id)
    assert not fixtures.route_ids


def test_cleanup_failure_retains_record_for_retry():
    fixtures = FixtureRoutes()
    fixtures.record("created-route")
    db = MagicMock()
    db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.side_effect = RuntimeError("offline")
    with pytest.raises(RuntimeError):
        fixtures.cleanup(db)
    assert fixtures.route_ids == {"created-route"}


def test_unmocked_database_connection_is_refused_in_unit_mode():
    import os
    if os.environ.get("STOCKERAI_DB_TESTS") == "1":
        pytest.skip("unit-mode boundary")
    with pytest.raises(RuntimeError, match="Database access disabled"):
        supabase.create_client("http://127.0.0.1:54321", "placeholder")


def test_external_socket_is_refused_before_connecting():
    import socket
    with socket.socket() as sock, pytest.raises(RuntimeError, match="External network disabled"):
        sock.connect(("203.0.113.1", 443))
