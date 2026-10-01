// @vitest-environment jsdom
// Real screen, recognizers, session reducer and AI/tool transport. Only external
// I/O is simulated. No driver data, provider credentials or live network access.
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { useStockerSession } from '@/hooks/useStockerSession';
import type { useStockerAI } from '@/hooks/useStockerAI';
import type { UseVoiceOptions, useVoice } from '@/hooks/useVoice';

const fixture = vi.hoisted(() => ({
  options: null as UseVoiceOptions | null, voice: null as Partial<ReturnType<typeof useVoice>> | null,
  session: null as ReturnType<typeof useStockerSession> | null,
  ai: null as ReturnType<typeof useStockerAI> | null,
  fetch: vi.fn(), speak: vi.fn(async (_text: string) => {}),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: true }) }));
vi.mock('@/hooks/useVoice', () => ({ useVoice: (options: UseVoiceOptions) => { fixture.options = options; return fixture.voice; } }));
vi.mock('@/hooks/useStockerSession', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useStockerSession')>();
  return { ...actual, useStockerSession: (userId: string | null) => {
    fixture.session = actual.useStockerSession(userId); return fixture.session;
  } };
});
vi.mock('@/hooks/useStockerAI', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useStockerAI')>();
  return { ...actual, useStockerAI: () => { fixture.ai = actual.useStockerAI(); return fixture.ai; } };
});
vi.mock('@/hooks/useSessionPersistence', () => ({ useSessionPersistence: () => ({ save: vi.fn(), clear: vi.fn() }) }));
vi.mock('@/hooks/useKeywordLearning', () => ({ useKeywordLearning: () => ({ trackKeywords: vi.fn() }) }));
vi.mock('@/hooks/useEnvironmentDetection', () => ({ useEnvironmentDetection: () => ({ environment: { endpointing: 300 } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/authFetch', () => ({ authFetch: fixture.fetch }));

let StockerApp: typeof import('./StockerApp').default;
let clock = 100_000;
const sessionId = '11111111-1111-4111-8111-111111111111';
const machines = ['Alpha', 'Bravo', 'Charlie'].map((name, index) => ({
  id: `machine-${index}`, name, sequence: index + 1, location: 'Fixture',
  totalItems: 3, completedItems: 0, status: 'pending',
}));
const state = () => fixture.session!.routeState;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function say(text: string) {
  clock += 2_000; // deliberate separate utterances, beyond the existing debounce
  await act(async () => { await fixture.options!.onTranscript?.(text, true); });
}
async function openRoute(two = false) {
  localStorage.setItem('stocker-call-two-items', String(two));
  const view = render(React.createElement(StockerApp));
  fixture.ai!.setSession(sessionId, 'fixture-user');
  await act(async () => {
    fixture.session!.setSessionId(sessionId);
    fixture.session!.addMessage({ role: 'assistant', content: 'Start Alpha from top or bottom?' });
    await fixture.session!.updateFromTool('set_route_sequence', {
      action: 'machine_ready', route_id: 'fixture-route', route_name: 'Fixture route', date: '2099-01-01',
      machines_count: 3, machine_index: 1, machine_id: machines[0].id, machine_name: 'Alpha',
      machines, picking_revision: 'revision-0', pick_direction: 'forward',
    });
  });
  return view;
}

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network forbidden'); }));
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  window.matchMedia = vi.fn(() => ({ matches: false } as MediaQueryList));
  fixture.voice = {
    status: 'listening', getStatus: () => 'listening', speak: fixture.speak,
    stopListening: vi.fn(), stopAudio: vi.fn(), setAwaitingDirection: vi.fn(),
    setThinking: vi.fn(), resumeListening: vi.fn(), playErrorBeep: vi.fn(),
    playSuccessBeep: vi.fn(), prefetchTTS: vi.fn(),
  };
  ({ default: StockerApp } = await import('./StockerApp'));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([[false, 'top'], [false, 'bottom'], [true, 'top'], [true, 'bottom']])(
  'finishes three machines with interleaved questions: two items=%s, direction=%s', async (two, direction) => {
    let machineIndex = 0, presented = 0, revision = 0;
    const transitions: Record<string, unknown>[] = [], questions: Record<string, unknown>[] = [];
    const questionRequests: Record<string, unknown>[] = [];
    fixture.fetch.mockImplementation(async (url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (url.endsWith('/openai-chat')) {
        questionRequests.push(body);
        // Return a refusal instead of throwing assertions inside application
        // retry code; assertions below then report the actual request mismatch.
        if (body.tools || body.messages.length !== 2 || !body.messages[0].content.includes('CURRENT SNAPSHOT:\n')) {
          return response({ detail: 'Fixture expected a snapshot-only question' }, 400);
        }
        const snapshot = JSON.parse(body.messages[0].content.split('CURRENT SNAPSHOT:\n')[1]);
        questions.push(snapshot);
        expect(snapshot.machine.id).toBe(machines[machineIndex].id);
        expect(snapshot.machine.name).toBe(machines[machineIndex].name);
        expect(snapshot.phase).toBe('picking');
        expect(snapshot.item).toEqual(state().currentItem);
        expect(snapshot.secondItem).toEqual(state().currentItem2);
        expect(snapshot.confirmedItems).toBe(state().completedItems.length);
        // Simulated provider response. This proves snapshot routing, not LLM quality.
        return response({ choices: [{ message: { content: `${snapshot.machine.name}: ${snapshot.item.product}.` } }] });
      }
      expect(url).toMatch(/\/picking-transition$/);
      expect(body.session_id).toBe(sessionId);
      expect(body.expected_machine_id).toBe(machines[machineIndex].id);
      expect(body.expected_revision).toBe(`revision-${revision}`);
      expect(body.expected_state.completed_items).toBe(presented);
      expect(body.count).toBe(two ? 2 : 1);
      transitions.push(body);
      revision++;
      if (body.action === 'next' && presented === 3) {
        if (machineIndex === 2) return response({ action: 'route_complete', new_completed_items: 3,
          spoken: 'Fixture route complete.', picking_revision: `revision-${revision}` });
        machineIndex++; presented = 0;
        return response({ action: 'next_machine', next_machine_id: machines[machineIndex].id,
          next_machine: machines[machineIndex].name, new_completed_items: 3,
          spoken: `Complete. Top or bottom for ${machines[machineIndex].name}?`, picking_revision: `revision-${revision}` });
      }
      expect(body.action).toBe(presented === 0 ? 'start' : 'next');
      const itemAt = (position: number) => ({ product_name: `${machines[machineIndex].name} product ${position}`,
        quantity: position + 1, slot: `S${position}`, slot_spoken: `S ${position}`, inventory_current: 0, inventory_parlevel: 8 });
      const position = body.direction === 'reverse' ? 3 - presented : presented + 1;
      const item1 = itemAt(position);
      const item2 = two && presented + 1 < 3 ? itemAt(position + (body.direction === 'reverse' ? -1 : 1)) : null;
      presented = Math.min(3, presented + (two ? 2 : 1));
      return response({ action: body.action === 'start' ? 'item_ready' : 'next_item',
        machine_id: machines[machineIndex].id, machine_name: machines[machineIndex].name,
        item1, item2, new_item_index: position, new_completed_items: presented,
        items_remaining: 3 - presented, direction: body.direction, picking_revision: `revision-${revision}`,
        spoken: [item1, item2].filter(Boolean).map(item => `${item!.quantity} ${item!.product_name}`).join(', '),
      });
    });
    await openRoute(two);
    for (let machine = 0; machine < 3; machine++) {
      const beforeStart = transitions.length;
      await say(machine === 0 ? direction : direction === 'bottom' ? 'Bottom. Bottom. Bottom.' : 'top, top!');
      expect(transitions).toHaveLength(beforeStart + 1);
      expect(state().currentMachineName).toBe(machines[machine].name);
      expect(state().pendingMachineTransition).toBeNull();
      while (state().currentItem) {
        const beforeQuestion = structuredClone(state());
        const beforeRequests = transitions.length;
        await say('Is that the original flavor?');
        const questionRequest = questionRequests[questionRequests.length - 1];
        expect(questionRequest.tools).toBeUndefined();
        expect(questionRequest.messages).toHaveLength(2);
        expect(questionRequest.messages[0].content).not.toContain('ROUTE SELECTION MODE');
        expect(questions.length).toBeGreaterThan(0);
        expect(state()).toEqual(beforeQuestion);
        expect(transitions).toHaveLength(beforeRequests);
        expect(fixture.speak).toHaveBeenLastCalledWith(expect.stringContaining(`${machines[machine].name}:`));
        await say('repeat');
        expect(fixture.speak).toHaveBeenLastCalledWith(expect.stringContaining(beforeQuestion.currentItem!.product));
        await say('which machine');
        expect(fixture.speak).toHaveBeenLastCalledWith(`You're on ${machines[machine].name}.`);
        await say('okay');
        expect(transitions).toHaveLength(beforeRequests + 1);
      }
    }
    expect(state().completed).toBe(true);
    expect(state().sessionInvalidated).toBe(true);
    expect(state().completedItems).toHaveLength(9);
    expect(state().machines.map(machine => machine.status)).toEqual(['completed', 'completed', 'completed']);
    expect(transitions.filter(call => call.action === 'start')).toHaveLength(3);
    expect(transitions.filter(call => call.action === 'next')).toHaveLength(two ? 6 : 9);
    expect(questions).toHaveLength(two ? 6 : 9);
    await say('okay');
    expect(transitions).toHaveLength(two ? 9 : 12);
  });

it('ignores a late conversational answer after the displayed item changes', async () => {
  await openRoute();
  await act(async () => fixture.session!.setRouteState(previous => ({ ...previous,
    currentItem: { product: 'Old item', quantity: 1, slot: 'A1', slot_spoken: 'A one', machineName: 'Alpha' },
    machines: previous.machines.map((machine, index) => index ? machine : { ...machine, status: 'in_progress' }),
  })));
  let finish!: (value: Response) => void;
  fixture.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = Promise.resolve(fixture.options!.onTranscript?.('Is that the original flavor?', true)).then(() => {}); });
  await act(async () => fixture.session!.setRouteState(previous => ({ ...previous,
    currentItem: { ...previous.currentItem!, product: 'New item' },
  })));
  await act(async () => { finish(response({ choices: [{ message: { content: 'Obsolete answer' } }] })); await pending; });
  expect(fixture.speak).not.toHaveBeenCalledWith('Obsolete answer');
  expect(state().currentItem!.product).toBe('New item');
});

it('a failed product question preserves the pick and the next ordinary command still works', async () => {
  await openRoute();
  await act(async () => fixture.session!.setRouteState(previous => ({ ...previous,
    currentItem: { product: 'Fixture snack', quantity: 1, slot: 'A1', slot_spoken: 'A one', machineName: 'Alpha' },
    machines: previous.machines.map((machine, index) => index ? machine : { ...machine, status: 'in_progress', completedItems: 1 }),
  })));
  fixture.fetch.mockResolvedValueOnce(response({ detail: 'fixture unavailable' }, 400));
  const before = structuredClone(state());
  await say('Is that the original flavor?');
  expect(state()).toEqual(before);
  expect(fixture.fetch).toHaveBeenCalledOnce();
  expect(fixture.speak).toHaveBeenLastCalledWith(expect.stringContaining('repeat'));
  fixture.fetch.mockResolvedValueOnce(response({ action: 'next_item', product_name: 'Next fixture snack', quantity: 2,
    slot: 'A2', machine_name: 'Alpha', machine_id: machines[0].id, new_completed_items: 2,
    new_item_index: 2, items_remaining: 1, picking_revision: 'revision-1', spoken: '2 Next fixture snack' }));
  await say('okay');
  expect(fixture.fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fixture.fetch.mock.calls[1][1].body).action).toBe('next');
  expect(state().currentItem!.product).toBe('Next fixture snack');
  expect(state().completedItems).toHaveLength(1);
});

it('changes the displayed item only after durable undo is confirmed', async () => {
  let revision = 0;
  const calls: Array<{ url: string; body: {
    action?: string;
    expected_revision?: string;
    expected_state?: { completed_items?: number };
  } }> = [];
  fixture.fetch.mockImplementation(async (url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    calls.push({ url, body });
    revision++;
    if (url.endsWith('/undo-item')) {
      expect(body.expected_revision).toBe('revision-2');
      expect(body.expected_state?.completed_items).toBe(2);
      return response({ action: 'undo_item', machine_id: machines[0].id, machine_name: 'Alpha',
        item1: { product_name: 'Alpha product 1', quantity: 2, slot: 'S1', slot_spoken: 'S 1' },
        new_item_index: 1, new_completed_items: 1, confirmed_items: 0, items_remaining: 2,
        picking_revision: `revision-${revision}`, voice_text: 'Going back to Alpha product 1',
        spoken: 'Going back to Alpha product 1' });
    }
    const position = body.action === 'start' ? 1 : 2;
    return response({ action: body.action === 'start' ? 'item_ready' : 'next_item',
      machine_id: machines[0].id, machine_name: 'Alpha',
      item1: { product_name: `Alpha product ${position}`, quantity: position + 1,
        slot: `S${position}`, slot_spoken: `S ${position}` },
      new_item_index: position, new_completed_items: position, items_remaining: 3-position,
      direction: 'forward', picking_revision: `revision-${revision}`,
      voice_text: `${position + 1} Alpha product ${position}`, spoken: `${position + 1} Alpha product ${position}` });
  });
  await openRoute();
  await say('top');
  await say('next');
  expect(state().currentItem?.product).toBe('Alpha product 2');
  expect(state().completedItems.map(item => item.product)).toEqual(['Alpha product 1']);
  await say('previous item');
  expect(calls.map(call => new URL(call.url).pathname.split('/').pop())).toEqual([
    'picking-transition', 'picking-transition', 'undo-item',
  ]);
  expect(state().currentItem?.product).toBe('Alpha product 1');
  expect(state().currentItem2).toBeNull();
  expect(state().completedItems).toEqual([]);
  expect(state().machines[0].completedItems).toBe(1);
  expect(state().pickingRevision).toBe('revision-3');
});

it('does not speak or restart listening when an answer arrives after leaving the screen', async () => {
  const view = await openRoute();
  await act(async () => fixture.session!.setRouteState(previous => ({ ...previous,
    currentItem: { product: 'Fixture snack', quantity: 1, slot: 'A1', slot_spoken: 'A one', machineName: 'Alpha' },
    machines: previous.machines.map((machine, index) => index ? machine : { ...machine, status: 'in_progress' }),
  })));
  let finish!: (value: Response) => void;
  fixture.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = Promise.resolve(fixture.options!.onTranscript?.('Is that the original flavor?', true)).then(() => {}); });
  view.unmount();
  await act(async () => { finish(response({ choices: [{ message: { content: 'Late answer' } }] })); await pending; });
  expect(fixture.speak).not.toHaveBeenCalled();
  expect(fixture.voice.resumeListening).not.toHaveBeenCalled();
});
