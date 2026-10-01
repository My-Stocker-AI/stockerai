"""Real disposable-Auth coverage for the browser keyword-learning RPCs."""
import os
import secrets
from uuid import uuid4

import httpx
import pytest

from tests.test_atomic_progress import local_sql

pytestmark = pytest.mark.skipif(
    os.environ.get("STOCKERAI_DB_TESTS") != "1",
    reason="requires explicitly enabled disposable local database",
)


@pytest.fixture(scope="module")
def keyword_actors():
    from supabase import create_client
    from app.services.database import get_client

    db = get_client()
    assert (
        db.rpc("stockerai_disposable_marker").execute().data
        == "stockerai-local-only-20260918"
    )
    actors = []
    try:
        for _ in range(2):
            user_id = str(uuid4())
            password = secrets.token_urlsafe(32)
            email = f"{user_id}@example.invalid"
            created = db.auth.admin.create_user(
                {
                    "id": user_id,
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                }
            )
            assert created.user and created.user.id == user_id
            actor = create_client(
                os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"]
            )
            login = actor.auth.sign_in_with_password(
                {"email": email, "password": password}
            )
            assert login.session
            actors.append({"id": user_id, "client": actor})
        yield db, actors
    finally:
        for actor in actors:
            db.table("user_keywords").delete().eq("user_id", actor["id"]).execute()
            actor["client"].postgrest.aclose()
            actor["client"].auth.close()
            db.auth.admin.delete_user(actor["id"])


def test_keyword_functions_have_a_fixed_caller_bound_surface():
    for signature in [
        "upsert_user_keyword(uuid,text,boolean)",
        "get_top_user_keywords(uuid,numeric,integer)",
    ]:
        privileges = local_sql(
            f"""SELECT
              has_function_privilege('anon', 'public.{signature}', 'EXECUTE'),
              has_function_privilege('authenticated', 'public.{signature}', 'EXECUTE'),
              has_function_privilege('service_role', 'public.{signature}', 'EXECUTE');"""
        )
        assert privileges == "f|t|f"
        metadata = local_sql(
            f"""SELECT p.prosecdef,
              p.proconfig = ARRAY['search_path=public, pg_temp']::text[],
              position('auth.uid()' in pg_get_functiondef(p.oid)) > 0
            FROM pg_proc AS p
            WHERE p.oid = 'public.{signature}'::regprocedure;"""
        )
        assert metadata == "t|t|t"


def test_signed_in_user_keeps_existing_keyword_learning_behavior(keyword_actors):
    _, actors = keyword_actors
    owner = actors[0]
    for success in [True, True, False]:
        owner["client"].rpc(
            "upsert_user_keyword",
            {
                "p_user_id": owner["id"],
                "p_keyword": "disposable-product",
                "p_success": success,
            },
        ).execute()

    result = owner["client"].rpc(
        "get_top_user_keywords",
        {"p_user_id": owner["id"], "p_min_confidence": 0, "p_limit": 10},
    ).execute()
    row = next(entry for entry in result.data if entry["keyword"] == "disposable-product")
    assert row["success_count"] == 2
    assert row["failure_count"] == 1
    assert float(row["confidence_score"]) == 0.67


@pytest.mark.parametrize("function", ["upsert_user_keyword", "get_top_user_keywords"])
def test_signed_in_user_cannot_read_or_write_another_users_keywords(
    keyword_actors, function
):
    db, actors = keyword_actors
    caller, other = actors
    payload = {"p_user_id": other["id"]}
    if function == "upsert_user_keyword":
        payload.update(p_keyword="forged-keyword", p_success=True)
    else:
        payload.update(p_min_confidence=0, p_limit=10)

    with pytest.raises(Exception):
        caller["client"].rpc(function, payload).execute()

    assert (
        db.table("user_keywords")
        .select("id")
        .eq("user_id", other["id"])
        .eq("keyword", "forged-keyword")
        .execute()
        .data
        == []
    )


@pytest.mark.parametrize("function", ["upsert_user_keyword", "get_top_user_keywords"])
def test_anonymous_http_caller_cannot_execute_keyword_functions(
    keyword_actors, function
):
    _, actors = keyword_actors
    payload = {"p_user_id": actors[0]["id"]}
    if function == "upsert_user_keyword":
        payload.update(p_keyword="anonymous-keyword", p_success=True)
    else:
        payload.update(p_min_confidence=0, p_limit=10)
    response = httpx.post(
        f"{os.environ['STOCKERAI_TEST_SUPABASE_URL']}/rest/v1/rpc/{function}",
        headers={"apikey": os.environ["STOCKERAI_TEST_ANON_KEY"]},
        json=payload,
        timeout=10,
    )
    assert response.status_code in {401, 403}, response.text
