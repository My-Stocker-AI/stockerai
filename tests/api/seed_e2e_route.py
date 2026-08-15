#!/usr/bin/env python3
"""
Seeds the 'E2E Test Route' fixture the local end-to-end scripts run against:
3 machines x 5 items, dated tomorrow, owned by the test user.

This is the same fixture as test_e2e_minimal_route.sql, which needed the Supabase SQL
console to run — meaning the suite could only be set up by hand, and quietly rotted
whenever nobody remembered to. This runs from the terminal with no console, so
"the fixture wasn't there" stops being a way for the tests to look broken.

  usage: python3 tests/api/seed_e2e_route.py
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

ROUTE_NAME = "E2E Test Route"
OWNER = "bdc96b72-3f35-4cae-9e79-99473eb4a23b"  # russ@visionairy.biz
QUANTITIES = {1: 3, 2: 5, 3: 2, 4: 4, 5: 1}

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env = {}
with open(os.path.join(REPO, ".env")) as fh:
    for line in fh:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["VITE_SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HDRS = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def call(method, path, body=None, prefer=None):
    hdrs = dict(HDRS)
    if prefer:
        hdrs["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}/{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed: {e.code} {e.read().decode()[:300]}")


# Remove any previous copy — only ever the fixture, matched on its exact name.
_, old = call("GET", f"routes?select=id&route_name=eq.{ROUTE_NAME.replace(' ', '%20')}")
for r in old or []:
    _, machines = call("GET", f"machines?select=id&route_id=eq.{r['id']}")
    for m in machines or []:
        call("DELETE", f"items?machine_id=eq.{m['id']}")
    call("DELETE", f"machines?route_id=eq.{r['id']}")
    call("DELETE", f"sessions?current_route_id=eq.{r['id']}")
    call("DELETE", f"routes?id=eq.{r['id']}")

tomorrow = str(date.today() + timedelta(days=1))
_, route = call("POST", "routes", {
    "user_id": OWNER, "route_name": ROUTE_NAME, "delivery_date": tomorrow,
    "total_machines": 3, "total_items": 15, "driver_name": "Test Driver",
}, prefer="return=representation")
route_id = route[0]["id"]

for seq in (1, 2, 3):
    _, machine = call("POST", "machines", {
        "route_id": route_id, "route_name": ROUTE_NAME,
        "machine_name": f"Test Machine {seq}", "location_name": f"Test Location {seq}",
        "machine_number": 100 + seq, "sequence": seq, "status": "pending",
        "total_items": 5, "completed_items": 0,
    }, prefer="return=representation")
    machine_id = machine[0]["id"]
    call("POST", "items", [
        {"machine_id": machine_id, "machine_name": f"Test Machine {seq}",
         "product_name": f"Product {i} (Machine {seq})", "quantity": QUANTITIES[i],
         "slot": f"A{i}", "sequence": i, "status": "pending",
         "inventory_current": 0, "inventory_parlevel": 10}
        for i in (1, 2, 3, 4, 5)
    ])

print(f"seeded '{ROUTE_NAME}' for {tomorrow}: 3 machines, 15 items (route {route_id})")
