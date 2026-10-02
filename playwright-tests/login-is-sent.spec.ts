/**
 * DOES THE REAL APP, IN A REAL BROWSER, ACTUALLY SEND THE DRIVER'S LOGIN?
 *
 * Everything else proves half the chain. The server tests prove the server refuses callers
 * without a login. The unit tests prove the helper attaches one. Neither proves the part in
 * between: a browser reading the stored login, putting it on the request, and the server
 * accepting it. That middle link is where this breaks if it breaks, and it is the link a
 * driver depends on.
 *
 * So this drives the actual app. It signs in the way signing in really works, opens the
 * picking screen, and watches the traffic leave.
 *
 * The API calls are pointed at a local server rather than production, so the test proves the
 * gate works without needing a deploy first.
 *
 *   Requires a gated API running locally:
 *     cd python-api && uvicorn app.main:app --port 8099
 *   then: npx playwright test login-is-sent
 */

import { test, expect } from './fixtures/test';
import {
  LOCAL_API,
  beSignedIn,
  disposableTestEmail,
  gatedServerIsUp,
  routeApiToLocal,
  signInDisposableUser,
  type SeenApiCall,
} from './fixtures/browserSession';

const TEST_EMAIL = disposableTestEmail();

test.describe('the app sends its login to the server', () => {
  // These drive the real app against a real gated server. Without one they would fail
  // looking like an app fault, so they say plainly what is missing instead. The gate in
  // tests/gates starts its own server, so the real check is never quietly skipped there.
  test.beforeEach(async () => {
    test.skip(
      !(await gatedServerIsUp()),
      `no gated server at ${LOCAL_API} — run: python3 -m pytest tests/gates -k login`,
    );
  });
  test('opening the picking screen sends a login the server accepts', async ({ page }) => {
    const session = await signInDisposableUser(TEST_EMAIL);
    await beSignedIn(page, session);

    const seen: SeenApiCall[] = [];
    await routeApiToLocal(page, seen);

    await page.goto('/app?resume=1');
    await expect
      .poll(() => seen.length, {
        message: 'the app made no server call at all — this test would otherwise prove nothing',
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    for (const call of seen) {
      expect(call.authorization, `${call.url} went out with no login attached`).toMatch(/^Bearer \S+/);
      expect(call.status, `${call.url} was refused by the server`).not.toBe(401);
    }

    // Stop watching before the page closes, so a call still in flight cannot fail a run whose
    // checks have already passed.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('a stale login is renewed mid-route, so the driver never sees the error', async ({ page }) => {
    // The real thing that happens after an hour on a route: the stored login no longer works,
    // but the renewal ticket alongside it still does. The app should quietly swap one for the
    // other and carry on. Here the login is spoiled deliberately to force exactly that moment.
    const session = await signInDisposableUser(TEST_EMAIL);
    await beSignedIn(page, { ...session, access_token: 'spoiled.not.valid' });

    const seen: SeenApiCall[] = [];
    await routeApiToLocal(page, seen);

    await page.goto('/app?resume=1');
    await expect
      .poll(() => seen.some((c) => c.status === 200), {
        message: 'the app never recovered — a driver here would just get an error',
        timeout: 30_000,
      })
      .toBe(true);

    const refused = seen.filter((c) => c.status === 401);
    const accepted = seen.filter((c) => c.status === 200);
    expect(accepted.length, 'nothing succeeded after the renewal').toBeGreaterThan(0);
    // The spoiled login must actually have been rejected first — otherwise the renewal was
    // never exercised and this test is just the happy path wearing a disguise.
    expect(refused.length, 'the spoiled login was never refused, so no renewal happened').toBeGreaterThan(0);
    expect(accepted[accepted.length - 1].authorization).not.toContain('spoiled');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});
