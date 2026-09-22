"""Versioned route transitions against the marked disposable PostgreSQL database."""
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from tests.test_database_skip_recovery import FIXTURES, route
from tests.test_atomic_progress import local_sql

pytestmark = pytest.mark.skipif(os.environ.get('STOCKERAI_DB_TESTS') != '1',
                               reason='requires explicitly enabled disposable local database')


def context(client, route):
    response = client.post('/api/picking-context', json={'session_id': route[1], 'user_id': FIXTURES.user_id})
    assert response.status_code == 200, response.text
    return response.json()


def request(client, route, action='next', **changes):
    snap = context(client, route)
    machine = next(m for m in snap['machines'] if m['id']==snap['current_machine_id'])
    return {'session_id': route[1], 'user_id': FIXTURES.user_id, 'operation_id': str(uuid4()),
        'expected_revision': snap['picking_revision'], 'expected_machine_id': snap['current_machine_id'],
        'action': action, 'direction': snap['pick_direction'], 'count': 1,
        'expected_state': {'completed_items':machine['completedItems'], 'status':machine['status'], 'direction':snap['pick_direction']}, **changes}


def call(client, body):
    return client.post('/api/picking-transition', json=body)


def state(route):
    db, sid, mids = route
    return (db.table('machines').select('*').in_('id', mids).order('sequence').execute().data,
            db.table('sessions').select('*').eq('id', sid).execute().data)


def prepare(route, action):
    db, _, mids = route
    if action == 'start':
        db.table('machines').update({'status': 'pending', 'completed_items': 0}).eq('id', mids[0]).execute()
    if action == 'back':
        db.table('machines').update({'status': 'skipped'}).eq('id', mids[1]).execute()


@pytest.mark.parametrize('action', ['next', 'start', 'skip', 'back', 'reset'])
def test_every_transition_replays_exactly_and_rejects_changed_key(client, route, action):
    prepare(route, action)
    body = request(client, route, action)
    first = call(client, body)
    assert first.status_code == 200, first.text
    after = state(route)
    assert first.json()['picking_revision'] != body['expected_revision']
    assert call(client, body).json() == first.json()
    assert state(route) == after
    assert call(client, {**body, 'action': 'reset' if action != 'reset' else 'skip'}).status_code == 409


@pytest.mark.parametrize('action', ['next', 'start', 'skip', 'back', 'reset'])
def test_failure_at_receipt_rolls_back_all_writes_and_revision(client, route, action):
    prepare(route, action)
    body = request(client, route, action)
    before = state(route)
    local_sql(f"""CREATE FUNCTION public.test_fail_transition() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.session_id='{route[1]}'::uuid THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_transition BEFORE INSERT OR UPDATE ON public.picking_operations
      FOR EACH ROW EXECUTE FUNCTION public.test_fail_transition();""")
    try:
        response = call(client, body)
        assert response.status_code == 503, response.text
        assert 'injected' not in response.text
        assert state(route) == before
        assert context(client, route)['picking_revision'] == body['expected_revision']
    finally:
        local_sql('DROP TRIGGER test_fail_transition ON public.picking_operations; DROP FUNCTION public.test_fail_transition();')
    assert call(client, body).status_code == 200


@pytest.mark.parametrize('same_key', [False, True])
def test_concurrent_actions_serialize(client, route, same_key):
    body = request(client, route, 'skip')
    other = body if same_key else {**body, 'operation_id': str(uuid4()), 'action': 'next'}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda b: call(client, b), [body, other]))
    assert sorted(r.status_code for r in responses) == ([200, 200] if same_key else [200, 409])
    if same_key: assert responses[0].json() == responses[1].json()


def test_reset_invalidates_command_even_when_counts_return_to_same_values(client, route):
    prepare(route, 'start')
    stale = request(client, route, 'start')
    reset = call(client, request(client, route, 'reset'))
    assert reset.status_code == 200, reset.text
    assert state(route)[0][0]['completed_items'] == 0
    assert call(client, stale).status_code == 409
    assert call(client, request(client, route, 'start')).status_code == 200


@pytest.mark.parametrize('direction', ['forward','reverse'])
@pytest.mark.parametrize('count', [1,2])
def test_start_selects_correct_end_and_exact_number(client, route, direction, count):
    prepare(route, 'start')
    result = call(client, request(client, route, 'start', direction=direction, count=count))
    assert result.status_code == 200, result.text
    assert result.json()['item1']['product_name'] == ('Product 1' if direction=='forward' else 'Product 3')
    assert result.json()['new_completed_items'] == count
    assert ('item2' in result.json()) == (count==2)
    assert state(route)[1][0]['pick_direction'] == direction


