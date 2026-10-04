// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminReportFormats from './AdminReportFormats';

const mocks = vi.hoisted(() => ({ authFetch: vi.fn(), toast: vi.fn() }));

vi.mock('@/components/admin/AdminLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.authFetch }));

beforeEach(() => {
  mocks.toast.mockReset();
  mocks.authFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [{
      id: 'review-1',
      account_id: 'account-1',
      account_name: 'Acme Vending',
      account_email: 'owner@example.com',
      vendor: 'Nayax',
      filename: 'route.pdf',
      reason: 'unsupported_vendor',
      status: 'new',
      created_at: '2026-10-03T12:00:00Z',
      updated_at: null,
      review_notes: '',
      pdf_available: true,
    }] }),
  });
});

afterEach(cleanup);

describe('Report Formats admin inbox', () => {
  it('shows durable pending work with customer and vendor context', async () => {
    render(<AdminReportFormats />);
    expect(await screen.findByText('Acme Vending')).toBeTruthy();
    expect(screen.getByText(/Nayax · route.pdf/)).toBeTruthy();
    expect(screen.getByText('owner@example.com')).toBeTruthy();
    expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0);
    expect(mocks.authFetch).toHaveBeenCalledWith(expect.stringContaining('/admin/report-formats'));
  });
});
