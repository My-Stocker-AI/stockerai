#!/bin/bash
# ============================================================================
# Test: skipping the LAST machine must never silently declare the route finished
# ============================================================================
#
# Scenario:
#   3-machine test route. Machines 2 & 3 are marked completed directly in Supabase
#   (a driver who worked most of the route normally). The session points at machine 1,
#   the only one left. He skips it.
#
# What must happen:
#   Machine 1 is now skipped and still unstocked, so the route is NOT finished. The
#   server must say so and offer the way back — action='offer_go_back'.
#
# WHY THIS EXPECTATION CHANGED (2026-08-15):
#   This script used to require action='route_complete'. That was the ORIGINAL behavior
#   and it was a real bug: declaring the route complete ended the session and abandoned
#   the skipped machine with no way to reach it again. Skip the last machine and its
#   items were stranded for good. Commit caf252d replaced it with an offer to go back,
#   and 'route_complete' no longer exists in machines.py at all — so this script has
#   been asserting a response the server can no longer produce, and failing for that
#   reason rather than a real one.
#
#   The guard is now the stronger property: a skipped machine is never silently passed.
#
# Prereqs:
#   1. test_e2e_minimal_route.sql already run (creates 'E2E Test Route')
#   2. SUPABASE_SERVICE_ROLE_KEY set in .env (loaded automatically)
#
# Login: every API command requires one now. This script signs in as the test user
# at run time (see _signin.sh) and sends that login on each call. Nothing is
# hard-coded, so an expired token can never make a working suite look broken.
#
# Usage:
#   bash tests/api/test_bug3_skip_route_complete.sh
#
# ============================================================================

set -euo pipefail

# Load .env from project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# shellcheck source=/dev/null
source "$SCRIPT_DIR/_signin.sh"
TOKEN=$(stocker_signin "russ@visionairy.biz") || exit 1

API="${STOCKER_API:-https://stockerai-api.onrender.com}/api"
SUPABASE_URL="https://wvtkuposrlvadyeixlke.supabase.co"
USER_ID="bdc96b72-3f35-4cae-9e79-99473eb4a23b"
ROUTE_NAME="E2E Test Route"
DATE=$(date -d "tomorrow" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)

PASS=0
FAIL=0
pass() { echo "✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "❌ FAIL: $1"; FAIL=$((FAIL+1)); }

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY not set. Check .env file."
  exit 1
fi

echo "=============================================="
echo " Bug 3: skip_machine → route_complete"
echo " Date: $DATE"
echo "=============================================="
echo ""

# ─── Step 1: set-route-sequence ─────────────────────────────────────────────

echo "--- Step 1: set-route-sequence (creates session, resets machines) ---"
RESP=$(curl -s -X POST "$API/set-route-sequence" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"test-bug3-$$\",
    \"user_id\": \"$USER_ID\",
    \"route_name\": \"$ROUTE_NAME\",
    \"date\": \"$DATE\"
  }")

SESSION_ID=$(echo "$RESP" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
ROUTE_ID=$(echo "$RESP" | grep -o '"route_id":"[^"]*"' | cut -d'"' -f4)
FIRST_MACHINE=$(echo "$RESP" | grep -o '"first_machine":"[^"]*"' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  fail "set-route-sequence: no session_id — is 'E2E Test Route' created for $DATE?"
  echo "Hint: Run test_e2e_minimal_route.sql via Supabase MCP first."
  exit 1
fi

pass "session=$SESSION_ID  route=$ROUTE_ID  current=$FIRST_MACHINE"
echo ""

# ─── Step 2: Reset all machines to pending, then mark 2 & 3 completed ────────
# set-route-sequence may not reset 'skipped' machines back to 'pending'.
# Explicitly reset all machines first, then set 2 & 3 to completed.

echo "--- Step 2a: reset all machines to pending ---"
curl -s -X PATCH \
  "$SUPABASE_URL/rest/v1/machines?route_id=eq.$ROUTE_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "pending"}' > /dev/null
pass "all machines reset to pending"

echo "--- Step 2b: marking machines 2 & 3 as completed via Supabase ---"
DB_RESP=$(curl -s -X PATCH \
  "$SUPABASE_URL/rest/v1/machines?route_id=eq.$ROUTE_ID&sequence=in.(2,3)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"status": "completed", "completed_items": 5}')

UPDATED=$(echo "$DB_RESP" | grep -o '"sequence"' | wc -l)
if [ "$UPDATED" -ge 2 ]; then
  pass "machines 2 & 3 marked completed ($UPDATED rows updated)"
else
  fail "DB update failed — got: $(echo "$DB_RESP" | head -c 200)"
  exit 1
fi
echo ""

# ─── Step 3: skip-machine (Machine 1, last pending) ─────────────────────────

echo "--- Step 3: skip-machine (Machine 1 = only pending; 2 & 3 completed) ---"
RESP=$(curl -s -X POST "$API/skip-machine" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"user_id\": \"$USER_ID\"}")

echo "Full response: $RESP"
ACTION=$(echo "$RESP" | grep -o '"action":"[^"]*"' | cut -d'"' -f4)
VOICE=$(echo "$RESP" | grep -o '"voice_text":"[^"]*"' | cut -d'"' -f4)

if [ "$ACTION" = "offer_go_back" ]; then
  pass "action=offer_go_back — the skipped machine is offered back, not abandoned"
  echo "  voice: $VOICE"
elif [ "$ACTION" = "route_complete" ]; then
  fail "the route was declared FINISHED while a machine is still unstocked — that strands it"
else
  fail "Expected action=offer_go_back, got '$ACTION'"
fi

# The route must still be reachable: the session stays alive so 'go back' works.
if echo "$RESP" | grep -q "go back"; then
  pass "the driver is told how to get back to it"
else
  fail "no way back was offered — the machine is stranded"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "=============================================="
if [ "$FAIL" -eq 0 ]; then
  echo "  ALL $PASS TESTS PASSED"
else
  echo "  $PASS passed, $FAIL FAILED"
fi
echo "=============================================="

[ "$FAIL" -eq 0 ]
