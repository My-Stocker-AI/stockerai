#!/usr/bin/env python3
"""
CROSS-ACCOUNT ISOLATION PROOF — the machine-checkable answer to "can one customer see or
change another customer's data?"

Its exit code alone decides the outcome. 0 means every part held; anything else means one
did not, and the printed FAIL lines say which. No human reading required.

  Part 1  No login at all → every one of the twelve commands answers 401.
  Part 2  Signed in as one account, reaching into another → each command must meet a
          SPECIFIC named expectation. Not "didn't obviously leak" — an actual outcome.
  Part 3  Signed in, own account → a whole route runs start to finish, so a server that
          simply refuses everything cannot pass as "isolated".
  Part 4  Every row in the other account is byte-for-byte unchanged afterwards.

SAFETY — read before changing anything here.
  This script reaches into a REAL second account. Anything that only READS (list routes,
  resume, next item) is pointed at that account's real records, because reading cannot harm
  them and real data is the honest target.

  Anything DESTRUCTIVE — delete a route, complete a session — is pointed at a decoy route and
  decoy session this script creates inside that account and removes afterwards. That matters:
  those calls are supposed to bounce off. If isolation were ever broken — the exact case this
  script exists to catch — aiming them at real records would destroy a driver's route on the
  way to reporting the problem. The proof must not be the thing that causes the damage.

  The same care applies to MY OWN account. Four commands — start, next item, skip, go back —
  act on whatever route I am currently working, so probing them would advance or skip machines
  on a real route of mine. Before any probing, this script parks my session on a throwaway
  route of its own making and restores my previous sessions afterwards. An earlier version did
  not, and silently skipped a machine on a live session while "just checking".

Nothing is hard-coded: the login is obtained at run time, so an expired token can never make
a working system look broken.

  usage: python3 tests/api/isolation_proof.py [base_url]
         default base_url is https://stockerai-api.onrender.com
"""

import json
import os
import sys
import uuid
from datetime import date

import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://stockerai-api.onrender.com").rstrip("/")
API = f"{BASE}/api"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REFUSAL = "Not available on this account."
DECOY_PREFIX = "ZZ-ISOLATION-DECOY"
MINE_PREFIX = "ZZ-ISOLATION-MINE"

CALLER_EMAIL = "russ@visionairy.biz"
OTHER_EMAIL = "sundragonvending@gmail.com"


def load_env() -> dict:
    env = {}
    with open(os.path.join(REPO, ".env")) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
SUPABASE_URL = ENV["VITE_SUPABASE_URL"].rstrip("/")
SERVICE_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]
ANON_KEY = ENV["VITE_SUPABASE_PUBLISHABLE_KEY"]

results: list[tuple[bool, str]] = []


def record(ok: bool, label: str) -> bool:
    results.append((bool(ok), label))
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    return bool(ok)


def http(method: str, url: str, body=None, headers=None, raw=None):
    hdrs = dict(headers or {})
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            text, status = resp.read().decode(), resp.status
    except urllib.error.HTTPError as e:
        text, status = e.read().decode(), e.code
    except Exception as e:
        return 0, str(e)
    try:
        return status, json.loads(text)
    except Exception:
        return status, text


def sb(method: str, path: str, body=None, extra=None):
    hdrs = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"}
    hdrs.update(extra or {})
    return http(method, f"{SUPABASE_URL}/rest/v1/{path}", body=body, headers=hdrs)


def sign_in(email: str) -> str:
    status, out = http("POST", f"{SUPABASE_URL}/auth/v1/admin/generate_link",
                       body={"type": "magiclink", "email": email},
                       headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})
    if status != 200 or not isinstance(out, dict) or not out.get("hashed_token"):
        sys.exit(f"could not begin sign-in for {email}: {status} {out}")
    status, out = http("POST", f"{SUPABASE_URL}/auth/v1/verify",
                       body={"type": "magiclink", "token_hash": out["hashed_token"]},
                       headers={"apikey": ANON_KEY})
    token = out.get("access_token") if isinstance(out, dict) else None
    if not token:
        sys.exit(f"could not sign in as {email}: {status} {out}")
    return token


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def user_id_of(email: str) -> str:
    status, out = sb("GET", f"profiles?select=id&email=eq.{email}")
    if status != 200 or not out:
        sys.exit(f"no profile for {email}")
    return out[0]["id"]


def team_of(user_id: str) -> list[str]:
    _, rows = sb("GET", f"account_users?select=account_id&user_id=eq.{user_id}&limit=1")
    if not rows:
        sys.exit(f"{user_id} belongs to no account")
    _, members = sb("GET", f"account_users?select=user_id&account_id=eq.{rows[0]['account_id']}")
    return [m["user_id"] for m in members or []]


