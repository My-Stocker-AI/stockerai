// @vitest-environment jsdom
// Real screen, session reducer and command transport; external I/O only is mocked.
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ options: null as any, session: null as any, voice: null as any,
  params: new URLSearchParams('route=route-fixture&resume=1'), user: { id: 'fixture-user' },
  persistence: { load: vi.fn(async () => null), save: vi.fn(), clear: vi.fn() },
  fetch: vi.fn(), speak: vi.fn(async () => {}) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [f.params] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: f.user, userProfile: { first_name: 'Tester' }, loading: false }) }));
vi.mock('@/hooks/useVoice', () => ({ useVoice: (options: any) => { f.options = options; return f.voice; } }));
vi.mock('@/hooks/useSessionPersistence', () => ({ useSessionPersistence: () => f.persistence }));
vi.mock('@/hooks/useKeywordLearning', () => ({ useKeywordLearning: () => ({ getUserKeywords: vi.fn(async () => []), trackKeywords: vi.fn() }) }));
vi.mock('@/hooks/useEnvironmentDetection', () => ({ useEnvironmentDetection: () => ({ environment: { endpointing: 300 } }) }));
vi.mock('@/hooks/useStockerSession', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useStockerSession')>();
  return { ...actual, useStockerSession: (user: string | null) => {
    f.session = actual.useStockerSession(user); return f.session;
  } };
});
vi.mock('@/lib/authFetch', () => ({ authFetch: f.fetch }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => { throw new Error('Unexpected database access'); }) } }));
let StockerApp: typeof import('./StockerApp').default;

let now = 10_000;
const state = () => f.session.routeState;
const response = (value: unknown) => new Response(JSON.stringify(value));
async function say(text: string) {
  now += 2_000;
  await act(async () => f.options.onTranscript(text, true));
}
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  vi.stubEnv('VITE_API_BACKEND', 'python');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network forbidden'); }));
  window.matchMedia = vi.fn(() => ({ matches: false })) as any;
  f.voice = { status: 'listening', getStatus: () => 'listening', speak: f.speak,
    startListening: vi.fn(async () => true), stopListening: vi.fn(), stopAudio: vi.fn(),
    setAwaitingDirection: vi.fn(), setThinking: vi.fn(), resumeListening: vi.fn(),
    playErrorBeep: vi.fn(), playSuccessBeep: vi.fn(), prefetchTTS: vi.fn() };
  ({ default: StockerApp } = await import('./StockerApp'));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([[false, 'forward'], [false, 'reverse'], [true, 'forward'], [true, 'reverse']])(
  'cold restore preserves a pair through a question and exactly one next, preference=%s direction=%s', async (two, direction) => {
    localStorage.setItem('stocker-call-two-items', String(two));
    const order = direction === 'forward' ? ['First', 'Second'] : ['Second', 'First'];
    const item = (name: string) => ({ product_name: name, quantity: 2, slot: name, slot_spoken: name });
    const transitions: any[] = [];
    f.fetch.mockImplementation(async (url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (url.endsWith('/resume-state')) return response({ has_session: true, resume_window_version: 1, session_id: 'saved-session', picking_revision: 'saved-revision',
        route: { id: 'route-fixture', route_name: 'Fixture', route_date: '2099-01-01', total_machines: 2 },
        current_machine: { id: 'm1', name: 'Machine One', total_items: 2, completed_items: 2 },
        current_machine_index: 1, current_item: item(order[0]), current_item2: item(order[1]),
        completed_list: [], confirmed_items: 0, items_remaining: 0, pick_direction: direction,
        machines: [{ id: 'm1', name: 'Machine One', totalItems: 2, completedItems: 2, status: 'in_progress' },
          { id: 'm2', name: 'Machine Two', totalItems: 1, completedItems: 0, status: 'pending' }] });
      if (url.endsWith('/openai-chat')) return response({ choices: [{ message: { content: 'Both items are still to pick.' } }] });
      expect(url).toMatch(/\/picking-transition$/);
      transitions.push(body);
      return response({ action: 'next_machine', next_machine_id: 'm2', next_machine: 'Machine Two',
        new_completed_items: 2, picking_revision: 'next-revision', spoken: 'Machine Two. Top or bottom?' });
    });
    render(React.createElement(StockerApp));
    await waitFor(() => expect(state().currentItem2?.product).toBe(order[1]));
    expect(state().completedItems).toHaveLength(0);
    expect(f.speak).toHaveBeenCalledWith(expect.stringContaining('0 of 2 confirmed'));
    const before = structuredClone(state());
    await say('Is that the original flavor?');
    expect(state()).toEqual(before);
    expect(transitions).toHaveLength(0);
    await say('okay');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ session_id: 'saved-session', expected_revision: 'saved-revision',
      expected_machine_id: 'm1', action: 'next', count: two ? 2 : 1,
      expected_state: { completed_items: 2, status: 'in_progress', direction } });
    expect(state().completedItems.map((it: any) => it.product)).toEqual(order);
    expect(state().currentItem).toBeNull();
    expect(state().currentItem2).toBeNull();
    expect(state().pendingMachineTransition.nextMachineId).toBe('m2');
  });
