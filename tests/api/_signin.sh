#!/usr/bin/env bash
# ============================================================================
# SIGN IN THE WAY THE APP DOES — shared by the local end-to-end scripts.
# ============================================================================
# Every API command now requires a login, so a test script has to hold one too.
#
# The login is obtained AT RUN TIME, never written down. A token pasted into a
# script expires within the hour and then every test fails for a reason that has
# nothing to do with the code — a working suite that looks broken is worse than
# no suite, because it trains you to ignore it.
#
# The service-role key is used only to ask Supabase for a normal user login. It
# is never sent to our API; the API refuses it outright, which is the point.
#
# Usage:  source tests/api/_signin.sh
#         TOKEN=$(stocker_signin "russ@visionairy.biz")
#         curl -H "Authorization: Bearer $TOKEN" ...
# ============================================================================

stocker_signin() {
  local email="${1:-russ@visionairy.biz}"
  local root; root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

  if [ -f "$root/.env" ]; then
    set -a; . "$root/.env"; set +a
  fi
  if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || [ -z "${VITE_SUPABASE_URL:-}" ]; then
    echo "stocker_signin: .env is missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" >&2
    return 1
  fi

  local hashed
  hashed=$(curl -s -m 30 -X POST "$VITE_SUPABASE_URL/auth/v1/admin/generate_link" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"email\":\"$email\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('hashed_token',''))" 2>/dev/null)

  if [ -z "$hashed" ]; then
    echo "stocker_signin: could not begin sign-in for $email" >&2
    return 1
  fi

  local token
  token=$(curl -s -m 30 -X POST "$VITE_SUPABASE_URL/auth/v1/verify" \
    -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"magiclink\",\"token_hash\":\"$hashed\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

  if [ -z "$token" ]; then
    echo "stocker_signin: sign-in failed for $email" >&2
    return 1
  fi
  printf '%s' "$token"
}