def multipart(user_id: str) -> tuple[bytes, str]:
    b = "----isolationproof" + uuid.uuid4().hex
    return b"".join([
        (f'--{b}\r\nContent-Disposition: form-data; name="pdf"; filename="x.pdf"\r\n'
         f"Content-Type: application/pdf\r\n\r\n%PDF-1.4 not-a-real-route\r\n").encode(),
        (f'--{b}\r\nContent-Disposition: form-data; name="date"\r\n\r\n{date.today()}\r\n').encode(),
        (f'--{b}\r\nContent-Disposition: form-data; name="user_id"\r\n\r\n{user_id}\r\n').encode(),
        f"--{b}--\r\n".encode(),
    ]), f"multipart/form-data; boundary={b}"


def call(name: str, body, headers: dict, form_user_id: str):
    if name == "upload-pdf":
        raw, ctype = multipart(form_user_id)
        h = dict(headers); h["Content-Type"] = ctype
        return http("POST", f"{API}/upload-pdf", raw=raw, headers=h)
    return http("POST", f"{API}/{name}", body=body, headers=headers)


# ── Seeding ────────────────────────────────────────────────────────────────────────────────

def seed_route(owner_id: str, prefix: str, machines: int, items: int, when: str):
    name = f"{prefix}-{uuid.uuid4().hex[:8]}"
    status, out = sb("POST", "routes",
                     body={"user_id": owner_id, "route_name": name, "delivery_date": when,
                           "total_machines": machines, "total_items": machines * items},
                     extra={"Prefer": "return=representation"})
    if status not in (200, 201) or not out:
        sys.exit(f"could not create route {name}: {status} {out}")
    route_id = out[0]["id"]
    machine_ids = []
    for seq in range(1, machines + 1):
        status, m = sb("POST", "machines",
                       body={"route_id": route_id, "route_name": name,
                             "machine_name": f"Probe Machine {seq}", "machine_number": seq,
                             "location_name": "Probe Location", "sequence": seq,
                             "total_items": items, "completed_items": 0, "status": "pending"},
                       extra={"Prefer": "return=representation"})
        if status not in (200, 201) or not m:
            sys.exit(f"could not create machine {seq}: {status} {m}")
        machine_ids.append(m[0]["id"])
        sb("POST", "items", body=[
            {"machine_id": m[0]["id"], "machine_name": f"Probe Machine {seq}",
             "product_name": f"Probe Item {seq}{i}", "quantity": 1, "slot": f"{seq}{i}",
             "sequence": i, "status": "pending", "inventory_current": 0, "inventory_parlevel": 1}
            for i in range(1, items + 1)])
    return route_id, name, machine_ids


def seed_session(owner_id: str, route_id: str, machine_id: str, when: str) -> str:
    # Deliberately 'paused', never 'stocking' — a decoy must not become the other account's
    # active session and disturb a driver who is mid-route right now.
    status, out = sb("POST", "sessions",
                     body={"user_id": owner_id, "session_key": f"isolation_decoy_{uuid.uuid4().hex[:8]}",
                           "status": "paused", "current_route_id": route_id,
                           "current_machine_id": machine_id, "delivery_date": when,
                           "pick_direction": "forward"},
                     extra={"Prefer": "return=representation"})
    if status not in (200, 201) or not out:
        sys.exit(f"could not create decoy session: {status} {out}")
    return out[0]["id"]


def destroy_route(route_id: str, route_name: str):
    if not (route_name.startswith(DECOY_PREFIX) or route_name.startswith(MINE_PREFIX)):
        return  # only ever removes what this script made
    _, machines = sb("GET", f"machines?select=id&route_id=eq.{route_id}")
    for m in machines or []:
        sb("DELETE", f"items?machine_id=eq.{m['id']}")
    sb("DELETE", f"machines?route_id=eq.{route_id}")
    sb("DELETE", f"sessions?current_route_id=eq.{route_id}")
    sb("DELETE", f"routes?id=eq.{route_id}")


def sweep_strays(owner_id: str):
    """Any route the probe caused to be created in the other account (which would itself be
    a failure) is cleaned up rather than left behind."""
    _, rows = sb("GET", f"routes?select=id,route_name&user_id=eq.{owner_id}"
                        f"&route_name=like.{DECOY_PREFIX}*")
    for r in rows or []:
        destroy_route(r["id"], r["route_name"])


