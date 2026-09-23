"""Fail-closed authorization contract without a database or real credentials."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from app.services.auth import _resolve_account


@pytest.mark.parametrize('rows', [None, [], [{'account_id': 'a', 'team_user_ids': ['other']}],
                                [{'account_id': None, 'team_user_ids': ['user']}], [{}, {}]])
def test_invalid_account_resolution_fails_closed(rows):
    db = Mock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(data=rows)
    with patch('app.services.auth.get_client', return_value=db), pytest.raises(HTTPException) as error:
        _resolve_account('user')
    assert error.value.status_code == 403


@pytest.mark.parametrize('code,status', [('42501', 403), ('other', 503)])
def test_resolution_failure_is_safe_and_never_returns_cached_authority(code, status):
    db = Mock()
    db.rpc.return_value.execute.return_value = SimpleNamespace(data=[{'account_id': 'a', 'team_user_ids': ['user']}])
    with patch('app.services.auth.get_client', return_value=db):
        assert _resolve_account('user') == ('a', ['user'])
        failure = RuntimeError('private database details')
        failure.code = code
        db.rpc.return_value.execute.side_effect = failure
        with pytest.raises(HTTPException) as error:
            _resolve_account('user')
        assert error.value.status_code == status
        assert 'private' not in error.value.detail
    assert db.rpc.call_count == 2
