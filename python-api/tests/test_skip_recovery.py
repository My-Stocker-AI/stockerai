"""HTTP workflow regressions with an in-memory store; no database/network access.

This models query filtering and writes, not PostgreSQL triggers or transactions.
"""
from copy import deepcopy
from types import SimpleNamespace

import pytest

USER = "00000000-0000-0000-0000-00000000c001"


class Query:
    def __init__(self, db, table):
        self.db, self.name = db, table
        self.predicates, self.values = [], None
        self.sort, self.cap = None, None

    def select(self, *_args): return self
    def eq(self, key, value):
        self.predicates.append(lambda row: row.get(key) == value)
        return self
    def neq(self, key, value):
        self.predicates.append(lambda row: row.get(key) != value)
        return self
    def gt(self, key, value):
        self.predicates.append(lambda row: row[key] > value)
        return self
    def filter(self, key, op, value):
        assert op == "not.in"
        excluded = value.strip('()').replace('"', '').split(',')
        self.predicates.append(lambda row: row[key] not in excluded)
        return self
    def order(self, key, desc=False):
        self.sort = (key, desc)
        return self
    def limit(self, count):
        self.cap = count
        return self
    def update(self, values):
        self.values = values
        return self
    def execute(self):
        rows = [r for r in self.db.rows[self.name] if all(p(r) for p in self.predicates)]
        if self.sort:
            key, desc = self.sort
            rows.sort(key=lambda r: r.get(key, 0), reverse=desc)
        if self.cap is not None:
            rows = rows[:self.cap]
        if self.values is not None:
            for row in rows:
                self.db.writes.append((self.name, row['id'], deepcopy(self.values)))
                row.update(self.values)
        return SimpleNamespace(data=deepcopy(rows))


class Store:
    def __init__(self, statuses, current=0):
        self.writes = []
        self.rows = {
            "sessions": [{"id": "session", "user_id": USER, "status": "stocking",
                          "current_machine_id": f"m{current}", "current_route_id": "route"}],
            "machines": [dict(id=f"m{i}", route_id="route", machine_name=f"Machine {i}",
                              location_name="Test", machine_number=i, sequence=i,
                              status=status, total_items=5, completed_items=2,
                              skipped_at_item=2 if status == "skipped" else None,
                              routes={"user_id": USER}) for i, status in enumerate(statuses)],
            "items": [],
        }
    def table(self, name): return Query(self, name)


@pytest.fixture
def setup(monkeypatch):
    def build(statuses, current=0):
        db = Store(statuses, current)
        monkeypatch.setattr("app.routes.machines.get_client", lambda: db)
        return db
    return build


def skip(client, **extra):
    return client.post('/api/skip-machine', json={"session_id": "session", **extra})


def test_returned_skipped_machine_can_be_deferred_without_error(client, setup):
    db = setup(['skipped', 'completed'])
    before = deepcopy(db.rows)
    for _ in range(3):
        response = skip(client)
        assert response.status_code == 200
        assert response.json()['action'] == 'offer_go_back'
        assert response.json()['remaining_skipped'] == 1
    assert db.rows == before
    assert db.writes == []


def test_skipping_when_only_skips_remain_does_not_ping_pong(client, setup):
    db = setup(['skipped', 'in_progress', 'skipped'], current=1)
    response = skip(client)
    assert response.status_code == 200
    assert response.json()['action'] == 'offer_go_back'
    assert response.json()['remaining_skipped'] == 3
    assert db.rows['sessions'][0]['current_machine_id'] == 'm1'
    assert db.rows['sessions'][0]['status'] == 'stocking'
    assert all(m['completed_items'] == 2 for m in db.rows['machines'])


