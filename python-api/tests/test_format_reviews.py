from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.routes.format_reviews import (
    ReviewUpdate,
    get_report_format_pdf,
    list_report_formats,
    test_report_format_notification as send_test_notification,
    update_report_format,
)
from app.services.auth import Caller, FORBIDDEN_MESSAGE

ADMIN = Caller(
    user_id="bdc96b72-3f35-4cae-9e79-99473eb4a23b",
    account_id="platform-account",
    team_user_ids=["bdc96b72-3f35-4cae-9e79-99473eb4a23b"],
)
NON_ADMIN = Caller(user_id="user-1", account_id="account-1", team_user_ids=["user-1"])


def _query(data):
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.limit.return_value = query
    query.order.return_value = query
    query.in_.return_value = query
    query.execute.return_value = SimpleNamespace(data=data)
    return query


def test_non_platform_user_cannot_read_format_queue():
    with pytest.raises(HTTPException) as caught:
        list_report_formats(NON_ADMIN)
    assert (caught.value.status_code, caught.value.detail) == (403, FORBIDDEN_MESSAGE)


def test_notification_check_requires_platform_admin_and_confirms_delivery():
    with patch("app.routes.format_reviews.notify_russ", return_value=True) as notify:
        assert send_test_notification(ADMIN) == {"delivered": True}
    notify.assert_called_once()

    with pytest.raises(HTTPException) as caught:
        send_test_notification(NON_ADMIN)
    assert caught.value.status_code == 403


def test_notification_check_reports_missing_or_broken_telegram_setup():
    with patch("app.routes.format_reviews.notify_russ", return_value=False), \
         pytest.raises(HTTPException) as caught:
        send_test_notification(ADMIN)
    assert caught.value.status_code == 503
    assert "Telegram did not confirm delivery" in caught.value.detail


def test_admin_queue_hides_stored_pdf_reference_and_includes_company():
    db = MagicMock()
    pending = _query([{
        "id": "review-1",
        "account_id": "account-1",
        "user_id": "user-1",
        "account_email": "owner@example.com",
        "vendor": "Nayax",
        "filename": "route.pdf",
        "pdf_url": "https://test.supabase.co/storage/v1/object/public/route-pdfs/pending/report.pdf",
        "reason": "unsupported_vendor",
        "status": "new",
        "created_at": "2026-10-03T12:00:00Z",
        "updated_at": "2026-10-03T12:00:00Z",
        "review_notes": None,
    }])
    accounts = _query([{
        "id": "account-1",
        "name": "Acme Vending",
        "report_source": "other",
        "report_source_name": "Nayax",
        "report_format_status": "submitted",
    }])
    db.table.side_effect = lambda name: {
        "pending_unrecognized_formats": pending,
        "accounts": accounts,
    }[name]
    with patch("app.routes.format_reviews.get_client", return_value=db):
        result = list_report_formats(ADMIN)

    item = result["items"][0]
    assert item["account_name"] == "Acme Vending"
    assert item["pdf_available"] is True
    assert "pdf_url" not in item


def test_admin_pdf_access_uses_short_lived_signed_url():
    db = MagicMock()
    db.table.return_value = _query([{
        "id": "review-1",
        "pdf_url": "route-pdfs/pending/user/report.pdf",
    }])
    db.storage.from_.return_value.create_signed_url.return_value = {
        "signedURL": "https://test.supabase.co/storage/v1/object/sign/route-pdfs/pending/user/report.pdf?token=short"
    }
    with patch("app.routes.format_reviews.get_client", return_value=db):
        result = get_report_format_pdf("review-1", ADMIN)
    assert result["expires_in"] == 60
    assert "token=short" in result["url"]


def test_ready_update_is_confirmed_through_atomic_rpc():
    db = MagicMock()
    db.rpc.return_value.execute.return_value.data = {
        "id": "review-1",
        "status": "ready",
        "review_notes": "Validated against totals",
        "updated_at": "2026-10-03T12:30:00Z",
        "account_format_status": "ready",
    }
    with patch("app.routes.format_reviews.get_client", return_value=db):
        result = update_report_format(
            "review-1",
            ReviewUpdate(status="ready", notes="Validated against totals"),
            ADMIN,
        )
    assert result["account_format_status"] == "ready"
    args = db.rpc.call_args.args
    assert args[0] == "update_report_format_review"
    assert args[1]["p_reviewer_id"] == ADMIN.user_id
