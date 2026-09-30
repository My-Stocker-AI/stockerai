"""Read-only recovery must use the committed window, never count parity/preferences."""
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from app.routes.items import ResumeStateRequest, resume_state
from app.services.auth import Caller


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, {}
    def select(self, *_): return self
    def eq(self, key, value):
        self.filters[key] = value
        return self
    def order(self, *_, **__): return self
    def limit(self, *_): return self
    def execute(self):
        self.db.reads.append((self.table, self.filters))
        rows = self.db.rows[self.table]
        def matches(row):
            for key, value in self.filters.items():
                actual = row['result'].get('picking_revision') if key == 'result->>picking_revision' else row.get(key)
                if actual != value: return False
            return True
        return SimpleNamespace(data=deepcopy([r for r in rows if matches(r)]))


class Database:
    def table(self, name): return Query(self, name)


def fixture(direction='forward', width=2, presented=4, total=5, requested=2, action='next'):
    db = Database()
    db.reads = []
    guard = dict(session_id='s', route_id='r', current_machine_id='m',
                 pick_direction=direction, status='stocking', picking_revision='rev', machines=[])
    positions = list(range(1, total + 1))
    if direction == 'reverse': positions.reverse()
    window = positions[presented-width:presented]
    result = dict(action='undo_item' if action == 'undo' else 'next_item', session_id='s', machine_id='m', picking_revision='rev',
                  new_completed_items=presented, total_items=total, items_remaining=total-presented)
    for index, number in enumerate(window):
        suffix = '2' if index else ''
        result.update({f'product_name{suffix}': f'Product {number}', f'quantity{suffix}': number,
                       f'slot{suffix}': None})
    db.rows = {
        'sessions': [dict(id='s', user_id='caller', status='stocking', current_route_id='r', current_machine_id='m')],
        'routes': [dict(id='r', route_name='Fixture', delivery_date='2099-01-01', total_items=total)],
        'machines': [dict(id='m', route_id='r', machine_name='Fixture', location_name='Test', sequence=1,
                         total_items=total, completed_items=presented, status='in_progress')],
        'items': [dict(machine_id='m', sequence=n, product_name=f'Product {n}', quantity=n, slot=None) for n in positions],
        'picking_operations': [dict(user_id='caller', session_id='s', result=result,
            request=dict(protocol=3, session='s', action=action, direction=direction, count=requested))],
    }
    return db, guard, window


def load(db, guard, final=None, version=1):
    with patch('app.routes.items.get_client', return_value=db), patch('app.routes.items._picking_rpc',
            side_effect=[guard, guard if final is None else final]) as rpc:
        value = resume_state(ResumeStateRequest(user_id='forged', resume_window_version=version), Caller('caller', 'account', ['caller']))
    assert all(call.args[0] == 'picking_context' for call in rpc.call_args_list)
    assert rpc.call_args.args[1]['p_user_id'] == 'caller'
    return value


@pytest.mark.parametrize('direction', ['forward', 'reverse'])
@pytest.mark.parametrize('width,presented,requested', [(2,2,2),(2,4,2),(1,5,2),(1,3,1),(2,3,2)])
def test_restores_exact_unconfirmed_window_read_only(direction, width, presented, requested):
    db, guard, window = fixture(direction, width, presented, requested=requested)
    before = deepcopy(db.rows)
    snap = load(db, guard)
    assert [it['product_name'] for it in [snap['current_item'], snap['current_item2']] if it] == [f'Product {n}' for n in window]
    assert len(snap['completed_list']) == snap['confirmed_items'] == presented-width
    assert not set(window) & {it['quantity'] for it in snap['completed_list']}
    assert snap['items_remaining'] == 5-presented
    assert snap['picking_revision'] == 'rev'
    assert load(db, guard) == snap
    assert db.rows == before
    assert ('picking_operations', {'user_id':'caller', 'session_id':'s', 'result->>picking_revision':'rev'}) in db.reads


@pytest.mark.parametrize('damage', ['missing','old_revision','other_user','other_session','count','direction','machine','action','duplicate','missing_done','concurrent'])
def test_unprovable_or_changed_window_refused_without_mutation(damage):
    db, guard, _ = fixture()
    receipt = db.rows['picking_operations'][0]
    final = None
    if damage == 'missing': db.rows['picking_operations'] = []
    elif damage == 'old_revision': receipt['result']['picking_revision'] = 'old'
    elif damage == 'other_user': receipt['user_id'] = 'someone-else'
    elif damage == 'other_session': receipt['session_id'] = 'another-session'
    elif damage == 'count': receipt['result']['new_completed_items'] = 3
    elif damage == 'direction': receipt['request']['direction'] = 'reverse'
    elif damage == 'machine': receipt['result']['machine_id'] = 'other'
    elif damage == 'action': receipt['result']['action'] = 'next_machine'
    elif damage == 'duplicate': db.rows['picking_operations'].append(deepcopy(receipt))
    elif damage == 'missing_done': db.rows['items'] = []
    elif damage == 'concurrent': final = {**guard, 'picking_revision':'new-revision'}
    before = deepcopy(db.rows)
    with pytest.raises(HTTPException) as error: load(db, guard, final)
    assert error.value.status_code == 409
    assert db.rows == before


def test_unstarted_machine_has_no_confirmed_items_and_requests_direction():
    db, guard, _ = fixture()
    db.rows['machines'][0].update(status='pending', completed_items=0)
    db.rows['picking_operations'] = []
    snap = load(db, guard)
    assert snap['current_item'] is snap['current_item2'] is None
    assert snap['confirmed_items'] == 0 and snap['awaiting_direction']


def test_old_client_cannot_silently_drop_half_of_restored_pair():
    db, guard, _ = fixture()
    before = deepcopy(db.rows)
    with pytest.raises(HTTPException) as error: load(db, guard, version=None)
    assert error.value.status_code == 409
    assert 'Update and reopen' in error.value.detail
    assert db.rows == before
    db, guard, _ = fixture(width=1, presented=3, requested=1)
    assert load(db, guard, version=None)['current_item2'] is None


@pytest.mark.parametrize('direction', ['forward', 'reverse'])
def test_restores_durable_undo_receipt(direction):
    db, guard, window = fixture(direction=direction, width=1, presented=2, requested=1, action='undo')
    snap = load(db, guard)
    assert snap['current_item']['product_name'] == f'Product {window[0]}'
    assert snap['current_item2'] is None
    assert snap['confirmed_items'] == 1
