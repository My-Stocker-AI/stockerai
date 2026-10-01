"""Durable, ordered Stripe-to-account state on the disposable database."""
from datetime import datetime, timedelta, timezone
import os
import subprocess
from uuid import uuid4

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("STOCKERAI_DB_TESTS") != "1",
    reason="requires explicitly enabled disposable local database",
)

PSQL = [
    "docker", "exec", "-i", "supabase_db_stockerai-disposable", "psql",
    "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
]


@pytest.fixture
def billing_account():
    from app.services.database import get_client

    db = get_client()
    assert db.rpc("stockerai_disposable_marker").execute().data == "stockerai-local-only-20260918"
    account_id = str(uuid4())
    event_ids = [f"evt_disposable_{uuid4().hex}" for _ in range(3)]
    db.table("accounts").insert({"id": account_id, "name": "DISPOSABLE_BILLING_ACCOUNT"}).execute()
    try:
        yield db, account_id, event_ids
    finally:
        quoted = ",".join("'" + event_id.replace("'", "''") + "'" for event_id in event_ids)
        subprocess.run(PSQL + ["-c", f"DELETE FROM public.stripe_webhook_events WHERE event_id IN ({quoted})"], check=True)
        db.table("accounts").delete().eq("id", account_id).execute()


def test_webhook_claims_are_idempotent_and_retry_failures(billing_account):
    db, _, event_ids = billing_account
    created = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    args = {
        "p_event_id": event_ids[0],
        "p_event_type": "customer.subscription.updated",
        "p_event_created_at": created,
    }

    assert db.rpc("claim_stripe_webhook_event", args).execute().data == "claimed"
    assert db.rpc("claim_stripe_webhook_event", args).execute().data == "processing"
    db.rpc("finish_stripe_webhook_event", {
        "p_event_id": event_ids[0], "p_error": "synthetic retry",
    }).execute()
    assert db.rpc("claim_stripe_webhook_event", args).execute().data == "claimed"
    db.rpc("finish_stripe_webhook_event", {
        "p_event_id": event_ids[0], "p_error": None,
    }).execute()
    assert db.rpc("claim_stripe_webhook_event", args).execute().data == "processed"


def test_newer_stripe_state_wins_and_uses_item_quantity_floor(billing_account):
    db, account_id, _ = billing_account
    older = datetime.now(timezone.utc).replace(microsecond=0)
    newer = older + timedelta(minutes=1)
    base = {
        "p_account_id": account_id,
        "p_customer_id": f"cus_{uuid4().hex}",
        "p_subscription_id": f"sub_{uuid4().hex}",
        "p_period_end": (newer + timedelta(days=30)).isoformat(),
    }
    first = db.rpc("apply_stripe_account_state", {
        **base,
        "p_subscription_status": "active",
        "p_driver_count": 1,
        "p_event_created_at": newer.isoformat(),
    }).execute().data
    stale = db.rpc("apply_stripe_account_state", {
        **base,
        "p_subscription_status": "canceled",
        "p_driver_count": 9,
        "p_event_created_at": older.isoformat(),
    }).execute().data
    account = db.table("accounts").select(
        "stripe_customer_id,stripe_subscription_id,subscription_status,driver_count,stripe_state_event_created_at"
    ).eq("id", account_id).single().execute().data

    assert first is True
    assert stale is False
    assert account["stripe_customer_id"] == base["p_customer_id"]
    assert account["stripe_subscription_id"] == base["p_subscription_id"]
    assert account["subscription_status"] == "active"
    assert account["driver_count"] == 2
    assert account["stripe_state_event_created_at"].startswith(newer.date().isoformat())


def test_customer_binding_is_unique_and_cannot_be_reassigned(billing_account):
    db, account_id, _ = billing_account
    other_account = str(uuid4())
    customer_id = f"cus_{uuid4().hex}"
    subscription_id = f"sub_{uuid4().hex}"
    db.table("accounts").insert({"id": other_account, "name": "DISPOSABLE_BILLING_OTHER"}).execute()
    try:
        db.rpc("apply_stripe_account_state", {
            "p_account_id": account_id,
            "p_customer_id": customer_id,
            "p_subscription_id": subscription_id,
            "p_subscription_status": "trialing",
            "p_driver_count": 4,
            "p_period_end": None,
            "p_event_created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        with pytest.raises(Exception):
            db.rpc("apply_stripe_account_state", {
                "p_account_id": other_account,
                "p_customer_id": customer_id,
                "p_subscription_id": f"sub_{uuid4().hex}",
                "p_subscription_status": "active",
                "p_driver_count": 4,
                "p_period_end": None,
                "p_event_created_at": (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat(),
            }).execute()
    finally:
        db.table("accounts").delete().eq("id", other_account).execute()


def test_checkout_reservation_converges_retries_and_refuses_quantity_changes(billing_account):
    db, account_id, _ = billing_account
    first_operation = str(uuid4())
    competing_operation = str(uuid4())
    next_operation = str(uuid4())

    first = db.rpc("reserve_billing_checkout", {
        "p_account_id": account_id,
        "p_operation_id": first_operation,
        "p_driver_count": 4,
    }).execute().data[0]
    converged = db.rpc("reserve_billing_checkout", {
        "p_account_id": account_id,
        "p_operation_id": competing_operation,
        "p_driver_count": 4,
    }).execute().data[0]
    assert first["operation_id"] == first_operation
    assert converged["operation_id"] == first_operation

    with pytest.raises(Exception):
        db.rpc("reserve_billing_checkout", {
            "p_account_id": account_id,
            "p_operation_id": competing_operation,
            "p_driver_count": 5,
        }).execute()

    db.rpc("complete_billing_checkout", {
        "p_account_id": account_id,
        "p_operation_id": first_operation,
        "p_session_id": f"cs_test_{uuid4().hex}",
        "p_session_url": "https://checkout.stripe.example.invalid/session",
    }).execute()
    db.rpc("expire_billing_checkout", {
        "p_account_id": account_id,
        "p_operation_id": first_operation,
    }).execute()
    rotated = db.rpc("reserve_billing_checkout", {
        "p_account_id": account_id,
        "p_operation_id": next_operation,
        "p_driver_count": 5,
    }).execute().data[0]
    assert rotated["operation_id"] == next_operation
    assert rotated["driver_count"] == 5
    assert rotated["status"] == "preparing"
