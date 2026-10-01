/**
 * THE TEST FIXTURE — a browser test asks for `fixtureRoute` and gets a known starting point.
 *
 * Use it instead of importing from '@playwright/test' directly:
 *
 *   import { test, expect } from './fixtures/test';
 *
 *   test('announces the first item', async ({ page, fixtureRoute }) => {
 *     const firstItem = fixtureRoute.itemsForMachine(1)[0];
 *     ...
 *   });
 *
 * The route is created before the test body runs and deleted after it, pass or fail. Tests that
 * don't name `fixtureRoute` cost nothing — Playwright only builds fixtures a test asks for.
 */

import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { seedRoute, destroyRoute, type SeededRoute, type SeedOptions } from './seedRoute';
import { requireLocalTarget } from './testSafety';

type RouteShape = {
  machines?: SeedOptions['machines'];
  itemsPerMachine?: SeedOptions['itemsPerMachine'];
  deliveryDate?: SeedOptions['deliveryDate'];
  driverName?: SeedOptions['driverName'];
};

export interface FixtureFixtures {
  /** Shape of the seeded route. Override per test with `test.use({ routeShape: {...} })`. */
  routeShape: RouteShape;
  fixtureRoute: SeededRoute;
  localNetwork: void;
}

export const test = base.extend<FixtureFixtures>({
  localNetwork: [async ({ context }, provide) => {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      try { requireLocalTarget(url.origin); }
      catch { await route.abort('blockedbyclient'); return; }
      await route.continue();
    });
    await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      try { requireLocalTarget(url.origin.replace(/^ws/, 'http')); }
      catch { socket.close(); return; }
      socket.connectToServer();
    });
    await provide();
  }, { auto: true }],
  routeShape: [{ machines: 3, itemsPerMachine: 5 }, { option: true }],

  fixtureRoute: async ({ routeShape }, provide, testInfo) => {
    const runId = `w${testInfo.workerIndex}-${randomUUID().slice(0, 8)}`;

    const seeded = await seedRoute({ ...routeShape, runId });
    testInfo.annotations.push({ type: 'fixture-route', description: seeded.routeName });

    try {
      await provide(seeded);
    } finally {
      // Runs even when the test fails or times out — a stray route poisons the next run.
      await destroyRoute(seeded.routeId);
    }
  },
});

export { expect };
