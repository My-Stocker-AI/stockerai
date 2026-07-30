import { describe, it, expect } from 'vitest';
import {
  buildRoutePlan,
  isFixtureRouteName,
  FIXTURE_ROUTE_PREFIX,
  FIXTURE_SPOKEN_HANDLE,
  QUANTITY_CYCLE,
} from './routePlan';

/**
 * These guard the thing the fixture exists for: a known starting point.
 *
 * If the plan is not reproducible, not self-consistent, or not namespaced, then the browser
 * tests built on top of it are back to guessing — which is the state this replaced.
 */

const BASE = {
  runId: 'w0-abc123',
  userId: 'bdc96b72-3f35-4cae-9e79-99473eb4a23b',
  deliveryDate: '2026-07-30',
};

describe('reproducibility — the whole point', () => {
  it('produces byte-identical plans for identical inputs', () => {
    expect(JSON.stringify(buildRoutePlan(BASE))).toBe(JSON.stringify(buildRoutePlan(BASE)));
  });

  it('reads no clock — a plan built for a past date stays that date', () => {
    expect(buildRoutePlan({ ...BASE, deliveryDate: '2020-01-01' }).route.delivery_date).toBe(
      '2020-01-01',
    );
  });
});

describe('self-consistency — the counts the app reads must match the rows that exist', () => {
  it('route totals equal the rows actually planned', () => {
    const plan = buildRoutePlan({ ...BASE, machines: 4, itemsPerMachine: 6 });

    expect(plan.route.total_machines).toBe(plan.machines.length);
    expect(plan.route.total_items).toBe(plan.items.length);
    expect(plan.route.total_items).toBe(24);
  });

  it('every machine claims exactly the item count it was given', () => {
    const plan = buildRoutePlan({ ...BASE, machines: 3, itemsPerMachine: 5 });

    for (const machine of plan.machines) {
      const actual = plan.items.filter((i) => i.machineSequence === machine.sequence).length;
      expect(actual).toBe(machine.total_items);
    }
  });

  it('starts every machine and item unpicked — nothing is half-done at the start line', () => {
    const plan = buildRoutePlan(BASE);

    expect(plan.machines.every((m) => m.status === 'pending' && m.completed_items === 0)).toBe(true);
    expect(plan.items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('numbers machines and items from 1 with no gaps', () => {
    const plan = buildRoutePlan({ ...BASE, machines: 3, itemsPerMachine: 5 });

    expect(plan.machines.map((m) => m.sequence)).toEqual([1, 2, 3]);
    const firstMachineItems = plan.items.filter((i) => i.machineSequence === 1);
    expect(firstMachineItems.map((i) => i.sequence)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('namespacing — a run can never read or delete another run’s data', () => {
  it('stamps the run id into the route name', () => {
    expect(buildRoutePlan(BASE).routeName).toBe(`${FIXTURE_ROUTE_PREFIX} w0-abc123`);
  });

  it('two runs never share a route name', () => {
    const a = buildRoutePlan({ ...BASE, runId: 'w0-aaa' });
    const b = buildRoutePlan({ ...BASE, runId: 'w0-bbb' });
    expect(a.routeName).not.toBe(b.routeName);
  });

  it('recognizes its own routes and refuses to claim anyone else’s', () => {
    expect(isFixtureRouteName(buildRoutePlan(BASE).routeName)).toBe(true);

    // The names that must survive a cleanup sweep.
    for (const real of [
      'North Route 7/12',
      'South Route',
      'E2E Test Route', // the old hand-run SQL script's name — not ours to delete
      FIXTURE_ROUTE_PREFIX, // the bare prefix with no run id is not a fixture route
      '',
      null,
      undefined,
    ]) {
      expect(isFixtureRouteName(real as string)).toBe(false);
    }
  });
});

describe('the spoken handle — what a test says out loud to start this route', () => {
  it('is findable by the backend’s loose name match, whatever the run id', () => {
    // machines.py:301 — `req.route_name.lower() in r["route_name"].lower()`. Replicated here so
    // that if the route name ever stops containing the handle, this fails instead of the whole
    // browser suite failing with "Route 'Fixture' not found".
    for (const runId of ['w0-abc123', 'w3-ffffffff', 'verify-live']) {
      const name = buildRoutePlan({ ...BASE, runId }).routeName;
      expect(name.toLowerCase()).toContain(FIXTURE_SPOKEN_HANDLE.toLowerCase());
    }
  });

  it('does not match Davy’s or Russ’s real route names', () => {
    // If the handle ever became something like "route", a test would start a real route and
    // rewrite live pick history. These are the real names in the database.
    for (const realName of ['North', 'South']) {
      expect(realName.toLowerCase()).not.toContain(FIXTURE_SPOKEN_HANDLE.toLowerCase());
    }
  });
});

describe('assertable content — a test must be able to name what it expects to hear', () => {
  it('gives every item a distinct name and a slot', () => {
    const plan = buildRoutePlan({ ...BASE, machines: 3, itemsPerMachine: 5 });

    expect(new Set(plan.items.map((i) => i.product_name)).size).toBe(plan.items.length);
    expect(plan.items.every((i) => /^A\d+$/.test(i.slot))).toBe(true);
  });

  it('varies quantities so consecutive items sound different when spoken', () => {
    const plan = buildRoutePlan({ ...BASE, machines: 1, itemsPerMachine: 5 });
    expect(plan.items.map((i) => i.quantity)).toEqual(QUANTITY_CYCLE);
  });

  it('names the machine on the item row, matching how the app reads it back', () => {
    const plan = buildRoutePlan({ ...BASE, machines: 2, itemsPerMachine: 2 });
    for (const item of plan.items) {
      const machine = plan.machines.find((m) => m.sequence === item.machineSequence)!;
      expect(item.machine_name).toBe(machine.machine_name);
    }
  });
});

describe('refuses a plan that could not produce a clean start', () => {
  it.each([
    [{ runId: '' }, /runId is required/],
    [{ runId: '   ' }, /runId is required/],
    [{ userId: '' }, /userId is required/],
    [{ deliveryDate: '7/30/2026' }, /YYYY-MM-DD/],
    [{ deliveryDate: 'today' }, /YYYY-MM-DD/],
    [{ machines: 0 }, /at least one machine/],
    [{ itemsPerMachine: 0 }, /at least one item/],
  ])('rejects %j', (bad, message) => {
    expect(() => buildRoutePlan({ ...BASE, ...(bad as object) })).toThrow(message as RegExp);
  });
});
