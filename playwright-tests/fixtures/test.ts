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

export interface FixtureFixtures {
  /** Shape of the seeded route. Override per test with `test.use({ routeShape: {...} })`. */
  routeShape: Pick<SeedOptions, 'machines' | 'itemsPerMachine' | 'deliveryDate' | 'driverName'>;
  fixtureRoute: SeededRoute;
}

export const test = base.extend<FixtureFixtures>({
  routeShape: [{ machines: 3, itemsPerMachine: 5 }, { option: true }],

  fixtureRoute: async ({ routeShape }, use, testInfo) => {
    const runId = `w${testInfo.workerIndex}-${randomUUID().slice(0, 8)}`;

    const seeded = await seedRoute({ ...routeShape, runId });
    testInfo.annotations.push({ type: 'fixture-route', description: seeded.routeName });

    try {
      await use(seeded);
    } finally {
      // Runs even when the test fails or times out — a stray route poisons the next run.
      await destroyRoute(seeded.routeId).catch((err) => {
        console.warn(`[fixture] could not clean up ${seeded.routeName}: ${err.message}`);
      });
    }
  },
});

export { expect };
