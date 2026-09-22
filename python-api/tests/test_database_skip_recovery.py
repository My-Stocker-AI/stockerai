"""Real local Supabase: handoff, deferral, resume and completion with captured RPCs."""
import os

import pytest
from tests.test_safety import FixtureRoutes

pytestmark = pytest.mark.skipif(os.environ.get('STOCKERAI_DB_TESTS') != '1',
                               reason='requires explicitly enabled disposable local database')
FIXTURES = FixtureRoutes()


@pytest.fixture
def route():
    from app.services.database import get_client
    db = get_client()
    rid = db.table('routes').insert({
        'user_id': FIXTURES.user_id, 'route_name': 'SKIP_RECOVERY_TEST',
        'delivery_date': '2099-12-28', 'total_machines': 2, 'total_items': 6,
    }).execute().data[0]['id']
    FIXTURES.record(rid)
    mids = []
    for index in range(2):
        mid = db.table('machines').insert({
            'route_id': rid, 'machine_name': f'Fixture {index}', 'machine_number': index + 1,
            'location_name': 'Test', 'sequence': index + 1, 'total_items': 3,
            'completed_items': 1 if index == 0 else 0,
            'status': 'in_progress' if index == 0 else 'pending',
        }).execute().data[0]['id']
        mids.append(mid)
        db.table('items').insert([{
            'machine_id': mid, 'product_name': f'Product {number}', 'quantity': 1,
            'slot': str(number), 'sequence': number, 'status': 'pending',
        } for number in range(1, 4)]).execute()
    sid = db.table('sessions').insert({
        'user_id': FIXTURES.user_id, 'session_key': f'stocking_{rid}', 'status': 'stocking',
        'current_route_id': rid, 'current_machine_id': mids[0], 'pick_direction': 'forward',
    }).execute().data[0]['id']
    return db, sid, mids


@pytest.mark.parametrize('count', [1, 2])
def test_full_skip_return_defer_resume_finish(client, route, count):
    db, sid, mids = route

    def call(path, **extra):
        response = client.post('/api/' + path, json={
            'session_id': sid, 'user_id': FIXTURES.user_id, **extra,
        })
        assert response.status_code == 200, response.text
        return response.json()

    def machine(mid):
        return db.table('machines').select('*').eq('id', mid).execute().data[0]

    assert call('skip-machine', expected_machine_id=mids[0])['next_machine_id'] == mids[1]
    assert machine(mids[0])['skipped_at_item'] == 1  # Real trigger, not a stub.
    call('start-machine', direction='beginning', count=count)
    for _ in range(4):
        result = call('get-next-item', count=count)
        if result['action'] == 'next_machine':
            break
    assert result['returning_to_skipped'] is True
    assert result['next_machine_id'] == mids[0]
    assert machine(mids[1])['status'] == 'completed'
    before = machine(mids[0])
    for _ in range(3):
        assert call('skip-machine', expected_machine_id=mids[0])['action'] == 'offer_go_back'
    assert machine(mids[0]) == before
    call('go-back-to-skipped')
    resumed = call('start-machine', direction='beginning', count=count)
    assert resumed['new_item_index'] == 2
    for _ in range(4):
        result = call('get-next-item', count=count)
        if result['action'] == 'complete':
            break
    assert result['action'] == 'complete'
    assert all(machine(mid)['status'] == 'completed' for mid in mids)
    assert db.table('sessions').select('status').eq('id', sid).execute().data[0]['status'] == 'completed'


def test_stale_skip_does_not_change_the_next_machine(client, route):
    db, sid, mids = route
    body = {'session_id': sid, 'user_id': FIXTURES.user_id, 'expected_machine_id': mids[0]}
    assert client.post('/api/skip-machine', json=body).status_code == 200
    assert client.post('/api/skip-machine', json=body).status_code == 409
    other = db.table('machines').select('status,completed_items').eq('id', mids[1]).execute().data[0]
    assert other == {'status': 'pending', 'completed_items': 0}
