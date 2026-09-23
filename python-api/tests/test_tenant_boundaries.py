"""Real disposable identities in two companies; no production data or auth override."""
import os
import secrets
import subprocess
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(os.environ.get('STOCKERAI_DB_TESTS') != '1',
                               reason='requires explicitly enabled disposable local database')


@pytest.fixture
def tenants(client):
    from supabase import create_client
    from app.main import app
    from app.services.auth import require_auth
    from app.services.database import get_client
    db = get_client()
    assert db.rpc('stockerai_disposable_marker').execute().data == 'stockerai-local-only-20260918'
    previous = app.dependency_overrides.pop(require_auth, None)
    accounts, users, routes, sessions, actors = [], [], [], [], []
    try:
        for index in range(2):
            accounts.append(db.table('accounts').insert({'name': f'DISPOSABLE_TENANT_{index}'}).execute().data[0]['id'])
        for index in range(3):
            uid, password = str(uuid4()), secrets.token_urlsafe(32)
            email = f'{uid}@example.invalid'
            db.auth.admin.create_user({'id': uid, 'email': email, 'password': password, 'email_confirm': True})
            users.append(uid)
            account = accounts[0 if index < 2 else 1]
            db.table('account_users').insert({'account_id': account, 'user_id': uid, 'role': 'driver'}).execute()
            rid = db.table('routes').insert({'user_id': uid, 'route_name': f'Tenant fixture {index}',
                'delivery_date': '2099-12-28', 'total_machines': 1, 'total_items': 3}).execute().data[0]['id']
            routes.append((rid, uid))
            mid = db.table('machines').insert({'route_id': rid, 'machine_name': f'Machine {index}',
                'machine_number': index + 1, 'location_name': 'Fixture', 'sequence': 1,
                'total_items': 3, 'completed_items': 1, 'status': 'in_progress'}).execute().data[0]['id']
            db.table('items').insert([{'machine_id': mid, 'product_name': f'Private product {index}-{n}',
                'quantity': 1, 'slot': str(n), 'sequence': n, 'status': 'pending'} for n in range(1, 4)]).execute()
            sid = db.table('sessions').insert({'user_id': uid, 'session_key': f'tenant_fixture_{uid}',
                'status': 'stocking', 'current_route_id': rid, 'current_machine_id': mid,
                'pick_direction': 'forward'}).execute().data[0]['id']
            sessions.append((sid, uid))
            auth = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
            login = auth.auth.sign_in_with_password({'email': email, 'password': password})
            actors.append({'uid': uid, 'account': account, 'route': rid, 'machine': mid, 'session': sid,
                           'headers': {'Authorization': f'Bearer {login.session.access_token}'}})
        yield db, actors, accounts
    finally:
        if previous is not None:
            app.dependency_overrides[require_auth] = previous
        for sid, uid in sessions:
            db.table('sessions').delete().eq('id', sid).eq('user_id', uid).execute()
        for rid, uid in routes:
            db.table('routes').delete().eq('id', rid).eq('user_id', uid).execute()
        for uid in users:
            db.table('account_users').delete().eq('user_id', uid).execute()
        for account in accounts:
            db.table('accounts').delete().eq('id', account).execute()
        for uid in users:
            db.auth.admin.delete_user(uid)


def test_status_uses_verified_identity_and_allows_separate_companies(client, tenants):
    _, actors, _ = tenants
    assert client.post('/api/get-current-status', json={}).status_code == 401
    for actor in actors:
        response = client.post('/api/get-current-status', headers=actor['headers'], json={'user_id': actors[2]['uid']})
        assert response.status_code == 200
        assert response.json()['route_name'] == f"Tenant fixture {actors.index(actor)}"
        assert response.json()['route_date'] == '2099-12-28'


