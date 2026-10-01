"""Transactional and idempotent route replacement against disposable Supabase."""
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("STOCKERAI_DB_TESTS") != "1",
    reason="requires explicitly enabled disposable local database",
)


def _payload(operation_id, caller, account, driver, *, request_hash="a" * 64, product="Chips"):
    return {
        "p_operation_id": operation_id,
        "p_caller_id": caller,
        "p_account_id": account,
        "p_driver_id": driver,
        "p_request_hash": request_hash,
        "p_route_name": "Atomic upload fixture",
        "p_delivery_date": "2099-12-30",
        "p_pdf_url": "https://test.supabase.co/storage/v1/object/public/route-pdfs/fixture.pdf",
        "p_driver_name": "Disposable Driver",
        "p_machines": [{
            "machine_name": "Machine 1",
            "machine_number": 101,
            "location_name": "Fixture location",
            "sequence": 1,
            "items": [{
                "product_name": product,
                "quantity": 2,
                "slot": "A1",
                "sequence": 1,
                "inventory_current": 3,
                "inventory_parlevel": 5,
            }],
        }],
    }


def _pending_payload(operation_id, caller, account, driver, *, request_hash="e" * 64):
    return {
        "p_operation_id": operation_id,
        "p_caller_id": caller,
        "p_account_id": account,
        "p_user_id": driver,
        "p_request_hash": request_hash,
        "p_account_email": "operator@example.invalid",
        "p_vendor": "Other",
        "p_filename": "fixture.pdf",
        "p_pdf_url": "https://test.supabase.co/storage/v1/object/public/route-pdfs/pending/fixture.pdf",
        "p_reason": "vendor_other",
    }


@pytest.fixture
def upload_tenant():
    from app.services.database import get_client

    db = get_client()
    assert db.rpc("stockerai_disposable_marker").execute().data == "stockerai-local-only-20260918"
    account = db.table("accounts").insert({"name": "DISPOSABLE_UPLOAD_ACCOUNT"}).execute().data[0]["id"]
    users = []
    try:
        for role in ("primary_admin", "driver"):
            user_id = str(uuid4())
            db.auth.admin.create_user({
                "id": user_id,
                "email": f"{user_id}@example.invalid",
                "password": secrets.token_urlsafe(32),
                "email_confirm": True,
            })
            users.append(user_id)
            db.table("account_users").insert({
                "account_id": account,
                "user_id": user_id,
                "role": role,
            }).execute()
        yield db, account, users[0], users[1]
    finally:
        db.table("routes").delete().eq("account_id", account).execute()
        for user_id in reversed(users):
            db.auth.admin.delete_user(user_id)
        db.table("accounts").delete().eq("id", account).execute()


def test_retry_returns_the_first_committed_route(upload_tenant):
    db, account, admin, driver = upload_tenant
    operation = str(uuid4())
    args = _payload(operation, admin, account, driver)

    first = db.rpc("replace_route_upload", args).execute().data
    second = db.rpc("replace_route_upload", args).execute().data

    assert second == first
    assert first["assignment_confirmed"] is True
    routes = db.table("routes").select("id,total_machines,total_items").eq(
        "account_id", account
    ).eq("route_name", "Atomic upload fixture").execute().data
    assert routes == [{"id": first["route_id"], "total_machines": 1, "total_items": 1}]


def test_concurrent_retries_converge_on_one_committed_route(upload_tenant):
    from supabase import create_client

    db, account, admin, driver = upload_tenant
    operation = str(uuid4())
    args = _payload(operation, admin, account, driver)
    start = Barrier(3)

    def submit():
        client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],
        )
        start.wait()
        return client.rpc("replace_route_upload", args).execute().data

    with ThreadPoolExecutor(max_workers=2) as pool:
        calls = [pool.submit(submit) for _ in range(2)]
        start.wait()
        results = [call.result(timeout=10) for call in calls]

    assert results[0] == results[1]
    route_id = results[0]["route_id"]
    assert db.table("routes").select("id").eq("account_id", account).eq(
        "route_name", "Atomic upload fixture"
    ).execute().data == [{"id": route_id}]
    assert db.table("route_upload_operations").select("operation_id,status").eq(
        "operation_id", operation
    ).execute().data == [{"operation_id": operation, "status": "completed"}]


