import json
from unittest.mock import MagicMock, patch

from app.services.incident_notify import send_incident_email


def test_telegram_fallback_sends_only_a_minimal_wakeup_notice():
    with patch("app.services.incident_notify.RESEND_API_KEY", ""), patch(
        "app.services.incident_notify.INCIDENT_ALERT_TO", ""
    ), patch("app.services.incident_notify.INCIDENT_FROM_EMAIL", ""), patch(
        "app.services.incident_notify.notify_russ", return_value=True
    ) as telegram:
        sent, error = send_incident_email(
            "incident-123",
            {"name": "Private Driver", "email": "private@example.test"},
            {
                "report_category": "feature_improvement",
                "route": {"name": "Private Route", "current_item": "Private Product"},
            },
            "Private report description",
        )

    assert sent is True
    assert error is None
    message = telegram.call_args.args[0]
    assert "Feature Improvement" in message
    assert "incident-123" in message
    assert "Private Driver" not in message
    assert "private@example.test" not in message
    assert "Private Route" not in message
    assert "Private Product" not in message
    assert "Private report description" not in message


def test_missing_telegram_and_email_configuration_is_reported():
    with patch("app.services.incident_notify.RESEND_API_KEY", ""), patch(
        "app.services.incident_notify.INCIDENT_ALERT_TO", ""
    ), patch("app.services.incident_notify.INCIDENT_FROM_EMAIL", ""), patch(
        "app.services.incident_notify.notify_russ", return_value=False
    ):
        sent, error = send_incident_email("incident-456", {}, {}, "description")

    assert sent is False
    assert error == "Telegram and email notifications are not configured"


def test_resend_request_identifies_stockerai_client():
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = json.dumps({"id": "email-123"}).encode("utf-8")

    with patch("app.services.incident_notify.RESEND_API_KEY", "test-key"), patch(
        "app.services.incident_notify.INCIDENT_ALERT_TO", "admin@example.test"
    ), patch(
        "app.services.incident_notify.INCIDENT_FROM_EMAIL", "StockerAI <alerts@example.test>"
    ), patch(
        "app.services.incident_notify.notify_russ", return_value=False
    ), patch(
        "app.services.incident_notify.urllib.request.urlopen", return_value=response
    ) as urlopen:
        sent, error = send_incident_email("incident-789", {}, {}, "description")

    request = urlopen.call_args.args[0]
    assert request.get_header("User-agent") == "StockerAI/1.0"
    assert sent is True
    assert error is None
