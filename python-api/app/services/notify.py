"""Admin alerts via Telegram (VisionAIry bot).

Used to ping Russ when an operator uploads a report format we don't parse yet.
Best-effort by design: a failed notification must NEVER fail the upload.

Reads TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID from the environment directly (set on
the deploy platform). If they're absent, notifications quietly no-op.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request


def notify_russ(text: str) -> bool:
    """Send a plain-text Telegram message to Russ. Returns True on success, False otherwise.

    Never raises. If the bot token / chat id aren't configured, it quietly no-ops.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False
    data = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": "true",
        }
    ).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", data=data
    )
    # Network/timeout errors (OSError, URLError) and a malformed body (ValueError,
    # JSONDecodeError) are caught specifically — a failed alert must never fail the upload.
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return bool(json.load(resp).get("ok", False))
    except (urllib.error.URLError, OSError, ValueError):
        return False
