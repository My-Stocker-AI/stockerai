// Compatibility addresses only. Identity and authorization belong to the Python API.
// Never create a privileged Supabase client or infer a session at this boundary.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function legacyPickingHandler(kind: 'status' | 'next', send: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return reply(405, 'Use POST.');
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, 'Sign in to continue.');
    let body: Record<string, unknown>;
    try {
      body = await request.json();
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    } catch {
      return reply(400, 'Invalid request.');
    }
    if (kind === 'next' && (!body.operation_id || !body.session_id ||
        !body.expected_revision || !body.expected_machine_id || !body.expected_state)) {
      return reply(409, 'Reload your saved route in the current app before continuing.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const path = kind === 'status' ? 'get-current-status' : 'picking-transition';
      const response = await send(`https://stockerai-api.onrender.com/api/${path}`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'status' ? {} : { ...body, action: 'next' }),
      });
      if (!response.ok) {
        const messages: Record<number, string> = {
          401: 'Sign in to continue.', 403: 'Not available on this account.',
          409: 'Picking state changed. Reload your saved route before continuing.',
          422: 'Invalid picking request. Reload your saved route before continuing.',
        };
        return reply(messages[response.status] ? response.status : 503,
          messages[response.status] || 'Could not confirm the result. Reload your saved route before continuing.');
      }
      return new Response(JSON.stringify(await response.json()), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      return reply(503, 'Could not confirm the result. Reload your saved route before continuing.');
    } finally {
      clearTimeout(timeout);
    }
  };
}
