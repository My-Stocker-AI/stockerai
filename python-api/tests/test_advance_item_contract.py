from unittest.mock import patch
from uuid import uuid4

import pytest
from app.routes.items import AdvanceItemRequest, advance_item
from app.services.auth import Caller
from fastapi import HTTPException


def request(**changes):
    return AdvanceItemRequest(session_id=uuid4(), operation_id=uuid4(),
        expected_machine_id=uuid4(), expected_completed_items=1,
        expected_direction='forward', count=1, **changes)


def test_identity_and_account_membership_come_from_verified_caller():
    caller = Caller(user_id=str(uuid4()), account_id='account', team_user_ids=[str(uuid4())])
    req = request(user_id='forged', p_team_user_ids=['forged'])
    with patch('app.routes.items.rpc', return_value={'action': 'complete'}) as rpc:
        advance_item(req, caller)
    assert rpc.call_args.args[0] == 'advance_picking'
    sent = rpc.call_args.args[1]
    assert sent['p_user_id'] == caller.user_id
    assert sent['p_team_user_ids'] == caller.team_user_ids
    assert sent['p_session_id'] == str(req.session_id)


def test_missing_migration_never_falls_back_to_an_unguarded_mutation():
    caller = Caller(user_id=str(uuid4()), account_id='account', team_user_ids=[])
    with patch('app.routes.items.rpc', side_effect=RuntimeError('private database detail')) as rpc:
        with pytest.raises(HTTPException) as error:
            advance_item(request(), caller)
    assert error.value.status_code == 503
    assert 'private' not in error.value.detail
    assert rpc.call_count == 1


@pytest.mark.parametrize('field,value', [('session_id', 'browser-session'), ('operation_id', 'bad'),
    ('expected_completed_items', -1), ('count', 3), ('expected_direction', 'sideways')])
def test_invalid_progress_request_fails_before_database_access(client, field, value):
    body = request().model_dump(mode='json')
    body[field] = value
    with patch('app.routes.items.rpc') as rpc:
        assert client.post('/api/advance-item', json=body).status_code == 422
    rpc.assert_not_called()
