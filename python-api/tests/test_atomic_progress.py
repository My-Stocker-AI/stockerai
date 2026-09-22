"""Real disposable database coverage for the explicit-target advancement protocol."""
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from tests.test_database_skip_recovery import FIXTURES, route

pytestmark = pytest.mark.skipif(os.environ.get('STOCKERAI_DB_TESTS') != '1',
                               reason='requires explicitly enabled disposable local database')


def body(route, **changes):
    _, sid, mids = route
    return {'session_id': sid, 'user_id': FIXTURES.user_id, 'operation_id': str(uuid4()),
            'expected_machine_id': mids[0], 'expected_completed_items': 1,
            'expected_direction': 'forward', 'count': 1, **changes}


def progress(route):
    db, sid, mids = route
    return (db.table('machines').select('completed_items,status').eq('id', mids[0]).execute().data[0],
            db.table('sessions').select('status,current_machine_id').eq('id', sid).execute().data[0])


@pytest.mark.parametrize('count', [1, 2])
@pytest.mark.parametrize('direction', ['forward', 'reverse'])
def test_duplicate_after_lost_response_returns_same_result(client, route, count, direction):
    db, sid, mids = route
    db.table('sessions').update({'pick_direction': direction}).eq('id', sid).execute()
    request = body(route, count=count, expected_direction=direction)
    first = client.post('/api/advance-item', json=request)
    assert first.status_code == 200, first.text
    # Treat first response as lost; repeat the exact operation on a new HTTP call.
    second = client.post('/api/advance-item', json=request)
    assert second.status_code == 200, second.text
    assert first.json() == second.json()
    assert progress(route)[0]['completed_items'] == 1 + count
    assert first.json()['item1']['product_name'] == 'Product 2'
    if count == 2:
        assert first.json()['item2']['product_name'] == ('Product 3' if direction == 'forward' else 'Product 1')


def test_concurrent_duplicates_commit_once(client, route):
    request = body(route)
    with ThreadPoolExecutor(max_workers=4) as workers:
        responses = list(workers.map(lambda _: client.post('/api/advance-item', json=request), range(4)))
    assert [r.status_code for r in responses] == [200] * 4
    assert all(r.json() == responses[0].json() for r in responses)
    assert progress(route)[0]['completed_items'] == 2


def test_distinct_commands_for_same_old_item_conflict(client, route):
    with ThreadPoolExecutor(max_workers=2) as workers:
        responses = list(workers.map(lambda request: client.post('/api/advance-item', json=request),
                                     [body(route), body(route)]))
    assert sorted(r.status_code for r in responses) == [200, 409]
    assert progress(route)[0]['completed_items'] == 2


@pytest.mark.parametrize('change', ['machine', 'count', 'direction', 'paused', 'unknown_session', 'other_user'])
def test_stale_or_unauthorized_targets_never_advance(client, route, change):
    db, sid, mids = route
    request = body(route)
    expected_status = 409
    if change == 'machine': request['expected_machine_id'] = mids[1]
    if change == 'count': request['expected_completed_items'] = 0
    if change == 'direction': request['expected_direction'] = 'reverse'
    if change == 'paused': db.table('sessions').update({'status': 'paused'}).eq('id', sid).execute()
    if change == 'unknown_session': request['session_id'] = str(uuid4()); expected_status = 403
    if change == 'other_user': request['user_id'] = str(uuid4()); expected_status = 403
    before = progress(route)
    response = client.post('/api/advance-item', json=request)
    assert response.status_code == expected_status, response.text
    assert progress(route) == before


def test_same_key_cannot_be_reused_with_changed_payload(client, route):
    request = body(route)
    assert client.post('/api/advance-item', json=request).status_code == 200
    request['expected_completed_items'] = 2
    assert client.post('/api/advance-item', json=request).status_code == 409
    assert progress(route)[0]['completed_items'] == 2


def test_missing_second_item_never_counts_unpresented_work(client, route):
    db, _, mids = route
    db.table('items').delete().eq('machine_id', mids[0]).eq('sequence', 3).execute()
    before = progress(route)
    response = client.post('/api/advance-item', json=body(route, count=2))
    assert response.status_code == 503
    assert progress(route) == before


def test_stale_session_never_redirects_to_a_newer_active_session(client, route):
    db, sid, mids = route
    newer = db.table('sessions').insert({'user_id': FIXTURES.user_id, 'session_key': str(uuid4()),
        'status': 'stocking', 'current_route_id': db.table('machines').select('route_id').eq('id', mids[0]).execute().data[0]['route_id'],
        'current_machine_id': mids[1], 'pick_direction': 'forward'}).execute().data[0]['id']
    response = client.post('/api/advance-item', json=body(route))
    # The captured single-active-session trigger pauses the old session. The
    # request must refuse it, not silently select the newly active destination.
    assert response.status_code == 409, response.text
    assert progress(route)[0]['completed_items'] == 1
    assert db.table('machines').select('completed_items').eq('id', mids[1]).execute().data[0]['completed_items'] == 0
    assert db.table('sessions').select('current_machine_id').eq('id', newer).execute().data[0]['current_machine_id'] == mids[1]


