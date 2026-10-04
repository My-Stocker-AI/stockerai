"""Best-effort admin alert delivery for user-submitted support incidents."""

import html
import json
import urllib.error
import urllib.request

from app.config import INCIDENT_ALERT_TO, INCIDENT_FROM_EMAIL, RESEND_API_KEY
from app.services.notify import notify_russ


def _line(label: str, value: object) -> str:
    return f"<p><strong>{html.escape(label)}:</strong> {html.escape(str(value or 'Not available'))}</p>"


def send_incident_email(
    incident_id: str,
    reporter: dict,
    context: dict,
    description: str,
) -> tuple[bool, str | None]:
    """Send a bounded incident summary without exposing provider errors to the driver."""
    category = str(context.get("report_category") or "bug").replace("_", " ").title()
    # Telegram is deliberately only a wake-up notice. Report text and driver context
    # remain in the tenant-bound incident record (and the existing configured email).
    telegram_sent = notify_russ(f"New StockerAI {category}. Incident {incident_id} is saved for review.")

    if not RESEND_API_KEY or not INCIDENT_ALERT_TO or not INCIDENT_FROM_EMAIL:
        return (True, None) if telegram_sent else (False, "Telegram and email notifications are not configured")

    route = context.get("route") or {}
    voice = context.get("voice") or {}
    device = context.get("device") or {}
    body = "".join([
        f"<h2>StockerAI {html.escape(category)}</h2>",
        _line("Incident", incident_id),
        _line("Driver", reporter.get("name") or reporter.get("email")),
        _line("Email", reporter.get("email")),
        _line("Route", route.get("name")),
        _line("Machine", route.get("machine_name")),
        _line("Current item", route.get("current_item")),
        _line("Voice", voice.get("status")),
        _line("Connection", device.get("online")),
        f"<h3>What the user reported</h3><p>{html.escape(description).replace(chr(10), '<br>')}</p>",
        "<p>Additional bounded device and voice context is stored with the incident in Supabase.</p>",
    ])
    payload = json.dumps({
        "from": INCIDENT_FROM_EMAIL,
        "to": [INCIDENT_ALERT_TO],
        "subject": f"StockerAI {category}: {route.get('name') or 'no route'} / {route.get('machine_name') or 'no machine'}",
        "html": body,
        "text": (
            f"StockerAI user report\nIncident: {incident_id}\n"
            f"Driver: {reporter.get('name') or reporter.get('email') or 'Not available'}\n"
            f"Route: {route.get('name') or 'Not available'}\n"
            f"Machine: {route.get('machine_name') or 'Not available'}\n"
            f"Current item: {route.get('current_item') or 'Not available'}\n"
            f"Voice: {voice.get('status') or 'Not available'}\n\n{description}"
        ),
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.load(response)
            email_sent = bool(result.get("id"))
            sent = telegram_sent or email_sent
            return sent, None if sent else "notification providers returned no message id"
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return (True, None) if telegram_sent else (False, type(exc).__name__)