def test_skip_back_start_and_finish_route(client, route):
    for action in ['skip', 'skip', 'back', 'start', 'next', 'next', 'back', 'start', 'next', 'next', 'next']:
        result = call(client, request(client, route, action))
        assert result.status_code == 200, (action, result.text)
    assert result.json()['action'] == 'complete'
    assert all(m['status']=='completed' for m in state(route)[0])
    assert state(route)[1][0]['status']=='completed'
    reset = call(client, request(client, route, 'reset'))
    assert reset.status_code == 200, reset.text
    assert all(m['status']=='pending' and m['completed_items']==0 and m['skipped_at_item'] is None for m in state(route)[0])


@pytest.mark.parametrize('change', ['session','machine','user','revision','paused'])
def test_wrong_or_stale_target_cannot_mutate(client, route, change):
    body = request(client, route, 'skip')
    expected = 409
    if change=='session': body['session_id']=str(uuid4()); expected=403
    if change=='user': body['user_id']=str(uuid4()); expected=403
    if change=='machine': body['expected_machine_id']=route[2][1]
    if change=='revision': body['expected_revision']=str(uuid4())
    if change=='paused': route[0].table('sessions').update({'status':'paused'}).eq('id',route[1]).execute()
    before = state(route)
    assert call(client, body).status_code == expected
    assert state(route)==before


def test_legacy_write_invalidates_new_request(client, route):
    body = request(client, route, 'skip')
    legacy = client.post('/api/start-machine', json={'session_id':route[1], 'user_id':FIXTURES.user_id,'direction':'beginning'})
    assert legacy.status_code==200, legacy.text
    assert call(client,body).status_code==409


def test_start_rejects_in_progress_and_missing_second_item(client, route):
    assert call(client,request(client,route,'start',direction='reverse')).status_code==409
    prepare(route,'start')
    route[0].table('items').delete().eq('machine_id',route[2][0]).eq('sequence',2).execute()
    body=request(client,route,'start',count=2)
    before=state(route)
    assert call(client,body).status_code==503
    assert state(route)==before


@pytest.mark.parametrize('count', [1,2])
def test_restarting_in_progress_does_not_advance_when_mode_changes(client,route,count):
    result=call(client,request(client,route,'start',count=count))
    assert result.status_code==200, result.text
    assert result.json()['new_completed_items']==1
    assert 'item2' not in result.json()


def test_final_presented_skip_remains_recoverable(client,route):
    db,_,mids=route
    db.table('machines').update({'completed_items':3,'status':'skipped'}).eq('id',mids[0]).execute()
    result=call(client,request(client,route,'start',count=2))
    assert result.status_code==200,result.text
    assert result.json()['new_completed_items']==3
    assert call(client,request(client,route,'next')).json()['action']=='next_machine'


def test_local_only_count_change_cannot_use_valid_revision(client,route):
    body=request(client,route)
    body['expected_state']['completed_items']=0
    before=state(route)
    assert call(client,body).status_code==409
    assert state(route)==before


def test_browser_roles_cannot_execute_new_functions():
    for signature in ['picking_context(uuid,uuid[],uuid)',
                      'transition_picking(uuid,uuid[],uuid,uuid,uuid,uuid,text,integer,text,jsonb)']:
        assert local_sql(f"SELECT has_function_privilege('anon','public.{signature}','EXECUTE'), has_function_privilege('authenticated','public.{signature}','EXECUTE');")=='f|f'


def test_reset_refuses_another_active_driver_and_team_nonowner(client,route):
    import secrets
    from app.routes.items import PickingTransitionRequest, picking_transition
    from app.services.auth import Caller
    from fastapi import HTTPException
    db,sid,mids=route
    teammate=str(uuid4())
    other_session=None
    db.auth.admin.create_user({'id':teammate,'email':f'{teammate}@example.invalid',
                              'password':secrets.token_urlsafe(32),'email_confirm':True})
    try:
        rid=db.table('sessions').select('current_route_id').eq('id',sid).execute().data[0]['current_route_id']
        other_session=db.table('sessions').insert({'user_id':teammate,'session_key':f'stocking_{rid}',
            'status':'stocking','current_route_id':rid,'current_machine_id':mids[0],'pick_direction':'forward'}).execute().data[0]['id']
        body=request(client,route,'reset')
        before=state(route)
        assert call(client,body).status_code==409
        assert state(route)==before
        # A teammate may pick the route, but may not reset the owner's work.
        forged=PickingTransitionRequest(**{**body,'session_id':other_session,'operation_id':str(uuid4())})
        with pytest.raises(HTTPException) as error:
            picking_transition(forged,Caller(user_id=teammate,account_id='team',team_user_ids=[teammate,FIXTURES.user_id]))
        assert error.value.status_code==403
        assert state(route)==before
    finally:
        if other_session: db.table('sessions').delete().eq('id',other_session).execute()
        db.auth.admin.delete_user(teammate)
