"""
Every request must prove who it is.

Until now the twelve API commands took the caller's identity from the request body: whatever
user_id arrived in the JSON was believed, and no login was checked at all. Anyone who knew the
address could read or change any account's routes — verified live on 2026-08-15 by fetching a
real driver's route with no credentials of any kind.

This module is the gate. It verifies the Supabase login carried on the Authorization header and
hands each endpoint a Caller built from the TOKEN. The body is never again a source of identity.

Two different refusals, kept deliberately distinct so a machine check can tell them apart:
  401 — you did not present a valid login at all.
  403 — your login is fine, but you reached for something outside your account.

The 403 body is one fixed sentence carrying no name, id, date or count, and it is returned for
records that do not exist ANYWHERE as well as for records owned by someone else. If the two
answers differed, the difference itself would tell an outsider which ids are real.
"""

from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient

from app.config import SUPABASE_URL
from app.services.database import get_client

# The one refusal sentence. Reused verbatim everywhere so no response can be compared against
# another to learn what exists. Plain enough for a driver to read without alarm.
FORBIDDEN_MESSAGE = "Not available on this account."

# Supabase signs access tokens with a rotating asymmetric key (ES256) and names the key in the
# token header. The matching public keys are published here, so the server verifies signatures
# offline with no shared secret to store, set or leak.
_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_ISSUER = f"{SUPABASE_URL}/auth/v1"
_ALGORITHMS = ["ES256", "RS256", "HS256"]

_jwk_client: PyJWKClient | None = None

# Resolve membership in one database snapshot per request. Revocations must not
# remain authorized by a five-minute process cache.


@dataclass(frozen=True)
class Caller:
    """Who the request actually is, according to the login it presented."""

    user_id: str
    account_id: str
    team_user_ids: list[str]

    def owns_user(self, other_user_id: str | None) -> bool:
        """True when the named user sits inside this caller's account."""
        return bool(other_user_id) and other_user_id in self.team_user_ids


def forbidden() -> HTTPException:
    """The single refusal. Same status, same body, every time."""
    return HTTPException(status_code=403, detail=FORBIDDEN_MESSAGE)


def _unauthenticated() -> HTTPException:
    return HTTPException(status_code=401, detail="Sign in to continue.")


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        # Caches keys in-process and refetches when a token names a key it has not seen, which
        # is what makes Supabase key rotation a non-event rather than an outage.
        _jwk_client = PyJWKClient(_JWKS_URL, cache_keys=True, lifespan=3600)
    return _jwk_client


def _verify_token(token: str) -> dict:
    """Return the token's claims, or raise 401. Never raises anything else."""
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=_ALGORITHMS,
            audience="authenticated",
            issuer=_ISSUER,
            options={"require": ["exp", "sub"]},
        )
    except Exception:
        # Expired, malformed, wrong signature, unknown key, unreachable key list — the caller
        # learns only that they are not signed in. Detail here would be a map for guessing.
        raise _unauthenticated()


def _resolve_account(user_id: str) -> tuple[str, list[str]]:
    """Fail closed on missing/ambiguous membership; never choose an arbitrary tenant."""
    try:
        rows = get_client().rpc('resolve_picking_account', {'p_user_id': user_id}).execute().data
    except Exception as exc:
        if getattr(exc, 'code', None) == '42501':
            raise forbidden() from None
        raise HTTPException(status_code=503, detail='Could not verify account access. Try again.') from None
    if not rows or len(rows) != 1 or not rows[0].get('account_id') or user_id not in (rows[0].get('team_user_ids') or []):
        raise forbidden()
    return rows[0]['account_id'], rows[0]['team_user_ids']


def require_auth(request: Request) -> Caller:
    """
    FastAPI dependency. Put it on an endpoint and that endpoint can no longer be reached
    without a valid login. Works for JSON and for multipart uploads alike, because it reads
    the header off the raw request rather than a parsed body.
    """
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not header:
        raise _unauthenticated()

    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise _unauthenticated()

    claims = _verify_token(parts[1].strip())
    user_id = claims.get("sub")
    if not user_id:
        raise _unauthenticated()

    account_id, team_user_ids = _resolve_account(user_id)
    return Caller(user_id=user_id, account_id=account_id, team_user_ids=team_user_ids)


# Endpoints declare `caller: Caller = AuthCaller` — short, and impossible to forget silently
# because every handler that touches data now needs the caller to know whose data to touch.
AuthCaller = Depends(require_auth)


def optional_auth(request: Request) -> Caller | None:
    """
    Identify the caller if they are signed in, and let them through if they are not.

    For ONE endpoint only: the voice diagnostics sink. It is write-only — it hands back
    nothing but "got it", so there is no data to protect. And the public demo is used by
    people who have never signed in; requiring a login there silenced the very reports we
    rely on to see why a demo misbehaved on someone's phone.

    Anything that returns data must use require_auth instead. This exists so an anonymous
    report can be RECEIVED and clearly labelled, never so one can be trusted.
    """
    try:
        return require_auth(request)
    except HTTPException:
        return None


OptionalCaller = Depends(optional_auth)


def resolve_target_user(caller: Caller, requested_user_id: str | None) -> str:
    """
    Some screens act on behalf of a teammate — an admin uploads tomorrow's route FOR a driver.
    That is a real feature, so a named user is honoured, but only inside the caller's own
    account. A name from outside it is refused with the same sentence as anything else out of
    reach, and a request that names nobody simply acts as the caller.
    """
    if not requested_user_id or requested_user_id == caller.user_id:
        return caller.user_id
    if not caller.owns_user(requested_user_id):
        raise forbidden()
    return requested_user_id


def assert_route_in_account(db, route_id: str, caller: Caller) -> dict:
    """
    Load a route the caller is allowed to touch, or refuse.

    A route that belongs to another account and a route that does not exist produce the exact
    same refusal, so responses cannot be compared to discover which ids are real.
    """
    result = (
        db.table("routes")
        .select("id, route_name, user_id, account_id, delivery_date")
        .eq("id", route_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise forbidden()

    route = result.data[0]
    if route.get("account_id") != caller.account_id:
        raise forbidden()
    return route


def assert_machine_in_account(db, machine_id: str, caller: Caller, columns: str) -> dict:
    """
    Load a machine the caller is allowed to touch, or refuse.

    The owning route is pulled in the same query rather than a second round trip, because this
    sits on the voice path where every added wait is heard by the person holding the phone.
    """
    result = (
        db.table("machines")
        .select(f"{columns}, routes(account_id)")
        .eq("id", machine_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise forbidden()

    machine = result.data[0]
    parent = machine.pop("routes", None) or {}
    if parent.get("account_id") != caller.account_id:
        raise forbidden()
    return machine


def is_uuid_like(value: str | None) -> bool:
    """
    Session ids are not all database ids. The app mints its own local id (`session_1723...`)
    before a route is chosen and swaps in the real one afterwards, so a lookup that demanded a
    database id would strand a driver at the very start. Only a real id is worth checking.
    """
    if not value or len(value) != 36:
        return False
    parts = value.split("-")
    return len(parts) == 5 and all(
        len(p) == n and all(c in "0123456789abcdefABCDEF" for c in p)
        for p, n in zip(parts, (8, 4, 4, 4, 12))
    )
