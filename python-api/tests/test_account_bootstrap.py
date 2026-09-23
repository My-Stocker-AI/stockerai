"""Transactional signup and complimentary-access contracts on the disposable database."""
import os
import secrets
from uuid import uuid4

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("STOCKERAI_DB_TESTS") != "1",
    reason="requires explicitly enabled disposable local database",
)

PLATFORM_ADMIN_ID = "bdc96b72-3f35-4cae-9e79-99473eb4a23b"


@pytest.fixture
def signup_accounts():
    from app.services.database import get_client
    from supabase import create_client

    db = get_client()
    assert db.rpc("stockerai_disposable_marker").execute().data == "stockerai-local-only-20260918"
    users = []
    accounts = []

    def create_user(*, user_id=None, signup=False, first_name="Pilot", driver_count=4):
        uid = user_id or str(uuid4())
        email = f"{uid}@example.invalid"
        password = secrets.token_urlsafe(32)
        metadata = {"first_name": first_name, "last_name": "Tester"}
        if signup:
            metadata.update({"stocker_account_signup": True, "driver_count": driver_count})
        created = db.auth.admin.create_user({
            "id": uid,
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": metadata,
        })
        assert created.user and created.user.id == uid
        users.append(uid)
        client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
        login = client.auth.sign_in_with_password({"email": email, "password": password})
        assert login.session
        return {"id": uid, "email": email, "password": password, "client": client}

    try:
        yield db, create_user, accounts
    finally:
        for uid in reversed(users):
            db.auth.admin.delete_user(uid)
        for account_id in reversed(accounts):
            db.table("accounts").delete().eq("id", account_id).execute()


def test_signup_creates_complete_company_and_admin_atomically(signup_accounts):
    db, create_user, accounts = signup_accounts
    owner = create_user(signup=True, first_name="Atomic", driver_count=4)

    membership = db.table("account_users").select(
        "account_id,role,can_view_all_routes,can_upload_routes"
    ).eq("user_id", owner["id"]).single().execute().data
    accounts.append(membership["account_id"])
    account = db.table("accounts").select(
        "name,driver_count,subscription_status,is_platform_account"
    ).eq("id", membership["account_id"]).single().execute().data
    profile = db.table("profiles").select("first_name,last_name,email").eq(
        "id", owner["id"]
    ).single().execute().data

    assert membership == {
        "account_id": membership["account_id"],
        "role": "primary_admin",
        "can_view_all_routes": True,
        "can_upload_routes": True,
    }
    assert account == {
        "name": "Atomic's Company",
        "driver_count": 4,
        "subscription_status": "trialing",
        "is_platform_account": False,
    }
    assert profile == {"first_name": "Atomic", "last_name": "Tester", "email": owner["email"]}


def test_invited_identity_does_not_create_a_company(signup_accounts):
    db, create_user, _ = signup_accounts
    invited = create_user(signup=False)
    assert db.table("profiles").select("id").eq("id", invited["id"]).single().execute().data
    assert db.table("account_users").select("id").eq("user_id", invited["id"]).execute().data == []


def test_customer_cannot_edit_access_fields_but_can_edit_company_settings(signup_accounts):
    db, create_user, accounts = signup_accounts
    owner = create_user(signup=True)
    membership = db.table("account_users").select("account_id").eq(
        "user_id", owner["id"]
    ).single().execute().data
    account_id = membership["account_id"]
    accounts.append(account_id)

    with pytest.raises(Exception):
        owner["client"].table("accounts").update({"is_platform_account": True}).eq(
            "id", account_id
        ).execute()
    with pytest.raises(Exception):
        owner["client"].table("accounts").update({"driver_count": 99}).eq(
            "id", account_id
        ).execute()

    changed = owner["client"].table("accounts").update({
        "name": "Renamed Pilot", "machines_per_driver": 12
    }).eq("id", account_id).execute().data[0]
    assert changed["name"] == "Renamed Pilot"
    assert changed["machines_per_driver"] == 12


def test_only_platform_admin_can_grant_no_charge_access(signup_accounts):
    db, create_user, accounts = signup_accounts
    owner = create_user(signup=True)
    account_id = db.table("account_users").select("account_id").eq(
        "user_id", owner["id"]
    ).single().execute().data["account_id"]
    accounts.append(account_id)

    args = {
        "p_account_id": account_id,
        "p_driver_count": 6,
        "p_is_complimentary": True,
        "p_subscription_status": "active",
    }
    with pytest.raises(Exception):
        owner["client"].rpc("admin_update_account_access", args).execute()

    admin = create_user(user_id=PLATFORM_ADMIN_ID, signup=False, first_name="Platform")
    result = admin["client"].rpc("admin_update_account_access", args).execute().data
    assert result["id"] == account_id
    assert result["is_platform_account"] is True
    assert result["subscription_status"] == "active"
    assert result["driver_count"] == 6
    assert result["trial_ends_at"] is None


def test_stripe_linked_account_cannot_be_converted_to_complimentary(signup_accounts):
    db, create_user, accounts = signup_accounts
    owner = create_user(signup=True)
    account_id = db.table("account_users").select("account_id").eq(
        "user_id", owner["id"]
    ).single().execute().data["account_id"]
    accounts.append(account_id)
    db.table("accounts").update({"stripe_customer_id": "cus_disposable"}).eq(
        "id", account_id
    ).execute()
    admin = create_user(user_id=PLATFORM_ADMIN_ID, signup=False, first_name="Platform")

    with pytest.raises(Exception):
        admin["client"].rpc("admin_update_account_access", {
            "p_account_id": account_id,
            "p_driver_count": 4,
            "p_is_complimentary": True,
            "p_subscription_status": "active",
        }).execute()
