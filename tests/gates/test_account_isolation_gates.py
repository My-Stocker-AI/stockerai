"""
GATES — the checks the spec points at, so verification runs something instead of asserting.

The account-isolation spec listed 59 promised outcomes. Fifty-three had no runnable check at
all, and three of the six that did merely checked that a file existed — files that had existed
since the backend was first written. Those three would have reported green before a single line
of this work was done. A check that passes when the work has not happened is worse than no
check, because it is mistaken for evidence.

Each test here runs a real suite and passes only if that suite passes. They live at the
repository root, outside the server's own environment, because the runner that verifies the
spec cannot see the server's libraries — so each one calls out to the environment that can.

Slow by nature: these start servers and drive browsers. That is the price of a check that
means something.
"""

import os
import shutil
import socket
import subprocess
import time

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API_DIR = os.path.join(ROOT, "python-api")
VENV_PY = os.path.join(API_DIR, "venv", "bin", "python")
PROBE_PORT = 8098
PROBE_URL = f"http://127.0.0.1:{PROBE_PORT}"


def _env_for_api() -> dict:
    """The server reads its settings from the project .env, under different names."""
    env = dict(os.environ)
    with open(os.path.join(ROOT, ".env")) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env["SUPABASE_URL"] = env["VITE_SUPABASE_URL"]
    env["SUPABASE_SERVICE_KEY"] = env["SUPABASE_SERVICE_ROLE_KEY"]
    return env


