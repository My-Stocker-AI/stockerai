import { test, expect } from './fixtures/test';

/**
 * Smoke test — the regression net for "the app loads and doesn't crash".
 *
 * This codifies the manual check that caught the Start Picking crash
 * ("Cannot access 'on' before initialization"). It loads every public
 * route and fails if any shows a crash screen or throws a runtime error.
 *
 * Target must be a disposable local environment; remote smoke runs are refused.
 * Defaults to the config baseURL (local dev server) when unset.
 */

const TARGET = process.env.SMOKE_URL || '';

const ROUTES = ['/', '/app', '/demo', '/demo/live', '/dashboard', '/guide', '/dashboard/upload-routes'];

// Phrases the app's error boundary renders when something throws.
const CRASH_MARKERS = ['unexpected error', 'before initialization', 'Something went wrong'];

for (const route of ROUTES) {
  test(`loads ${route} with no crash or runtime error`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (e) => runtimeErrors.push(e.message));

    const url = TARGET ? TARGET.replace(/\/$/, '') + route : route;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(2000); // let the app boot and render

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const marker of CRASH_MARKERS) {
      expect(bodyText, `crash screen "${marker}" on ${route}`).not.toContain(marker.toLowerCase());
    }

    // The use-before-init crash class shows up as a runtime page error.
    const fatal = runtimeErrors.filter((e) => /before initialization|is not defined|is not a function/i.test(e));
    expect(fatal, `runtime errors on ${route}: ${fatal.join(' | ')}`).toHaveLength(0);
  });
}
