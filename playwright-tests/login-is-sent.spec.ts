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
import type { Page } from '@playwright/test';
import { requireLocalTarget, testDatabase } from './fixtures/testSafety';

const LIVE_API = 'https://stockerai-api.onrender.com';
const LOCAL_API = requireLocalTarget(process.env.STOCKER_TEST_API);
const APP_ORIGIN = 'http://localhost:8080';

const { url: SUPABASE_URL, key: SERVICE_KEY } = testDatabase();
const ANON_KEY = process.env.STOCKERAI_TEST_ANON_KEY!;
const TEST_EMAIL = process.env.STOCKERAI_TEST_EMAIL;
if (!TEST_EMAIL?.endsWith('@example.invalid')) throw new Error('Disposable test email ending @example.invalid required');
const PROJECT_REF = SUPABASE_URL.split('//')[1].split('.')[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

/** Signs in for real and returns the session the browser would hold afterwards. */
async function signIn(email: string) {
  const link = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  }).then((r) => r.json());

  const session = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  }).then((r) => r.json());

  expect(session.access_token, 'could not sign in for the test').toBeTruthy();
  return session;
}

/** Puts the signed-in session where the app looks for it, before any app code runs. */
async function beSignedIn(page: Page, session: any) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, JSON.stringify(session)],
  );
}

type Seen = { url: string; authorization: string | null; status: number };

/**
 * Sends the app's API traffic to the local gated server and records what went out.
 * Handled outside the browser, so the reply is passed back with permission headers the page
 * will accept — otherwise the browser blocks it before the test can see anything.
 */
async function watchApiTraffic(page: Page, seen: Seen[]) {
  await page.route(`${LIVE_API}/api/**`, async (route) => {
    const request = route.request();
    const target = request.url().replace(LIVE_API, LOCAL_API);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': APP_ORIGIN,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
      });
      return;
    }

    let response;
    try {
      response = await route.fetch({ url: target, maxRedirects: 0 });
    } catch {
      // Either the test finished and the page went away mid-call, or the server is not
      // there. Answer the page rather than leaving it hanging — a hung page times out as
      // "the app made no call", which blames the app for a missing server.
      try {
        await route.fulfill({
          status: 503,
          headers: { 'access-control-allow-origin': APP_ORIGIN },
          body: '{"error":"test server unreachable"}',
        });
      } catch {
        /* page already gone */
      }
      return;
    }
    seen.push({
      url: request.url().replace(LIVE_API, ''),
      authorization: await request.headerValue('authorization'),
      status: response.status(),
    });
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'access-control-allow-origin': APP_ORIGIN,
        'access-control-allow-credentials': 'true',
      },
    });
  });
}

async function gatedServerIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_API}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

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
    const session = await signIn(TEST_EMAIL!);
    await beSignedIn(page, session);

    const seen: Seen[] = [];
    await watchApiTraffic(page, seen);

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
    const session = await signIn(TEST_EMAIL!);
    await beSignedIn(page, { ...session, access_token: 'spoiled.not.valid' });

    const seen: Seen[] = [];
    await watchApiTraffic(page, seen);

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
