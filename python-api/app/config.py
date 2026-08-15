import os
from dotenv import load_dotenv

load_dotenv()

# Read, don't demand. These used to be required the instant this file was imported, which
# meant merely IMPORTING the app — as the automated test run does — died on a missing setting
# before anything could run. On 2026-08-15 that turned every push into a failed test report
# whose cause had nothing to do with any test.
#
# The server still refuses to start without them; that check now lives in main.py, where
# starting actually happens. So a genuinely misconfigured deploy still fails loudly and
# immediately, while importing the code to inspect or test it does not.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


def require_runtime_settings() -> None:
    """Fail loudly, at startup, if the server cannot possibly work. Called from main.py."""
    missing = [n for n, v in (("SUPABASE_URL", SUPABASE_URL),
                              ("SUPABASE_SERVICE_KEY", SUPABASE_SERVICE_KEY)) if not v]
    if missing:
        raise RuntimeError(
            "Cannot start: missing required settings " + ", ".join(missing)
            + ". Set them on the hosting platform (Render), never in the repository."
        )
