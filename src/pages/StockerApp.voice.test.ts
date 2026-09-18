// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  options: null as any,
  execute: vi.fn(async (_calls: any[]) => []), speak: vi.fn(async () => {}),
  send: vi.fn(async () => ({ content: 'test reply' })),
  state: null as any,
  voice: null as any,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: true }) }));
vi.mock('@/hooks/useVoice', () => ({ useVoice: (options: any) => { mocks.options = options; return mocks.voice; } }));
vi.mock('@/hooks/useStockerSession', () => ({ useStockerSession: () => ({
  routeState: mocks.state, sessionId: 'disposable-session', messages: [], messagesRef: { current: [] },
  updateFromTool: vi.fn(), addMessage: vi.fn(), reset: vi.fn(), setRouteState: vi.fn(),
  setMessages: vi.fn(), setSessionId: vi.fn(), generateNewSessionId: vi.fn(),
}) }));
vi.mock('@/hooks/useStockerAI', () => ({ useStockerAI: () => ({
  setSession: vi.fn(), sendToAI: mocks.send, executeToolCalls: mocks.execute, getRoutes: vi.fn(),
}) }));
vi.mock('@/hooks/useSessionPersistence', () => ({ useSessionPersistence: () => ({ save: vi.fn() }) }));
vi.mock('@/hooks/useKeywordLearning', () => ({ useKeywordLearning: () => ({ trackKeywords: vi.fn() }) }));
vi.mock('@/hooks/useEnvironmentDetection', () => ({ useEnvironmentDetection: () => ({ environment: { endpointing: 300 } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/authFetch', () => ({ authFetch: vi.fn(() => { throw new Error('Unexpected API request'); }) }));

import StockerApp from './StockerApp';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in this test'); }));
  window.matchMedia = vi.fn(() => ({ matches: false })) as any;
  mocks.voice = {
    status: 'listening', getStatus: () => 'listening', speak: mocks.speak,
    stopListening: vi.fn(), stopAudio: vi.fn(), setAwaitingDirection: vi.fn(),
    setThinking: vi.fn(), resumeListening: vi.fn(), playErrorBeep: vi.fn(),
  };
  mocks.state = {
    routeId: 'route-test', routeName: 'Fixture', routeDate: '2099-01-01',
    currentMachineId: 'machine-test', currentMachineIndex: 0,
    machines: [{ id: 'machine-test', name: 'Fixture machine', status: 'in_progress' }],
    currentItem: { product: 'Fixture product', quantity: 2, slot: 'A1' },
    currentItem2: null, completedItems: [], pendingMachineTransition: null,
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function say(text: string) {
  await act(async () => { await mocks.options.onTranscript(text, true); });
}

describe('actual StockerApp transcript dispatch with mocked services', () => {
  it.each([[[]], [['12']], [['twelve', '12']]])(
    'keeps the original skip confirmation when counting %j', async counts => {
      render(React.createElement(StockerApp));
      await say('forget this machine');
      expect(mocks.speak).toHaveBeenLastCalledWith('Skip this one?');
      for (const count of counts) await say(count);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.speak).toHaveBeenCalledTimes(1);
      await say('yes');
      expect(mocks.execute).toHaveBeenCalledTimes(1);
      expect(mocks.execute.mock.calls[0][0][0].function.name).toBe('skip_current_machine');
    },
  );

  it('ignores counting during picking without sending it to the AI', async () => {
    render(React.createElement(StockerApp));
    await say('12');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
  });

  it('still cancels a pending guess when the driver says no', async () => {
    render(React.createElement(StockerApp));
    await say('forget this machine');
    await say('no');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith('Okay.');
  });

  it('passes numeric input through when choosing a route or date', async () => {
    mocks.state = { ...mocks.state, routeName: null, currentMachineId: null, currentItem: null, machines: [] };
    render(React.createElement(StockerApp));
    expect(mocks.options.shouldIgnoreTranscript('12')).toBe(false);
    await say('12');
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it('keeps direction handling available at a machine handoff', async () => {
    mocks.state.pendingMachineTransition = { nextMachineId: 'next-machine', nextMachineName: 'Next fixture', nextMachineIndex: 1 };
    render(React.createElement(StockerApp));
    expect(mocks.options.shouldIgnoreTranscript('12')).toBe(false);
    expect(mocks.options.shouldIgnoreTranscript('bottom')).toBe(false);
    await say('bottom');
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][0][0].function.name).toBe('start_machine');
  });

  it('updates the microphone predicate when route context changes', () => {
    const view = render(React.createElement(StockerApp));
    expect(mocks.options.shouldIgnoreTranscript('12')).toBe(true);
    mocks.state = { ...mocks.state, routeName: null };
    view.rerender(React.createElement(StockerApp));
    expect(mocks.options.shouldIgnoreTranscript('12')).toBe(false);
  });
});
