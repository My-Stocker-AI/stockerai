import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { requireLocalTarget, testDatabase } from './testSafety';

export const LIVE_API = 'https://stockerai-api.onrender.com';
export const LOCAL_API = requireLocalTarget(process.env.STOCKER_TEST_API);
const APP_ORIGIN = 'http://localhost:8080';

const { url: SUPABASE_URL, key: SERVICE_KEY } = testDatabase();
const ANON_KEY = process.env.STOCKERAI_TEST_ANON_KEY!;
const PROJECT_REF = SUPABASE_URL.split('//')[1].split('.')[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

export type BrowserSession = Record<string, unknown> & { access_token: string };
export type SeenApiCall = { url: string; authorization: string | null; status: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function disposableTestEmail(): string {
  const email = process.env.STOCKERAI_TEST_EMAIL;
  if (!email?.endsWith('@example.invalid')) {
    throw new Error('Disposable test email ending @example.invalid required');
  }
  return email;
}

/** Uses the disposable Auth service, so browser tests exercise the same session shape as users. */
export async function signInDisposableUser(email = disposableTestEmail()): Promise<BrowserSession> {
  const link: unknown = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  }).then((response) => response.json());

  if (!isRecord(link) || typeof link.hashed_token !== 'string') {
    throw new Error('Could not generate a disposable test login link');
  }

  const session: unknown = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  }).then((response) => response.json());

  if (!isRecord(session) || typeof session.access_token !== 'string') {
    throw new Error('Could not sign in for the disposable browser test');
  }
  return { ...session, access_token: session.access_token };
}

/** Stores a genuine disposable session before application code starts. */
export async function beSignedIn(page: Page, session: BrowserSession): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, JSON.stringify(session)],
  );
}

/** Routes production API URLs to the loopback API and optionally records every result. */
export async function routeApiToLocal(
  page: Page,
  seen: SeenApiCall[] = [],
  options: { rejectFirstAuthenticatedRequest?: boolean } = {},
): Promise<void> {
  let rejectNextAuthenticatedRequest = options.rejectFirstAuthenticatedRequest === true;
  await page.route(`${LIVE_API}/api/**`, async (route) => {
    const request = route.request();
    const target = request.url().replace(LIVE_API, LOCAL_API);

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': APP_ORIGIN,
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        },
      });
      return;
    }

    if (rejectNextAuthenticatedRequest) {
      rejectNextAuthenticatedRequest = false;
      seen.push({
        url: request.url().replace(LIVE_API, ''),
        authorization: await request.headerValue('authorization'),
        status: 401,
      });
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': APP_ORIGIN },
        body: '{"detail":"synthetic expired access token"}',
      });
      return;
    }

    let response;
    try {
      response = await route.fetch({ url: target, maxRedirects: 0 });
    } catch {
      try {
        await route.fulfill({
          status: 503,
          headers: { 'access-control-allow-origin': APP_ORIGIN },
          body: '{"error":"test server unreachable"}',
        });
      } catch {
        // The page can close while a request is still in flight.
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

export async function gatedServerIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${LOCAL_API}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Creates the same server-side route session the app creates, without involving semantic AI. */
export async function prepareDisposableRoute(
  session: BrowserSession,
  routeName: string,
  deliveryDate: string,
): Promise<string> {
  const response = await fetch(`${LOCAL_API}/api/set-route-sequence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: randomUUID(),
      route_name: routeName,
      date: deliveryDate,
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not prepare disposable route (${response.status}): ${await response.text()}`);
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.session_id !== 'string') {
    throw new Error('Disposable route preparation returned no session');
  }
  return body.session_id;
}