def test_failed_replacement_rolls_back_without_deleting_previous_route(upload_tenant):
    db, account, admin, driver = upload_tenant
    first = db.rpc("replace_route_upload", _payload(str(uuid4()), admin, account, driver)).execute().data
    invalid = _payload(str(uuid4()), admin, account, driver, request_hash="b" * 64, product="")

    with pytest.raises(Exception) as caught:
        db.rpc("replace_route_upload", invalid).execute()
    assert getattr(caught.value, "code", None) == "22023"

    routes = db.table("routes").select("id").eq("account_id", account).eq(
        "route_name", "Atomic upload fixture"
    ).execute().data
    assert routes == [{"id": first["route_id"]}]
    assert db.table("route_upload_operations").select("operation_id").eq(
        "operation_id", invalid["p_operation_id"]
    ).execute().data == []


def test_active_route_cannot_be_replaced(upload_tenant):
    db, account, admin, driver = upload_tenant
    first = db.rpc("replace_route_upload", _payload(str(uuid4()), admin, account, driver)).execute().data
    machine = db.table("machines").select("id").eq("route_id", first["route_id"]).execute().data[0]["id"]
    session = db.table("sessions").insert({
        "user_id": driver,
        "session_key": f"upload-{uuid4()}",
        "status": "stocking",
        "current_route_id": first["route_id"],
        "current_machine_id": machine,
    }).execute().data[0]["id"]
    try:
        with pytest.raises(Exception) as caught:
            db.rpc("replace_route_upload", _payload(
                str(uuid4()), admin, account, driver, request_hash="c" * 64
            )).execute()
        assert getattr(caught.value, "message", None) == "Cannot replace a route with an active session."
        assert db.table("routes").select("id").eq("id", first["route_id"]).execute().data
    finally:
        db.table("sessions").delete().eq("id", session).execute()


def test_operation_id_cannot_be_reused_for_different_content(upload_tenant):
    db, account, admin, driver = upload_tenant
    operation = str(uuid4())
    db.rpc("replace_route_upload", _payload(operation, admin, account, driver)).execute()

    with pytest.raises(Exception) as caught:
        db.rpc("replace_route_upload", _payload(
            operation, admin, account, driver, request_hash="d" * 64
        )).execute()
    assert getattr(caught.value, "code", None) == "22023"


def test_driver_without_upload_capability_is_refused(upload_tenant):
    db, account, _admin, driver = upload_tenant
    with pytest.raises(Exception) as caught:
        db.rpc("replace_route_upload", _payload(str(uuid4()), driver, account, driver)).execute()
    assert getattr(caught.value, "code", None) == "42501"
    assert getattr(caught.value, "message", None) == "Not available on this account."


def test_pending_format_retry_is_single_and_mismatch_is_refused(upload_tenant):
    db, account, admin, driver = upload_tenant
    operation = str(uuid4())
    args = _pending_payload(operation, admin, account, driver)

    first = db.rpc("record_pending_format_upload", args).execute().data
    retry = db.rpc("record_pending_format_upload", args).execute().data

    assert first["created"] is True
    assert retry == {
        "pending_id": first["pending_id"],
        "created": False,
        "status": "new",
    }
    rows = db.table("pending_unrecognized_formats").select(
        "id,operation_id,request_hash,account_id,user_id"
    ).eq("operation_id", operation).execute().data
    assert rows == [{
        "id": first["pending_id"],
        "operation_id": operation,
        "request_hash": "e" * 64,
        "account_id": account,
        "user_id": driver,
    }]

    with pytest.raises(Exception) as caught:
        db.rpc("record_pending_format_upload", _pending_payload(
            operation, admin, account, driver, request_hash="f" * 64
        )).execute()
    assert getattr(caught.value, "code", None) == "22023"


def test_operation_id_cannot_cross_between_route_and_pending_paths(upload_tenant):
    db, account, admin, driver = upload_tenant

    route_operation = str(uuid4())
    db.rpc(
        "replace_route_upload",
        _payload(route_operation, admin, account, driver),
    ).execute()
    with pytest.raises(Exception) as pending_after_route:
        db.rpc(
            "record_pending_format_upload",
            _pending_payload(route_operation, admin, account, driver),
        ).execute()
    assert getattr(pending_after_route.value, "code", None) == "22023"

    pending_operation = str(uuid4())
    db.rpc(
        "record_pending_format_upload",
        _pending_payload(pending_operation, admin, account, driver),
    ).execute()
    with pytest.raises(Exception) as route_after_pending:
        db.rpc(
            "replace_route_upload",
            _payload(pending_operation, admin, account, driver),
        ).execute()
    assert getattr(route_after_pending.value, "code", None) == "22023"
