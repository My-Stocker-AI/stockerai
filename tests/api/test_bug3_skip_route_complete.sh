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
#   2. Supabase MCP available to mark machines as completed (see comments)
#
# Usage:
#   # Step 1 — Run this script:
#   bash tests/api/test_bug3_skip_route_complete.sh
#
#   # Step 2 — After "WAITING FOR DB SETUP" prompt, run via Supabase MCP:
#   UPDATE machines SET status='completed', completed_items=5
#   WHERE route_id='<route_id from output>' AND sequence IN (2, 3);
#
#   # Step 3 — Press Enter to continue the test.
#
# ============================================================================

set -euo pipefail

API="https://stockerai-api.onrender.com/api"
USER_ID="bdc96b72-3f35-4cae-9e79-99473eb4a23b"
ROUTE_NAME="E2E Test Route"
DATE=$(date -d "tomorrow" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)

PASS=0
FAIL=0
pass() { echo "✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "❌ FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=============================================="
echo " Bug 3: skip_machine → route_complete"
echo " Date: $DATE"
echo "=============================================="
echo ""

# ─── Step 1: set-route-sequence ─────────────────────────────────────────────
# This creates a NEW session and resets all machines to 'pending'.

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

# ─── Step 2: DB setup (manual via Supabase MCP) ──────────────────────────────
# set_route_sequence resets all machines to pending on new sessions.
# We need machines 2 & 3 completed to test the route_complete path.
#
# Run this SQL via Supabase MCP now:
#
#   UPDATE machines SET status='completed', completed_items=5
#   WHERE route_id='$ROUTE_ID' AND sequence IN (2, 3);
#
# Then press Enter to continue.

echo "--------------------------------------------------------------"
echo " WAITING FOR DB SETUP"
echo " Run this SQL via Supabase MCP (project: wvtkuposrlvadyeixlke):"
echo ""
echo "   UPDATE machines SET status='completed', completed_items=5"
echo "   WHERE route_id='$ROUTE_ID' AND sequence IN (2, 3);"
echo ""
echo " Then press Enter to continue..."
echo "--------------------------------------------------------------"
read -r

# ─── Step 3: skip-machine (Machine 1, last pending) ─────────────────────────

echo ""
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
  echo "  Did you run the SQL update in Step 2?"
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
