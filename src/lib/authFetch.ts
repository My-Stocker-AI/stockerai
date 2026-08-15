/**
 * EVERY CALL TO OUR SERVER CARRIES THE DRIVER'S LOGIN.
 *
 * The server used to believe whatever a request claimed about who was calling, so the app
 * never needed to prove anything. That is closed now: without a login, every command is
 * refused. This is the one place the app attaches that login, so a new call site cannot be
 * added later that quietly forgets it.
 *
 * The retry matters more than it looks. A login expires after an hour and a route takes
 * longer than that. Without the refresh below, a stocker halfway down a machine would hear
 * an error instead of the next item and have no idea why. One silent refresh and retry means
 * he never finds out it happened.
 */
import { supabase } from '@/integrations/supabase/client';

async function accessToken(forceRefresh = false): Promise<string | null> {
  // Both of these reach the network, so both can throw outright — a driver in a warehouse
  // dead-spot is the normal case, not the exotic one. A throw here would escape as an
  // unhandled crash instead of the plain "couldn't reach the server" the app already knows
  // how to show, so nothing is allowed to escape.
  try {
    if (forceRefresh) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[authFetch] could not refresh the login:', error.message);
        return null;
      }
      return data?.session?.access_token ?? null;
    }
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch (e: any) {
    console.warn('[authFetch] could not read the login:', e?.message ?? e);
    return null;
  }
}

function withAuth(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * fetch(), plus the driver's login — and one silent recovery if that login has just expired.
 *
 * Pass the same arguments you would pass to fetch(). Body, method and any other headers are
 * left exactly as given, so a multipart upload works here as well as a JSON command.
 */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, withAuth(init, await accessToken()));

  if (response.status !== 401) return response;

  // Refused. Either the stored login expired mid-route, or it was never there. Get a fresh
  // one and try exactly once more — never a loop, so a genuinely signed-out user fails fast
  // instead of hammering the server.
  const refreshed = await accessToken(true);
  if (!refreshed) return response;

  console.warn('[authFetch] login had expired — refreshed and retrying once');
  return fetch(url, withAuth(init, refreshed));
}

/**
 * The headers alone, for a call site that must build its own request. Prefer authFetch:
 * this variant has no retry, so an expired login surfaces to the driver as a failure.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
