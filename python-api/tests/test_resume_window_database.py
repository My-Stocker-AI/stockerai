"""Real disposable DB: cold recovery after every committed transition/ lost reply."""
import os
import pytest
from tests.test_picking_transitions import request, call, state, prepare, context
from tests.test_database_skip_recovery import FIXTURES, route

pytestmark = pytest.mark.skipif(os.environ.get('STOCKERAI_DB_TESTS') != '1',
                               reason='requires explicitly enabled disposable local database')


@pytest.fixture(autouse=True)
def resume_identity(monkeypatch):
    # The shared HTTP auth stand-in defaults to a different test identity unless
    # explicitly set; recovery carries no caller-selected identity in its body.
    monkeypatch.setenv('TEST_USER_ID', FIXTURES.user_id)


@pytest.mark.parametrize('direction', ['forward', 'reverse'])
@pytest.mark.parametrize('counts', [(1,), (2,), (1,2), (2,1)])
def test_recover_every_window_and_finish_two_machines(client, route, direction, counts):
    prepare(route, 'start')
    observed = []
    turn = 0
    for machine_index, machine_id in enumerate(route[2]):
        body = request(client, route, 'start', direction=direction, count=counts[turn % len(counts)])
        confirmed = 0
        while True:
            reply = call(client, body)
            assert reply.status_code == 200, reply.text
            response = reply.json()
            # Treat the reply as lost to the browser. The only recovery input is
            # authenticated identity, with no local cache or pick-mode preference.
            persisted = state(route)
            resumed = client.post('/api/resume-state', json={'resume_window_version': 1})
            assert resumed.status_code == 200, resumed.text
            snap = resumed.json()
            assert state(route) == persisted
            if response['action'] in ('next_machine', 'complete', 'route_complete'):
                if machine_index == 0:
                    assert snap['awaiting_direction'] and snap['current_item'] is None
                    assert snap['current_item2'] is None
                    assert snap['current_machine']['id'] == route[2][1]
                else:
                    assert snap == {'has_session': False}
                break
            window = [item for item in (snap['current_item'], snap['current_item2']) if item]
            assert window == [item for item in (response['item1'], response.get('item2')) if item]
            assert snap['confirmed_items'] == confirmed
            assert len(snap['completed_list']) == confirmed
            assert snap['picking_revision'] == response['picking_revision']
            assert snap['current_machine']['id'] == machine_id
            assert snap['pick_direction'] == direction
            assert client.post('/api/resume-state', json={'resume_window_version': 1}).json() == snap
            # Replay the lost operation: same receipt, no extra increment.
            assert call(client, body).json() == response
            assert state(route) == persisted
            observed.extend((machine_id, item['product_name']) for item in window)
            confirmed += len(window)
            turn += 1
            body = request(client, route, count=counts[turn % len(counts)])
            assert body['expected_revision'] == snap['picking_revision']
    expected = [f'Product {n}' for n in ([1,2,3] if direction == 'forward' else [3,2,1])]
    assert observed == [(mid, name) for mid in route[2] for name in expected]
    assert all(m['status'] == 'completed' and m['completed_items'] == 3 for m in state(route)[0])


def test_untracked_write_invalidates_recovery_instead_of_guessing_pair(client, route):
    prepare(route, 'start')
    assert call(client, request(client, route, 'start', count=2)).status_code == 200
    db, sid, mids = route
    # Legacy/simultaneous writer changes revision, even with identical counts.
    db.table('machines').update({'completed_items': 2}).eq('id', mids[0]).execute()
    before = state(route)
    assert client.post('/api/resume-state', json={'resume_window_version': 1}).status_code == 409
    assert state(route) == before
