export function requireLocalTarget(value: string | undefined): string {
  let url: URL;
  try { url = new URL(value ?? ''); } catch { throw new Error('Explicit local test service URL required'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Tests require a disposable local service URL with a port');
  }
  return url.origin;
}

export function testDatabase(env = process.env) {
  if (env.STOCKERAI_DB_TESTS !== '1') throw new Error('Browser/database tests require STOCKERAI_DB_TESTS=1');
  const url = requireLocalTarget(env.STOCKERAI_TEST_SUPABASE_URL);
  const key = env.STOCKERAI_TEST_SERVICE_KEY;
  if (!key) throw new Error('Explicit disposable test service key required');
  return { url, key };
}
