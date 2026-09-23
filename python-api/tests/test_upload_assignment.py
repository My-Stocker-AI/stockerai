from unittest.mock import MagicMock

from app.routes.upload import _ensure_route_assignment


def test_upload_assignment_is_idempotent_and_attributed_to_caller():
    db = MagicMock()

    _ensure_route_assignment(db, "route-1", "driver-1", "admin-1")

    assignments = db.table.return_value
    db.table.assert_called_once_with("route_assignments")
    assignments.upsert.assert_called_once_with(
        {
            "route_id": "route-1",
            "user_id": "driver-1",
            "assigned_by": "admin-1",
        },
        on_conflict="route_id,user_id",
    )
    assignments.upsert.return_value.execute.assert_called_once_with()
