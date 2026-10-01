import asyncio
import io
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import UploadFile

from app.routes.upload import upload_pdf
from app.services.auth import Caller


def _query_result(rows):
    query = MagicMock()
    query.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = rows
    query.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = rows
    return query


def test_upload_binds_atomic_rpc_to_caller_driver_and_operation():
    operation_id = uuid4()
    caller = Caller(
        user_id="admin-1",
        account_id="account-1",
        team_user_ids=["admin-1", "driver-1"],
    )
    db = MagicMock()
    membership = _query_result([{"role": "primary_admin", "can_upload_routes": False}])
    profile = _query_result([{"first_name": "Test", "last_name": "Driver"}])
    db.table.side_effect = lambda name: {
        "account_users": membership,
        "profiles": profile,
    }[name]
    db.rpc.return_value.execute.return_value.data = {
        "route_id": "route-1",
        "assignment_confirmed": True,
        "route": "South",
        "machines": 1,
        "items": 1,
        "date": "2026-07-02",
    }
    parsed = {
        "route_name": "South",
        "locations": [{
            "location_name": "Loc",
            "machines": [{
                "machine_name": "M1",
                "asset_number": 54,
                "items": [{
                    "product_name": "Chips",
                    "quantity": 3,
                    "slot": "010",
                    "inventory_current": 6,
                    "inventory_parlevel": 9,
                }],
            }],
        }],
        "warnings": [],
    }

    with patch("app.routes.upload.get_client", return_value=db), \
         patch("app.routes.upload.extract_text_from_pdf", return_value="x" * 100), \
         patch("app.routes.upload.parse_route_pdf", return_value=parsed):
        result = asyncio.run(upload_pdf(
            pdf=UploadFile(filename="route.pdf", file=io.BytesIO(b"%PDF-1.4 fixture")),
            date="2026-07-02",
            for_user_id="driver-1",
            vendor="Parlevel",
            operation_id=operation_id,
            caller=caller,
        ))

    rpc_name, rpc_args = db.rpc.call_args.args
    assert rpc_name == "replace_route_upload"
    assert rpc_args["p_operation_id"] == str(operation_id)
    assert rpc_args["p_caller_id"] == "admin-1"
    assert rpc_args["p_account_id"] == "account-1"
    assert rpc_args["p_driver_id"] == "driver-1"
    assert len(rpc_args["p_request_hash"]) == 64
    storage_path, stored_bytes, storage_options = db.storage.from_.return_value.upload.call_args.args
    assert str(operation_id) in storage_path
    assert rpc_args["p_request_hash"] in storage_path
    assert stored_bytes == b"%PDF-1.4 fixture"
    assert storage_options == {"content-type": "application/pdf", "upsert": "true"}
    assert result["route_id"] == "route-1"
    assert result["assignment_confirmed"] is True


def test_denied_driver_cannot_create_a_storage_object_before_rpc_refusal():
    caller = Caller(
        user_id="driver-1",
        account_id="account-1",
        team_user_ids=["driver-1"],
    )
    db = MagicMock()
    db.table.return_value = _query_result([{"role": "driver", "can_upload_routes": False}])
    upload = UploadFile(filename="route.pdf", file=io.BytesIO(b"%PDF-1.4 fixture"))

    with patch("app.routes.upload.get_client", return_value=db):
        try:
            asyncio.run(upload_pdf(
                pdf=upload,
                date="2026-07-02",
                for_user_id="driver-1",
                vendor="Parlevel",
                operation_id=uuid4(),
                caller=caller,
            ))
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 403
            assert getattr(exc, "detail", None) == "Not available on this account."
        else:
            raise AssertionError("upload should have been refused")

    assert upload.file.tell() == 0
    assert not db.storage.from_.called
    assert not db.rpc.called


def test_legacy_upload_without_operation_id_is_refused_before_file_or_storage():
    caller = Caller(
        user_id="admin-1",
        account_id="account-1",
        team_user_ids=["admin-1"],
    )
    db = MagicMock()
    upload = UploadFile(filename="route.pdf", file=io.BytesIO(b"%PDF-1.4 fixture"))

    with patch("app.routes.upload.get_client", return_value=db):
        try:
            asyncio.run(upload_pdf(
                pdf=upload,
                date="2026-07-02",
                for_user_id="admin-1",
                vendor="Parlevel",
                operation_id=None,
                caller=caller,
            ))
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 409
            assert "Reload StockerAI" in getattr(exc, "detail", "")
        else:
            raise AssertionError("unsafe legacy upload should have been refused")

    assert upload.file.tell() == 0
    assert not db.table.called
    assert not db.storage.from_.called
    assert not db.rpc.called


def test_storage_failure_stops_before_route_transaction():
    operation_id = uuid4()
    caller = Caller(
        user_id="admin-1",
        account_id="account-1",
        team_user_ids=["admin-1"],
    )
    db = MagicMock()
    db.table.return_value = _query_result([
        {"role": "primary_admin", "can_upload_routes": False}
    ])
    db.storage.from_.return_value.upload.side_effect = RuntimeError("storage unavailable")
    parsed = {
        "route_name": "South",
        "locations": [{
            "location_name": "Loc",
            "machines": [{
                "machine_name": "M1",
                "asset_number": 54,
                "items": [{
                    "product_name": "Chips",
                    "quantity": 3,
                    "slot": "010",
                    "inventory_current": 6,
                    "inventory_parlevel": 9,
                }],
            }],
        }],
        "warnings": [],
    }

    with patch("app.routes.upload.get_client", return_value=db), \
         patch("app.routes.upload.extract_text_from_pdf", return_value="x" * 100), \
         patch("app.routes.upload.parse_route_pdf", return_value=parsed):
        try:
            asyncio.run(upload_pdf(
                pdf=UploadFile(filename="route.pdf", file=io.BytesIO(b"%PDF-1.4 fixture")),
                date="2026-07-02",
                for_user_id="admin-1",
                vendor="Parlevel",
                operation_id=operation_id,
                caller=caller,
            ))
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 503
            assert "could not be stored" in getattr(exc, "detail", "")
        else:
            raise AssertionError("route transaction should not run without its stored PDF")

    assert not db.rpc.called
