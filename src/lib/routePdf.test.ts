import { beforeEach, describe, expect, it, vi } from 'vitest';

const authFetch = vi.fn();
vi.mock('@/lib/authFetch', () => ({ authFetch }));

const { fetchRoutePdfUrl } = await import('./routePdf');

beforeEach(() => authFetch.mockReset());

describe('authorized route PDF links', () => {
  it('requests the exact route through the authenticated API', async () => {
    const url = 'https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/sign/route-pdfs/u/date/report.pdf?token=short';
    authFetch.mockResolvedValue(new Response(JSON.stringify({ url }), { status: 200 }));

    await expect(fetchRoutePdfUrl('route / one')).resolves.toBe(url);
    expect(authFetch).toHaveBeenCalledWith(
      'https://stockerai-api.onrender.com/api/route-pdf-url?route_id=route%20%2F%20one',
    );
  });

  it.each([
    'https://attacker.invalid/storage/v1/object/sign/route-pdfs/report.pdf?token=x',
    'https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/report.pdf',
    'https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/sign/other/report.pdf?token=x',
  ])('refuses an unexpected link destination: %s', async url => {
    authFetch.mockResolvedValue(new Response(JSON.stringify({ url }), { status: 200 }));
    await expect(fetchRoutePdfUrl('route-1')).rejects.toThrow('could not be verified');
  });

  it('surfaces the stable server refusal without exposing response internals', async () => {
    authFetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not available on this account.' }), { status: 403 }));
    await expect(fetchRoutePdfUrl('foreign')).rejects.toThrow('Not available on this account.');
  });
});
