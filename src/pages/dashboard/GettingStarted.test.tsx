// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GettingStarted from './GettingStarted';

const mocks = vi.hoisted(() => ({
  onboarding: {
    isAdmin: true,
    isLoading: false,
    reportSource: null,
    reportSourceName: '',
    reportFormatStatus: null,
  },
  update: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/components/dashboard/DashboardLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    userRole: { account_id: 'account-1', role: mocks.onboarding.isAdmin ? 'primary_admin' : 'driver' },
  }),
}));

vi.mock('@/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => mocks.onboarding,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (value: unknown) => {
        mocks.update(value);
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      },
    }),
  },
}));

vi.mock('@/lib/authFetch', () => ({ authFetch: vi.fn() }));

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GettingStarted />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.onboarding.isAdmin = true;
  mocks.onboarding.reportSource = null;
  mocks.onboarding.reportSourceName = '';
  mocks.onboarding.reportFormatStatus = null;
  mocks.update.mockReset();
  mocks.toast.mockReset();
});

afterEach(cleanup);

describe('Getting Started', () => {
  it('takes a Parlevel administrator to the Google Drive and Machine View Only instructions', async () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Parlevel'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('Create your phone-ready route folder')).toBeTruthy();
    expect(screen.getByText(/Create a folder named “StockerAI Routes”/)).toBeTruthy();
    expect(screen.getByText(/Export the Machine View Only PDF/)).toBeTruthy();
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      report_source: 'parlevel',
      report_format_status: 'ready',
    })));
  });

  it('routes another system to representative-PDF submission instead of live import', async () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Another vending system'));
    fireEvent.change(screen.getByLabelText('Vending system name'), { target: { value: 'Nayax' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('Submit a representative report')).toBeTruthy();
    expect(screen.getByText(/It does not create a live route/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit for format setup/i }).hasAttribute('disabled')).toBe(true);
  });

  it('gives a picker phone, microphone, Bluetooth, recovery, and touch guidance', async () => {
    mocks.onboarding.isAdmin = false;
    renderPage();
    expect(screen.getByText('Set up your route phone')).toBeTruthy();
    expect(screen.getByText(/Allow microphone access/i)).toBeTruthy();
    expect(screen.getByText(/Connect Bluetooth earbuds/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText('How picking works')).toBeTruthy();
    expect(screen.getByText(/Touch is always available/i)).toBeTruthy();
    expect(screen.getByText(/Connection loss is recoverable/i)).toBeTruthy();
  });
});