@pytest.mark.parametrize('statuses,current,target', [
    (['in_progress', 'completed', 'pending'], 0, 'm2'),
    (['pending', 'completed', 'skipped'], 2, 'm0'),
    (['skipped', 'pending'], 0, 'm1'),
])
def test_skip_finds_unfinished_work_even_before_current_position(client, setup, statuses, current, target):
    db = setup(statuses, current)
    response = skip(client)
    assert response.status_code == 200
    assert response.json()['action'] == 'next_machine'
    assert response.json()['next_machine_id'] == target
    assert db.rows['sessions'][0]['current_machine_id'] == target


def test_repeated_request_cannot_skip_the_next_machine(client, setup):
    db = setup(['in_progress', 'pending', 'pending'])
    assert skip(client, expected_machine_id='m0').status_code == 200
    before = deepcopy(db.rows)
    assert skip(client, expected_machine_id='m0').status_code == 409
    assert db.rows == before


def test_completed_machine_is_never_reopened(client, setup):
    db = setup(['completed'])
    assert skip(client).status_code == 400
    assert db.writes == []


def test_offer_can_return_to_skipped_without_losing_progress(client, setup):
    db = setup(['skipped', 'completed'])
    assert skip(client).status_code == 200
    response = client.post('/api/go-back-to-skipped', json={"session_id": "session"})
    assert response.status_code == 200
    assert response.json()['action'] == 'machine_ready'
    assert response.json()['completed_items'] == 2
    assert db.rows['machines'][0]['status'] == 'pending'
    assert db.rows['machines'][0]['skipped_at_item'] == 2


def test_completion_handoff_then_skip_uses_the_returned_machine(client, setup, monkeypatch):
    db = setup(['skipped', 'in_progress'], current=1)
    monkeypatch.setattr('app.routes.items.get_client', lambda: db)
    # The RPC itself is outside this in-memory test. Its documented handoff
    # response drives the real HTTP formatter/session writes and following skip.
    monkeypatch.setattr('app.routes.items.rpc', lambda *_args: [{
        'action': 'next_machine', 'machine_complete': True, 'session_record_id': 'session',
        'new_machine_id': 'm0', 'next_machine_id': 'm0', 'next_machine': 'Machine 0',
        'next_location': 'Test', 'completed_machine': 'Machine 1', 'returning_to_skipped': True,
    }])
    response = client.post('/api/get-next-item', json={'session_id': 'session'})
    assert response.status_code == 200
    assert response.json()['returning_to_skipped'] is True
    assert db.rows['machines'][1]['status'] == 'completed'
    response = skip(client, expected_machine_id='m0')
    assert response.status_code == 200
    assert response.json()['action'] == 'offer_go_back'
    assert db.rows['machines'][0]['completed_items'] == 2
    assert db.rows['machines'][0]['skipped_at_item'] == 2


def test_account_boundary_still_applies_to_skipped_machine(client, setup):
    db = setup(['skipped'])
    db.rows['machines'][0]['routes']['user_id'] = 'other-account'
    response = skip(client)
    assert response.status_code == 403
    assert db.writes == []


@pytest.mark.parametrize('count', [1, 2])
def test_defer_then_resume_preserves_saved_position_in_both_pick_modes(client, setup, monkeypatch, count):
    db = setup(['skipped', 'completed'])
    db.rows['sessions'][0]['pick_direction'] = 'forward'
    db.rows['items'] = [dict(id=f'i{i}', machine_id='m0', sequence=i, product_name=f'Product {i}',
                             quantity=1, slot=str(i)) for i in range(1, 6)]
    monkeypatch.setattr('app.routes.items.get_client', lambda: db)
    assert skip(client).status_code == 200
    assert client.post('/api/go-back-to-skipped', json={'session_id': 'session'}).status_code == 200
    response = client.post('/api/start-machine', json={'session_id': 'session', 'direction': 'beginning', 'count': count})
    assert response.status_code == 200
    assert response.json()['new_item_index'] == 3
    assert response.json()['new_completed_items'] == 2 + count
    assert db.rows['machines'][0]['status'] == 'in_progress'
    assert db.rows['machines'][0]['skipped_at_item'] is None
    assert db.rows['machines'][1]['status'] == 'completed'