# ══════════════════════════════════════════════════════════════════════════════════════════

print(f"\nCROSS-ACCOUNT ISOLATION PROOF against {BASE}\n")

ME = user_id_of(CALLER_EMAIL)
OTHER = user_id_of(OTHER_EMAIL)
MY_TEAM = team_of(ME)
OTHER_TEAM = team_of(OTHER)
if set(MY_TEAM) & set(OTHER_TEAM):
    sys.exit("these two users share an account — there is nothing to isolate")

# Real records in the other account: READ-ONLY targets.
_, other_routes = sb("GET", f"routes?select=id,route_name,delivery_date&user_id=eq.{OTHER}&limit=1")
if not other_routes:
    sys.exit("the other account has no route — this proof needs one to be meaningful")
OTHER_REAL_ROUTE = other_routes[0]["id"]
OTHER_REAL_DATE = other_routes[0]["delivery_date"]
OTHER_REAL_NAME = other_routes[0]["route_name"]

_, other_sessions = sb("GET", f"sessions?select=id&user_id=eq.{OTHER}&limit=1")
OTHER_REAL_SESSION = other_sessions[0]["id"] if other_sessions else str(uuid.uuid4())

def is_mine(record_id: str) -> bool:
    """
    Does this route or session belong to my account? Asked of the database right now, not
    read off a list gathered earlier — the run creates throwaway records of its own, and a
    startup snapshot would report those as strangers.
    """
    team = ",".join(MY_TEAM)
    for table in ("routes", "sessions"):
        _, rows = sb("GET", f"{table}?select=id&id=eq.{record_id}&user_id=in.({team})")
        if rows:
            return True
    return False

token = sign_in(CALLER_EMAIL)
print(f"signed in as {CALLER_EMAIL}")
print(f"reaching into the account of {OTHER_EMAIL}")

decoy_route = decoy_name = decoy_session = None
probe_route = probe_name = None
mine_route = mine_name = None

# Remember my own sessions exactly as they are, so the probe leaves no trace on them.
_, my_sessions_before = sb("GET", "sessions?select=id,status,current_route_id,current_machine_id"
                                  f"&user_id=in.({','.join(MY_TEAM)})")


def restore_my_sessions():
    for row in my_sessions_before or []:
        sb("PATCH", f"sessions?id=eq.{row['id']}",
           body={"status": row["status"], "current_route_id": row["current_route_id"],
                 "current_machine_id": row["current_machine_id"]})


