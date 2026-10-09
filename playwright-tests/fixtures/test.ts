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
  silentBrowserAudio: void;
  installedAppSimulation: void;
}

export const test = base.extend<FixtureFixtures>({
  installedAppSimulation: [async ({ context }, provide, testInfo) => {
    if (testInfo.project.name === 's24-installed-simulation') {
      await context.addInitScript(() => {
        const nativeMatchMedia = window.matchMedia.bind(window);
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          value: (query: string) => {
            const result = nativeMatchMedia(query);
            if (query !== '(display-mode: standalone)') return result;
            return new Proxy(result, {
              get(target, property) {
                if (property === 'matches') return true;
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          },
        });
      });
    }
    await provide();
  }, { auto: true }],
  silentBrowserAudio: [async ({ context }, provide) => {
    await context.addInitScript(() => {
      const silentSpeech = {
        speaking: false,
        pending: false,
        paused: false,
        onvoiceschanged: null,
        cancel() {},
        pause() {},
        resume() {},
        getVoices() { return []; },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
        speak(utterance: SpeechSynthesisUtterance) {
          utterance.dispatchEvent(new Event('start'));
          queueMicrotask(() => utterance.dispatchEvent(new Event('end')));
        },
      } as unknown as SpeechSynthesis;

      // Chromium's --mute-audio flag does not reliably silence the operating-system
      // speech synthesizer on every host. Replace it before application code starts so
      // every browser acceptance test is silent while preserving speech lifecycle events.
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: silentSpeech,
      });
    });
    await provide();
  }, { auto: true }],
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