def _port_open(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


@pytest.fixture(scope="session")
def gated_api():
    """A real instance of the gated server, started for these checks and stopped after."""
    if not os.path.exists(VENV_PY):
        pytest.fail(f"the server environment is missing at {VENV_PY} — cannot verify anything")

    proc = subprocess.Popen(
        [VENV_PY, "-m", "uvicorn", "app.main:app", "--port", str(PROBE_PORT), "--log-level", "warning"],
        cwd=API_DIR, env=_env_for_api(),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(60):
            if _port_open(PROBE_PORT):
                break
            time.sleep(0.5)
        else:
            pytest.fail("the server never came up — cannot verify anything against it")
        yield PROBE_URL
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def _run(cmd, cwd=ROOT, timeout=900, env=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                          timeout=timeout, env=env or dict(os.environ))


def _explain(label: str, result) -> str:
    return (f"{label} failed (exit {result.returncode})\n"
            f"--- last output ---\n{result.stdout[-2500:]}\n{result.stderr[-1200:]}")


# ── The gates ──────────────────────────────────────────────────────────────────────────────

def test_accounts_are_isolated(gated_api):
    """
    One account cannot see or change another's data, and its own still works.

    Signs in as one real account, reaches for the other's real route, machine, session and
    items, and checks every command. Also runs a whole route of its own start to finish, so a
    server that simply refuses everything cannot pass as isolated.
    """
    r = _run(["python3", "tests/api/isolation_proof.py", gated_api], env=_env_for_api())
    assert r.returncode == 0, _explain("the cross-account isolation proof", r)


def test_the_app_sends_its_login_in_a_real_browser(gated_api):
    """
    The middle link nothing else covers: a browser reading the stored login, attaching it, and
    the server accepting it — plus the quiet renewal when that login has gone stale mid-route.
    """
    if not shutil.which("npx"):
        pytest.fail("npx is missing — the browser check cannot run")
    env = dict(os.environ)
    env["STOCKER_TEST_API"] = gated_api
    r = _run(["npx", "playwright", "test", "login-is-sent", "--reporter=line"], env=env)
    assert r.returncode == 0, _explain("the browser login check", r)


def test_the_server_suite_passes():
    """Every server-side test, including what the login gate must refuse and never disclose."""
    r = _run([VENV_PY, "-m", "pytest", "tests/", "-q", "--tb=line", "-p", "no:cacheprovider"],
             cwd=API_DIR, env=_env_for_api())
    assert r.returncode == 0, _explain("the server test suite", r)


def test_the_app_suite_passes():
    """Every app-side test, including the mid-route login renewal."""
    r = _run(["npx", "vitest", "run", "--reporter=dot"])
    assert r.returncode == 0, _explain("the app test suite", r)


def test_the_browser_can_still_reach_the_server(gated_api):
    """
    A browser refuses to send a header the server did not grant in advance. If the login header
    were not granted, every call would be blocked on the phone before it ever left — which looks
    exactly like the server being down, with nothing in the logs to show it happened.
    """
    env = _env_for_api()
    env["STOCKER_API"] = gated_api
    r = _run(["bash", "tests/api/cors_mobile_test.sh"], env=env)
    assert r.returncode == 0, _explain("the connection and login check", r)


def test_a_skipped_machine_is_never_abandoned(gated_api):
    """The end-to-end script, which now signs in the way the app does."""
    env = _env_for_api()
    env["STOCKER_API"] = gated_api
    _run(["python3", "tests/api/seed_e2e_route.py"], env=env)
    r = _run(["bash", "tests/api/test_bug3_skip_route_complete.sh"], env=env)
    assert r.returncode == 0, _explain("the skip-machine end-to-end check", r)


# ── Fast structural gates ──────────────────────────────────────────────────────────────────
# These need no server and no browser. They answer questions of ABSENCE, which a check that
# only looks for presence cannot: "is there anywhere left that still does the wrong thing?"

def _source_files(folder: str, suffixes: tuple) -> list:
    found = []
    for base, _dirs, files in os.walk(os.path.join(ROOT, folder)):
        if "node_modules" in base or "__pycache__" in base or "/venv" in base:
            continue
        found += [os.path.join(base, f) for f in files if f.endswith(suffixes)]
    return found


def test_no_command_takes_its_caller_from_the_request_body():
    """
    The original hole: the server believed whatever a request said about who was calling.
    Every one of those reads had to go. This fails if a single one comes back.
    """
    offenders = []
    for path in _source_files("python-api/app/routes", (".py",)):
        for n, line in enumerate(open(path, encoding="utf-8"), 1):
            if "req.user_id" in line or "batch.user_id" in line:
                offenders.append(f"{os.path.relpath(path, ROOT)}:{n}: {line.strip()}")
    assert not offenders, "the caller is still being read from the request body:\n" + "\n".join(offenders)


def test_every_app_call_to_our_server_carries_the_login():
    """
    A call added later that forgets the login would be refused, and the driver would see an
    error with no cause. This fails if any place in the app reaches our server with plain
    fetch instead of the wrapper that attaches the login.
    """
    offenders = []
    for path in _source_files("src", (".ts", ".tsx")):
        if path.endswith("authFetch.ts") or path.endswith("authFetch.test.ts"):
            continue
        text = open(path, encoding="utf-8").read()
        if "stockerai-api.onrender.com" not in text and "PYTHON_API_BASE" not in text:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            if "fetch(" in stripped and "authFetch(" not in stripped and "fetchWith" not in stripped:
                if stripped.startswith("//") or stripped.startswith("*"):
                    continue
                offenders.append(f"{os.path.relpath(path, ROOT)}:{n}: {stripped}")
    assert not offenders, "these reach our server without attaching the login:\n" + "\n".join(offenders)


def test_no_test_script_holds_a_written_down_login():
    """
    A login pasted into a script stops working within the hour, and then the whole suite fails
    for a reason that has nothing to do with the code — which trains everyone to ignore it.
    Every script must obtain its own at run time. This fails if one is written down.
    """
    offenders = []
    marker = "ey" + "J"  # split so this file does not match its own detector
    for path in _source_files("tests", (".sh", ".py")):
        if os.path.abspath(path) == os.path.abspath(__file__):
            continue
        for n, line in enumerate(open(path, encoding="utf-8"), 1):
            if marker in line and "Bearer" in line:
                offenders.append(f"{os.path.relpath(path, ROOT)}:{n}")
    assert not offenders, "these hold a login that will expire:\n" + "\n".join(offenders)


# ── Narrow gates ───────────────────────────────────────────────────────────────────────────
# The whole server suite takes about forty seconds, and the spec verifier gives a check thirty
# before calling it unrunnable. Three promises each have ONE test that proves them, so they
# point here instead of at the whole suite — seconds rather than tens of seconds, and a
# sharper answer besides: this exact test, for this exact promise.

def _one_server_test(selector: str):
    r = _run([VENV_PY, "-m", "pytest", selector, "-q", "--tb=short", "-p", "no:cacheprovider"],
             cwd=API_DIR, env=_env_for_api(), timeout=120)
    assert r.returncode == 0, _explain(selector, r)


ISOLATION_TESTS = "tests/test_account_isolation.py"


def test_no_command_can_be_reached_without_a_login():
    """Walks the real server and fails if any command is reachable without one."""
    _one_server_test(f"{ISOLATION_TESTS}::test_every_api_command_requires_a_login")


def test_a_bad_or_missing_login_is_always_refused_the_same_way():
    """Missing, empty, wrong kind, unsigned, expired — all refused, and all refused identically,
    so the refusal never hints at what would have worked."""
    _one_server_test(f"{ISOLATION_TESTS}::test_a_request_without_a_valid_login_is_refused")
    _one_server_test(f"{ISOLATION_TESTS}::test_the_refusal_never_explains_what_was_wrong_with_the_token")


def test_all_twelve_commands_are_accounted_for():
    """If a command is added or renamed, the checks above stop covering it silently."""
    _one_server_test(f"{ISOLATION_TESTS}::test_all_twelve_commands_are_present")
