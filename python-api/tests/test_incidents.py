from types import SimpleNamespace
from unittest.mock import patch


class Query:
    def __init__(self, table, calls, *, duplicate=False):
        self.table = table
        self.calls = calls
        self.payload = None
        self.duplicate = duplicate
        self.filters = []

    def select(self, *_args, **_kwargs): return self
    def eq(self, column, value):
        self.filters.append((column, value))
        return self
    def limit(self, *_args, **_kwargs): return self
    def update(self, payload):
        self.calls.append(("update", self.table, payload))
        return self
    def upsert(self, payload, **kwargs):
        self.payload = payload
        self.calls.append(("upsert", self.table, payload, kwargs))
        return self
    def execute(self):
        if self.table == "profiles":
            return SimpleNamespace(data=[{
                "email": "driver@example.test",
                "first_name": "Test",
                "last_name": "Driver",
            }])
        if self.table == "support_incidents" and self.duplicate and self.payload:
            return SimpleNamespace(data=[])
        if self.table == "support_incidents" and self.duplicate:
            return SimpleNamespace(data=[{"notification_status": "sent"}])
        return SimpleNamespace(data=[self.payload or {"ok": True}])


class FakeDB:
    def __init__(self, *, duplicate=False):
        self.calls = []
        self.duplicate = duplicate

    def table(self, name):
        return Query(name, self.calls, duplicate=self.duplicate)


def payload(report_id="00000000-0000-4000-8000-000000000123"):
    return {
        "client_report_id": report_id,
        "description": "The app repeated the same item.",
        "category": "feature_improvement",
        "session_id": "phone-session",
        "context": {"route": {"name": "Test route", "machine_name": "Test machine"}},
    }


def test_user_report_is_tenant_stamped_and_notification_is_best_effort(client):
    db = FakeDB()
    with patch("app.routes.incidents.get_client", return_value=db), patch(
        "app.routes.incidents.send_incident_email", return_value=(False, "not configured")
    ) as notify:
        response = client.post("/api/incidents", json=payload())
    assert response.status_code == 201
    assert response.json() == {
        "ok": True,
        "incident_id": "00000000-0000-4000-8000-000000000123",
        "notification_sent": False,
        "created": True,
    }
    inserted = next(call[2] for call in db.calls if call[0] == "upsert")
    assert inserted["account_id"] == "00000000-0000-0000-0000-00000000a001"
    assert inserted["reporter_user_id"] == "00000000-0000-0000-0000-00000000c001"
    assert inserted["notification_status"] == "pending"
    assert inserted["context"]["report_category"] == "feature_improvement"
    notify.assert_called_once()


def test_duplicate_retry_is_idempotent_and_scoped_to_reporter(client):
    db = FakeDB(duplicate=True)
    with patch("app.routes.incidents.get_client", return_value=db), patch(
        "app.routes.incidents.send_incident_email"
    ) as notify:
        response = client.post("/api/incidents", json=payload())
    assert response.status_code == 201
    assert response.json()["created"] is False
    assert response.json()["notification_sent"] is True
    notify.assert_not_called()


def test_incident_payload_is_bounded(client):
    db = FakeDB()
    oversized = payload("00000000-0000-4000-8000-000000000124")
    oversized["context"] = {"recent_voice_events": ["x" * 70_000]}
    with patch("app.routes.incidents.get_client", return_value=db):
        response = client.post("/api/incidents", json=oversized)
    assert response.status_code == 413
    assert not any(call[0] == "upsert" for call in db.calls)
