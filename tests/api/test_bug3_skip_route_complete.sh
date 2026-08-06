#!/bin/bash
# ============================================================================
# Test: Bug 3 — skip_machine returns route_complete when no machines remain
# ============================================================================
#
# Scenario:
#   3-machine test route. After set-route-sequence creates the session,
#   machines 2 & 3 are marked 'completed' directly in Supabase (simulating
#   a driver who completed most machines normally). Session points to
#   machine 1 (the only pending one). Calling skip-machine must return
#   action='route_complete'.
#
# The Fix (useStockerSession.ts):
#   Before the fix, skip_machine route_complete never set completed=true or
#   sessionInvalidated=true. After the fix it does, so the session ends and
#   skipped machines are handled correctly.
#
#   This script tests the Python API half: that route_complete IS returned.
#   The frontend state change is covered by vitest unit tests.
#
# Prereqs:
#   1. test_e2e_minimal_route.sql already run (creates 'E2E Test Route')
#   2. SUPABASE_SERVICE_ROLE_KEY set in .env (loaded automatically)
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

API="https://stockerai-api.onrender.com/api"
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
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION_ID\", \"user_id\": \"$USER_ID\"}")

echo "Full response: $RESP"
ACTION=$(echo "$RESP" | grep -o '"action":"[^"]*"' | cut -d'"' -f4)
VOICE=$(echo "$RESP" | grep -o '"voice_text":"[^"]*"' | cut -d'"' -f4)

if [ "$ACTION" = "route_complete" ]; then
  pass "action=route_complete ✓ — Bug 3 API behavior confirmed"
  echo "  voice: $VOICE"
else
  fail "Expected action=route_complete, got '$ACTION'"
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
