from unittest.mock import patch
from uuid import uuid4
import pytest
from fastapi import HTTPException
from app.routes.items import PickingTransitionRequest, picking_transition
from app.services.auth import Caller


def body(**extra):
    return {'session_id':str(uuid4()),'operation_id':str(uuid4()),'expected_revision':str(uuid4()),
        'expected_machine_id':str(uuid4()),'action':'skip','direction':'forward','count':1,
        'expected_state':{'completed_items':0,'status':'pending','direction':'forward'},**extra}


def test_transition_uses_verified_caller_and_never_falls_back():
    caller=Caller(user_id=str(uuid4()),account_id='team',team_user_ids=[str(uuid4())])
    req=PickingTransitionRequest(**body(user_id='forged',team_user_ids=['forged']))
    with patch('app.routes.items.rpc',side_effect=RuntimeError('private detail')) as mock:
        with pytest.raises(HTTPException) as error: picking_transition(req,caller)
    assert error.value.status_code==503
    assert 'private' not in error.value.detail
    assert mock.call_count==1
    params=mock.call_args.args[1]
    assert params['p_user_id']==caller.user_id
    assert 'p_team_user_ids' not in params


@pytest.mark.parametrize('field,value',[('expected_revision','bad'),('action','destroy'),('direction','sideways'),
    ('expected_state',{'completed_items':-1,'status':'pending','direction':'forward'}),('count',3)])
def test_invalid_transition_refused_before_database(client,field,value):
    with patch('app.routes.items.rpc') as mock:
        assert client.post('/api/picking-transition',json=body(**{field:value})).status_code==422
    mock.assert_not_called()
