import { authFetch } from '@/lib/authFetch';

const API_BASE = 'https://stockerai-api.onrender.com/api';
const SUPABASE_ORIGIN = 'https://wvtkuposrlvadyeixlke.supabase.co';
const SIGNED_ROUTE_PDF_PREFIX = '/storage/v1/object/sign/route-pdfs/';

export async function fetchRoutePdfUrl(routeId: string): Promise<string> {
  const response = await authFetch(
    `${API_BASE}/route-pdf-url?route_id=${encodeURIComponent(routeId)}`,
  );
  if (!response.ok) {
    let detail = 'Could not open the route PDF. Try again.';
    try {
      const body = await response.json() as { detail?: unknown };
      if (typeof body.detail === 'string' && body.detail) detail = body.detail;
    } catch {
      // Keep the stable user-facing message for non-JSON failures.
    }
    throw new Error(detail);
  }

  const body = await response.json() as { url?: unknown };
  if (typeof body.url !== 'string') {
    throw new Error('The route PDF link could not be verified. Try again.');
  }

  const signedUrl = new URL(body.url);
  if (signedUrl.origin !== SUPABASE_ORIGIN || !signedUrl.pathname.startsWith(SIGNED_ROUTE_PDF_PREFIX)) {
    throw new Error('The route PDF link could not be verified. Try again.');
  }
  return signedUrl.toString();
}
