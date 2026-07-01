"""Onboarding format-intake — capture-and-wait behavior on upload.

Verifies the new routing: an "Other" vendor or an unrecognized report is captured
(saved + Telegram alert + warm message) instead of dead-ending, while a recognized
report is NOT diverted into the capture path.
"""

import io
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient


def _dummy_pdf():
    # extract_text_from_pdf is patched (or unreached for "Other"), so the bytes are irrelevant.
    return ("route.pdf", io.BytesIO(b"%PDF-1.4 dummy"), "application/pdf")


def _mock_db():
    """A db whose profile-email lookup returns an address; other chains return MagicMocks."""
    db = MagicMock()
    (db.table.return_value.select.return_value.eq.return_value
       .limit.return_value.execute.return_value.data) = [{"email": "operator@example.com"}]
    return db


def _pending_rows(db):
    return [c for c in db.table.call_args_list if c.args and c.args[0] == "pending_unrecognized_formats"]


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_other_vendor_is_captured(client):
    db = _mock_db()
    with patch("app.routes.upload.get_client", return_value=db), \
         patch("app.routes.upload.notify_russ") as notify:
        r = client.post(
            "/api/upload-pdf",
            data={"date": "2026-07-02", "user_id": "u1", "vendor": "Other"},
            files={"pdf": _dummy_pdf()},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "pending_format"
    assert body["vendor"] == "Other"
    assert "email" in body["message"].lower()
    assert _pending_rows(db), "a row should be inserted into pending_unrecognized_formats"
    notify.assert_called_once()


def test_unrecognized_report_is_captured(client):
    db = _mock_db()
    with patch("app.routes.upload.get_client", return_value=db), \
         patch("app.routes.upload.extract_text_from_pdf", return_value="x" * 100), \
         patch("app.routes.upload.parse_route_pdf", return_value={"route_name": None, "locations": []}), \
         patch("app.routes.upload.notify_russ") as notify:
        r = client.post(
            "/api/upload-pdf",
            data={"date": "2026-07-02", "user_id": "u1", "vendor": "Parlevel"},
            files={"pdf": _dummy_pdf()},
        )
    assert r.status_code == 200
    assert r.json()["status"] == "pending_format"
    assert _pending_rows(db)
    notify.assert_called_once()


def test_recognized_report_is_not_diverted():
    # raise_server_exceptions=False: the mock db can't fully satisfy the normal insert
    # path, but the point is only that a recognized parse is NOT sent to capture-and-wait.
    from app.main import app
    client = TestClient(app, raise_server_exceptions=False)
    db = _mock_db()
    parsed = {
        "route_name": "South",
        "delivery_date": "2026-07-02",
        "locations": [{"location_name": "Loc", "machines": [
            {"machine_name": "M1", "asset_number": 54, "items": [
                {"product_name": "Chips", "quantity": 3, "slot": "010",
                 "inventory_current": 6, "inventory_parlevel": 9}]}]}],
        "warnings": [],
    }
    with patch("app.routes.upload.get_client", return_value=db), \
         patch("app.routes.upload.extract_text_from_pdf", return_value="x" * 100), \
         patch("app.routes.upload.parse_route_pdf", return_value=parsed), \
         patch("app.routes.upload._capture_pending") as cap, \
         patch("app.routes.upload.notify_russ"):
        client.post(
            "/api/upload-pdf",
            data={"date": "2026-07-02", "user_id": "u1", "vendor": "Parlevel"},
            files={"pdf": _dummy_pdf()},
        )
    cap.assert_not_called()