def test_foreign_session_cannot_be_read_or_advanced(client, tenants):
    db, actors, _ = tenants
    a, _, other = actors
    context = client.post('/api/picking-context', json={'session_id': other['session']}, headers=other['headers']).json()
    assert client.post('/api/picking-context', json={'session_id': other['session']}, headers=a['headers']).status_code == 403
    body = {'session_id': other['session'], 'user_id': other['uid'], 'operation_id': str(uuid4()),
            'expected_revision': context['picking_revision'], 'expected_machine_id': other['machine'],
            'action': 'next', 'expected_state': {'completed_items': 1, 'status': 'in_progress', 'direction': 'forward'}}
    assert client.post('/api/picking-transition', json=body, headers=a['headers']).status_code == 403
    assert db.table('machines').select('completed_items').eq('id', other['machine']).execute().data[0]['completed_items'] == 1
    assert client.post('/api/picking-transition', json=body, headers=other['headers']).status_code == 200


def test_removed_membership_is_refused_on_next_request(client, tenants):
    db, actors, _ = tenants
    a = actors[0]
    assert client.post('/api/get-current-status', headers=a['headers']).status_code == 200
    db.table('account_users').delete().eq('user_id', a['uid']).eq('account_id', a['account']).execute()
    assert client.post('/api/get-current-status', headers=a['headers']).status_code == 403


def test_ambiguous_member_cannot_authenticate_or_share_routes(client, tenants):
    db, actors, accounts = tenants
    a, teammate, _ = actors
    db.table('account_users').insert({'user_id': a['uid'], 'account_id': accounts[1], 'role': 'driver'}).execute()
    assert client.post('/api/get-current-status', headers=a['headers']).status_code == 403
    # A teammate's existing session must not make an ambiguous owner's route accessible.
    db.table('sessions').update({'current_route_id': a['route'], 'current_machine_id': a['machine']}).eq('id', teammate['session']).execute()
    assert client.post('/api/get-current-status', headers=teammate['headers']).status_code == 403
    assert client.post('/api/picking-context', json={'session_id': teammate['session']}, headers=teammate['headers']).status_code == 403


@pytest.mark.parametrize('foreign_route', [True, False])
def test_status_refuses_cross_tenant_session_references(client, tenants, foreign_route):
    db, actors, _ = tenants
    a, _, other = actors
    patch = {'current_machine_id': other['machine']}
    if foreign_route:
        patch['current_route_id'] = other['route']
    db.table('sessions').update(patch).eq('id', a['session']).execute()
    assert client.post('/api/get-current-status', headers=a['headers']).status_code == 403


@pytest.mark.parametrize('role', ['anon', 'authenticated'])
@pytest.mark.parametrize('signature,args', [
    ('get_next_item_data(uuid)', 'NULL::uuid'),
    ('get_next_item_and_increment(uuid,integer)', 'NULL::uuid,1'),
    ('increment_machine_items(uuid,integer)', 'NULL::uuid,1'),
    ('get_next_item(text)', 'NULL::text'),
    ('get_routes_for_date(uuid,date)', 'NULL::uuid,NULL::date'),
    ('update_session_with_lock(uuid,integer,integer,uuid,text)', 'NULL::uuid,0,1,NULL::uuid,NULL::text'),
    ('resolve_picking_account(uuid)', 'NULL::uuid'),
])
def test_direct_browser_rpc_execution_denied(role, signature, args):
    command = ['docker', 'exec', 'supabase_db_stockerai-disposable', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    assert subprocess.check_output(command + ['-Atc', 'SELECT public.stockerai_disposable_marker()'], text=True).strip() == 'stockerai-local-only-20260918'
    name = signature.split('(')[0]
    result = subprocess.run(command + ['-c', f'BEGIN; SET LOCAL ROLE {role}; SELECT public.{name}({args}); ROLLBACK;'], capture_output=True, text=True)
    assert result.returncode != 0
    assert 'permission denied for function' in result.stderr
    grant = subprocess.check_output(command + ['-Atc', f"SELECT has_function_privilege('service_role','public.{signature}','EXECUTE')"], text=True).strip()
    assert grant == 't'