@pytest.mark.parametrize('finish_route', [False, True])
def test_completion_and_handoff_are_durable_and_replayable(client, route, finish_route):
    db, sid, mids = route
    db.table('machines').update({'completed_items': 3}).eq('id', mids[0]).execute()
    if finish_route:
        db.table('machines').update({'completed_items': 3, 'status': 'completed'}).eq('id', mids[1]).execute()
    request = body(route, expected_completed_items=3)
    response = client.post('/api/advance-item', json=request)
    assert response.status_code == 200, response.text
    assert response.json()['action'] == ('complete' if finish_route else 'next_machine')
    before = progress(route)
    assert before[0]['status'] == 'completed'
    assert before[1] == {'status': 'completed' if finish_route else 'stocking',
                         'current_machine_id': mids[0] if finish_route else mids[1]}
    assert client.post('/api/advance-item', json=request).json() == response.json()
    assert progress(route) == before


def local_sql(sql):
    command = ['docker', 'exec', '-i', 'supabase_db_stockerai-disposable', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    marker = subprocess.check_output(command + ['-c', 'SELECT public.stockerai_disposable_marker()'], text=True).strip()
    assert marker == 'stockerai-local-only-20260918'
    return subprocess.check_output(command, input=sql, text=True).strip()


@pytest.mark.parametrize('mode', ['item', 'handoff', 'complete'])
def test_failure_after_progress_write_rolls_back_everything(client, route, mode):
    db, sid, mids = route
    if mode != 'item':
        db.table('machines').update({'completed_items': 3}).eq('id', mids[0]).execute()
    if mode == 'complete':
        db.table('machines').update({'completed_items': 3, 'status': 'completed'}).eq('id', mids[1]).execute()
    # Fault injection exists ONLY in the marked disposable database, for this UUID.
    local_sql(f"""CREATE FUNCTION public.test_fail_progress() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.session_id = '{sid}'::uuid THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_progress BEFORE INSERT ON public.picking_operations
      FOR EACH ROW EXECUTE FUNCTION public.test_fail_progress();""")
    request = body(route, expected_completed_items=1 if mode == 'item' else 3)
    before = progress(route)
    try:
        response = client.post('/api/advance-item', json=request)
        assert response.status_code == 503, response.text
        assert 'injected' not in response.text
        assert progress(route) == before
    finally:
        local_sql('DROP TRIGGER test_fail_progress ON public.picking_operations; DROP FUNCTION public.test_fail_progress();')
    assert client.post('/api/advance-item', json=request).status_code == 200
    assert progress(route)[0]['completed_items'] == (2 if mode == 'item' else 3)


def test_direct_browser_roles_cannot_call_progress_function_or_read_ledger():
    values = local_sql("""SELECT has_function_privilege('anon', 'public.advance_picking(uuid,uuid[],uuid,uuid,uuid,integer,integer,text)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.advance_picking(uuid,uuid[],uuid,uuid,uuid,integer,integer,text)', 'EXECUTE'),
      has_table_privilege('anon', 'public.picking_operations', 'SELECT'),
      has_table_privilege('authenticated', 'public.picking_operations', 'SELECT');""")
    assert values == 'f|f|f|f'


def test_real_local_login_can_advance_and_anonymous_request_cannot(client, route):
    """Use local Auth/JWKS/account resolution, not the usual picking-test stand-in."""
    import secrets
    from supabase import create_client
    from app.main import app
    from app.services.auth import require_auth, _account_cache
    db, _, _ = route
    account_id = None
    previous = app.dependency_overrides.pop(require_auth, None)
    try:
        account_id = db.table('accounts').insert({'name': 'DISPOSABLE_AUTH_TEST'}).execute().data[0]['id']
        db.table('account_users').insert({'account_id': account_id, 'user_id': FIXTURES.user_id, 'role': 'driver'}).execute()
        password = secrets.token_urlsafe(32)
        db.auth.admin.update_user_by_id(FIXTURES.user_id, {'password': password})
        auth_client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
        login = auth_client.auth.sign_in_with_password({'email': f'{FIXTURES.user_id}@example.invalid', 'password': password})
        assert login.session
        request = body(route)
        assert client.post('/api/advance-item', json=request).status_code == 401
        headers = {'Authorization': f'Bearer {login.session.access_token}'}
        missing = {**request, 'session_id': str(uuid4())}
        assert client.post('/api/advance-item', json=missing, headers=headers).status_code == 403
        # A body-supplied identity must not override the real local access token.
        request['user_id'] = str(uuid4())
        response = client.post('/api/advance-item', json=request,
            headers=headers)
        assert response.status_code == 200, response.text
        assert progress(route)[0]['completed_items'] == 2
    finally:
        if previous is not None:
            app.dependency_overrides[require_auth] = previous
        _account_cache.pop(FIXTURES.user_id, None)
        if account_id:
            db.table('account_users').delete().eq('account_id', account_id).eq('user_id', FIXTURES.user_id).execute()
            db.table('accounts').delete().eq('id', account_id).execute()