try:
    decoy_route, decoy_name, decoy_machines = seed_route(
        OTHER, DECOY_PREFIX, machines=1, items=2, when=str(date.today()))
    decoy_session = seed_session(OTHER, decoy_route, decoy_machines[0], str(date.today()))
    # My own working route for the probe. The four session-based commands act on whatever
    # route I am currently on, so this makes that a throwaway instead of something real.
    probe_route, probe_name, probe_machines = seed_route(
        ME, MINE_PREFIX, machines=3, items=3, when=str(date.today()))
    _, pm = sb("GET", f"machines?select=id&route_id=eq.{probe_route}")
    PROBE_IDS = {m["id"] for m in pm or []} | {probe_route}

    status, _o = http("POST", f"{API}/set-route-sequence",
                      body={"session_id": f"session_{uuid.uuid4().hex}",
                            "route_name": probe_name, "date": str(date.today())},
                      headers=bearer(token))
    if status != 200:
        sys.exit(f"could not park my own session on a throwaway route: {status} {_o}")

    print("decoy seeded in their account — destructive probes aim there, never at real records")
    print("my own session parked on a throwaway route — probing cannot disturb real progress\n")

    def snapshot():
        _, m = sb("GET", f"machines?select=id,status,completed_items,skipped_at_item"
                         f"&route_id=eq.{OTHER_REAL_ROUTE}&order=sequence")
        _, r = sb("GET", f"routes?select=id,route_name,total_items,total_machines&user_id=eq.{OTHER}&order=id")
        _, s = sb("GET", f"sessions?select=id,status,current_machine_id,current_route_id"
                         f"&user_id=eq.{OTHER}&order=id")
        _, dm = sb("GET", f"machines?select=id,status,completed_items&route_id=eq.{decoy_route}&order=sequence")
        return {"their real machines": m, "their routes": r, "their sessions": s, "the decoy": dm}

    before = snapshot()

    # Each command carries the other account's identity forged into the body, and each has a
    # SPECIFIC expectation. "refused" = 403 with the fixed wording. "mine-only" = may succeed,
    # but everything it returns must belong to me. "no-session" = must not succeed, because I
    # have no active route. "permitted" = a signed-in caller is allowed to use it at all.
    COMMANDS = [
        ("get-routes",         {"session_id": OTHER_REAL_SESSION, "user_id": OTHER, "date": OTHER_REAL_DATE}, "mine-only"),
        ("delete-route",       {"route_id": decoy_route, "user_id": OTHER}, "refused"),
        ("set-route-sequence", {"session_id": OTHER_REAL_SESSION, "user_id": OTHER, "route_name": OTHER_REAL_NAME, "date": OTHER_REAL_DATE}, "no-session"),
        ("start-machine",      {"session_id": decoy_session, "user_id": OTHER, "direction": "beginning"}, "my-route-only"),
        ("get-next-item",      {"session_id": decoy_session, "user_id": OTHER, "date": OTHER_REAL_DATE}, "my-route-only"),
        ("skip-machine",       {"session_id": decoy_session, "user_id": OTHER}, "my-route-only"),
        ("go-back-to-skipped", {"session_id": decoy_session, "user_id": OTHER}, "my-route-only"),
        ("update-session",     {"session_id": decoy_session, "user_id": OTHER, "new_status": "completed"}, "refused"),
        ("resume-state",       {"user_id": OTHER}, "mine-only"),
        ("diag",               {"session_id": OTHER_REAL_SESSION, "user_id": OTHER, "events": []}, "permitted"),
        ("openai-chat",        {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]}, "permitted"),
        ("upload-pdf",         None, "refused"),
    ]

    THEIR_MARKERS = [OTHER, OTHER_REAL_ROUTE, OTHER_REAL_SESSION, decoy_route, decoy_session]

    # ── Part 1 ────────────────────────────────────────────────────────────────────────────
    print("Part 1 — no login: every command must refuse with 401")
    for name, body, _ in COMMANDS:
        status, _out = call(name, body, {}, OTHER)
        record(status == 401, f"{name:19} no login → {status} (want 401)")

    # ── Part 2 ────────────────────────────────────────────────────────────────────────────
    print("\nPart 2 — signed in as me, their identity forged into every request body")
    for name, body, expect in COMMANDS:
        status, out = call(name, body, bearer(token), OTHER)
        text = out if isinstance(out, str) else json.dumps(out)
        theirs = [m for m in THEIR_MARKERS if m and m in text]

        if expect == "refused":
            record(status == 403 and REFUSAL in text,
                   f"{name:19} → {status} (want exactly 403 + the fixed wording)")

        elif expect == "mine-only":
            # Must succeed AND every identifier it hands back must be mine. This is the check
            # that used to be toothless: "didn't leak" passed on any error at all.
            ids = set()
            if isinstance(out, dict):
                for r in out.get("routes", []) or []:
                    if isinstance(r, dict) and r.get("id"):
                        ids.add(r["id"])
                if out.get("session_id"):
                    ids.add(out["session_id"])
                route = out.get("route") or {}
                if isinstance(route, dict) and route.get("id"):
                    ids.add(route["id"])
            foreign = {i for i in ids if not is_mine(i)}
            record(status == 200 and not theirs and not foreign,
                   f"{name:19} → {status}, returned {len(ids)} id(s), all mine"
                   + (f" — THEIRS PRESENT {theirs}" if theirs else "")
                   + (f" — UNRECOGNISED {sorted(foreign)}" if foreign else ""))

        elif expect == "no-session":
            # I have no route by that name, so naming theirs must not find one.
            record(status != 200 and not theirs,
                   f"{name:19} → {status} (want a refusal, not 200)"
                   + (f" — THEIRS PRESENT {theirs}" if theirs else ""))

        elif expect == "my-route-only":
            # These act on whatever route I am currently working. Naming their session in the
            # body must change nothing: every machine and route that comes back has to be from
            # MY throwaway route. Requiring a refusal here would have been wrong — it depended
            # on me happening to have no route open, which is not a security property.
            touched = set()
            if isinstance(out, dict):
                for field in ("machine_id", "next_machine_id", "route_id", "first_machine_id"):
                    if out.get(field):
                        touched.add(out[field])
            strayed = touched - PROBE_IDS
            record(not theirs and not strayed,
                   f"{name:19} → {status}, acted on my own route only"
                   + (f" — THEIRS PRESENT {theirs}" if theirs else "")
                   + (f" — STRAYED to {sorted(strayed)}" if strayed else ""))

        else:  # permitted
            # A signed-in caller must still be able to use it — this catches over-blocking,
            # which would break the app just as surely as under-blocking exposes it.
            record(status not in (401, 403) and not theirs,
                   f"{name:19} → {status} (a signed-in caller is allowed to use this)"
                   + (f" — THEIRS PRESENT {theirs}" if theirs else ""))

    # ── Part 2b ───────────────────────────────────────────────────────────────────────────
    print("\nPart 2b — theirs and nonexistent must be impossible to tell apart")
    ghost = str(uuid.uuid4())
    a = http("POST", f"{API}/delete-route", body={"route_id": decoy_route}, headers=bearer(token))
    b = http("POST", f"{API}/delete-route", body={"route_id": ghost}, headers=bearer(token))
    record(a[0] == b[0] == 403 and json.dumps(a[1]) == json.dumps(b[1]),
           f"delete-route: theirs ({a[0]}) vs nonexistent ({b[0]}) — identical, and both exactly 403")

    c = http("POST", f"{API}/update-session", body={"session_id": decoy_session, "new_status": "completed"}, headers=bearer(token))
    d = http("POST", f"{API}/update-session", body={"session_id": ghost, "new_status": "completed"}, headers=bearer(token))
    record(c[0] == d[0] == 403 and json.dumps(c[1]) == json.dumps(d[1]),
           f"update-session: theirs ({c[0]}) vs nonexistent ({d[0]}) — identical, and both exactly 403")

    e = http("POST", f"{API}/delete-route", body={"route_id": decoy_route}, headers={})
    record(e[0] == 401 and a[0] == 403,
           f"no login is 401 and reaching outside is 403 — told apart ({e[0]} vs {a[0]})")

    # ── Part 3 ────────────────────────────────────────────────────────────────────────────
    print("\nPart 3 — my own account: a whole route must still run start to finish")
    mine_route, mine_name, _ = seed_route(ME, MINE_PREFIX, machines=2, items=2, when=str(date.today()))
    status, out = http("POST", f"{API}/set-route-sequence",
                       body={"session_id": f"session_{uuid.uuid4().hex}",
                             "route_name": mine_name, "date": str(date.today())},
                       headers=bearer(token))
    record(status == 200 and isinstance(out, dict) and bool(out.get("session_id")),
           f"set-route-sequence → {status}, machines={out.get('total_machines') if isinstance(out, dict) else '?'}")
    session_id = out.get("session_id") if isinstance(out, dict) else None

    if session_id:
        status, out = http("POST", f"{API}/start-machine",
                           body={"session_id": session_id, "direction": "beginning"},
                           headers=bearer(token))
        record(status == 200 and isinstance(out, dict) and bool(out.get("item1")),
               f"start-machine → {status}, an actual item came back")

        picks, guard, complete = 0, 0, False
        while guard < 25 and not complete:
            guard += 1
            status, out = http("POST", f"{API}/get-next-item",
                               body={"session_id": session_id, "date": str(date.today())},
                               headers=bearer(token))
            if status != 200 or not isinstance(out, dict):
                record(False, f"get-next-item → {status} {str(out)[:70]}")
                break
            action = out.get("action")
            if action == "next_item":
                picks += 1
            elif action == "next_machine":
                status, _o = http("POST", f"{API}/start-machine",
                                  body={"session_id": session_id, "direction": "beginning"},
                                  headers=bearer(token))
                if status != 200:
                    record(False, f"start-machine on the next machine → {status}")
                    break
                picks += 1
            elif action == "complete":
                complete = True
        record(complete, f"route ran to completion ({picks} items served over {guard} calls)")
        record(picks >= 2, f"real items came back ({picks}) — a server refusing everything fails here")

    # ── Part 4 ────────────────────────────────────────────────────────────────────────────
    print("\nPart 4 — nothing in their account moved")
    after = snapshot()
    for key in before:
        record(json.dumps(before[key], sort_keys=True) == json.dumps(after[key], sort_keys=True),
               f"{key}: unchanged")

finally:
    if decoy_route:
        destroy_route(decoy_route, decoy_name)
    if probe_route:
        destroy_route(probe_route, probe_name)
    if mine_route:
        destroy_route(mine_route, mine_name)
    sweep_strays(OTHER)
    restore_my_sessions()

failed = [label for ok, label in results if not ok]
print("\n" + "=" * 78)
if failed:
    print(f"VERDICT: FAIL — {len(failed)} of {len(results)} checks failed")
    for label in failed:
        print(f"  · {label}")
else:
    print(f"VERDICT: PASS — all {len(results)} checks held. The accounts are isolated.")
print("=" * 78 + "\n")
sys.exit(1 if failed else 0)
