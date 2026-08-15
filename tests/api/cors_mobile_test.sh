#!/usr/bin/env bash
# ============================================================================
# CORS MOBILE-RELIABILITY PROOF  (regression guard for the Feb-9 invalid-CORS bug)
# ============================================================================
# Asserts every backend endpoint returns a VALID, CONSISTENT cross-origin
# permission header — the real app origin, never a wildcard "*" — so strict
# mobile browsers (Android Chrome, iOS Safari) accept the request instead of
# failing with "Failed to fetch".
#
# Root cause this guards: allow_origins=["*"] + allow_credentials=True is an
# invalid CORS combination; it made the server echo the origin on the preflight
# but send "*" on the actual response. Lenient desktop browsers forgave it;
# strict mobile browsers rejected it.
#
# Usage:  bash tests/api/cors_mobile_test.sh
#         STOCKER_API=https://stockerai-api.onrender.com bash tests/api/cors_mobile_test.sh
# Exit 0 = all endpoints serve valid mobile-safe CORS. Non-zero = a gap remains.
# ============================================================================
set -u
BASE="${STOCKER_API:-https://stockerai-api.onrender.com}"
ORIGIN="https://my-stocker-ai.com"
# Every real install origin must be granted. The Cloudflare Pages domain (NO hyphen)
# is a real origin for installed apps — a hyphen typo once silently blocked it,
# which read to the driver as "failed to fetch".
GRANTED_ORIGINS=("https://my-stocker-ai.com" "https://stockerai.pages.dev")
BAD_ORIGIN="https://not-allowed.example.com"

# All twelve backend commands the StockerAI mobile app calls.
ENDPOINTS=(
  /api/upload-pdf
  /api/get-routes
  /api/delete-route
  /api/set-route-sequence
  /api/get-next-item
  /api/start-machine
  /api/skip-machine
  /api/go-back-to-skipped
  /api/update-session
  /api/resume-state
  /api/diag
  /api/openai-chat
)

pass=0; fail=0
ok()  { pass=$((pass+1)); printf "  \033[32m+\033[0m %s\n" "$1"; }
bad() { fail=$((fail+1)); printf "  \033[31m-\033[0m %s  [%s]\n" "$1" "$2"; }

allowed_headers_for() { # endpoint -> prints the header names the browser is permitted to send
  curl -s -m 25 -o /dev/null -D - -X OPTIONS "$BASE$1" \
    -H "Origin: $ORIGIN" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type, authorization" \
    2>/dev/null | tr -d '\r' \
    | awk -F': ' 'tolower($1)=="access-control-allow-headers"{print tolower($2)}'
}

acao_for() { # origin, endpoint -> prints Access-Control-Allow-Origin value (or empty)
  curl -s -m 25 -o /dev/null -D - -X OPTIONS "$BASE$2" \
    -H "Origin: $1" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type" \
    2>/dev/null | tr -d '\r' \
    | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}'
}

echo "CORS mobile-reliability proof"
echo "  backend: $BASE"
echo "  app origin (must be granted): $ORIGIN"
echo "  rogue origin (must be denied): $BAD_ORIGIN"
echo ""

for ep in "${ENDPOINTS[@]}"; do
  echo "[$ep]"
  granted=$(acao_for "$ORIGIN" "$ep")
  denied=$(acao_for "$BAD_ORIGIN" "$ep")

  # 1) every real install origin is granted, echoed EXACTLY (catches origin typos)
  for o in "${GRANTED_ORIGINS[@]}"; do
    g=$(acao_for "$o" "$ep")
    if [ "$g" = "$o" ]; then ok "grants $o"; \
       else bad "grants $o" "got: '${g:-none}'"; fi
  done

  # 2) the permission slip is specific, NOT a wildcard (the invalid combo)
  if [ -n "$granted" ] && [ "$granted" != "*" ]; then ok "permission slip is specific, not wildcard"; \
     else bad "permission slip is specific, not wildcard" "got: '${granted:-none}'"; fi

  # 3) a rogue origin is never granted
  if [ "$denied" != "$BAD_ORIGIN" ]; then ok "rejects a rogue origin"; \
     else bad "rejects a rogue origin" "wrongly granted: '$denied'"; fi

  # 4) the browser is permitted to SEND the login header. Every command requires a login
  #    now, and a browser will not send a header the preflight did not grant — it blocks
  #    the request before it leaves the phone. That failure looks exactly like the server
  #    being down, with nothing in the server logs to show it ever happened.
  hdrs=$(allowed_headers_for "$ep")
  case "$hdrs" in
    *authorization*) ok "permits the login header" ;;
    *) bad "permits the login header" "got: '${hdrs:-none}'" ;;
  esac
done

# ── The login actually works through CORS, end to end ────────────────────────
# Signs in at run time — nothing hard-coded, so an expired token cannot make a
# working suite look broken.
echo ""
echo "[login]"
# shellcheck source=/dev/null
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_signin.sh"
TOKEN=$(stocker_signin "russ@visionairy.biz") || TOKEN=""

if [ -z "$TOKEN" ]; then
  bad "signs in at run time" "could not obtain a login"
else
  ok "signs in at run time"

  code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/get-routes" \
    -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
    -d '{"session_id":"cors-probe","date":"2026-01-01"}')
  if [ "$code" = "401" ]; then ok "a call with no login is refused (401)"; \
     else bad "a call with no login is refused" "got: $code"; fi

  code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/get-routes" \
    -H "Origin: $ORIGIN" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"session_id":"cors-probe","date":"2026-01-01"}')
  if [ "$code" = "200" ]; then ok "the same call WITH a login succeeds (200)"; \
     else bad "the same call WITH a login succeeds" "got: $code"; fi
fi

echo ""
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
