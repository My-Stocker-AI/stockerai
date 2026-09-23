// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  options: null as any,
  execute: vi.fn(async (_calls: any[]) => []), speak: vi.fn(async () => {}),
  send: vi.fn(async () => ({ content: 'test reply' })),
  state: null as any,
  voice: null as any,
  update: vi.fn(), track: vi.fn(),
  loading: true, clear: vi.fn(async () => {}),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: mocks.loading }) }));
vi.mock('@/hooks/useVoice', () => ({ useVoice: (options: any) => { mocks.options = options; return mocks.voice; } }));
vi.mock('@/hooks/useStockerSession', () => ({ useStockerSession: () => ({
  routeState: mocks.state, sessionId: 'disposable-session', messages: [], messagesRef: { current: [] },
  updateFromTool: mocks.update, addMessage: vi.fn(), reset: vi.fn(), setRouteState: vi.fn(),
  setMessages: vi.fn(), setSessionId: vi.fn(), generateNewSessionId: vi.fn(),
}) }));
vi.mock('@/hooks/useStockerAI', () => ({ useStockerAI: () => ({
  setSession: vi.fn(), sendToAI: mocks.send, executeToolCalls: mocks.execute, getRoutes: vi.fn(),
}) }));
vi.mock('@/hooks/useSessionPersistence', () => ({ useSessionPersistence: () => ({ save: vi.fn(), clear: mocks.clear }) }));
vi.mock('@/hooks/useKeywordLearning', () => ({ useKeywordLearning: () => ({ trackKeywords: mocks.track }) }));
vi.mock('@/hooks/useEnvironmentDetection', () => ({ useEnvironmentDetection: () => ({ environment: { endpointing: 300 } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/authFetch', () => ({ authFetch: vi.fn(() => { throw new Error('Unexpected API request'); }) }));

import StockerApp from './StockerApp';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loading = true;
  mocks.execute.mockImplementation(async () => []);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in this test'); }));
  window.matchMedia = vi.fn(() => ({ matches: false })) as any;
  mocks.voice = {
    status: 'listening', getStatus: () => 'listening', speak: mocks.speak,
    stopListening: vi.fn(), stopAudio: vi.fn(), setAwaitingDirection: vi.fn(),
    setThinking: vi.fn(), resumeListening: vi.fn(), playErrorBeep: vi.fn(),
    playSuccessBeep: vi.fn(), prefetchTTS: vi.fn(),
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
  it('clears local progress only after the server confirms reset', async () => {
    mocks.loading=false;
    let finish!: (value: any) => void;
    mocks.execute.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
    const view=render(React.createElement(StockerApp));
    fireEvent.click(view.getByRole('button',{name:'Reset Route'}));
    fireEvent.click(view.getAllByRole('button',{name:'Reset Route'})[0]);
    expect(mocks.clear).not.toHaveBeenCalled();
    await act(async () => { finish([{result:{action:'route_reset'}}]); });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  it('a failed server reset keeps local progress and binds to the confirmed target', async () => {
    mocks.loading = false;
    mocks.execute.mockResolvedValue([{result:{error:'conflict'}}] as any);
    const view=render(React.createElement(StockerApp));
    fireEvent.click(view.getByRole('button',{name:'Reset Route'}));
    const original=mocks.state;
    mocks.state={...original,currentMachineId:'newer-machine'};
    view.rerender(React.createElement(StockerApp));
    await act(async () => {fireEvent.click(view.getAllByRole('button',{name:'Reset Route'})[0]);});
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect((mocks.execute.mock.calls[0] as any[])[3]).toBe(original);
    expect((mocks.execute.mock.calls[0] as any[])[4]).toBe(true);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(view.getByText('Reset could not be confirmed. Reload your saved route before continuing.')).toBeTruthy();
  });

  it.each(['skip it', 'skip this machine'])('targets the current handoff for %s and explains a refusal', async text => {
    mocks.state.currentItem = null;
    mocks.state.machines[0].status = 'skipped';
    mocks.state.pendingMachineTransition = { nextMachineId: 'machine-test', nextMachineName: 'Fixture machine', nextMachineIndex: 1 };
    const before = structuredClone(mocks.state);
    mocks.execute.mockResolvedValue([{ result: { error: 'Request failed', user_message: 'This machine is still skipped. You can return to the unfinished work or pause for now.' } }] as any);
    render(React.createElement(StockerApp));
    await say(text);
    expect(JSON.parse(mocks.execute.mock.calls[0][0][0].function.arguments).expected_machine_id).toBe('machine-test');
    expect(mocks.speak).toHaveBeenLastCalledWith('This machine is still skipped. You can return to the unfinished work or pause for now.');
    expect(mocks.voice.playSuccessBeep).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenLastCalledWith(text, false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.state).toEqual(before);
  });

  it.each(['okay', 'next'])('does not advance skipped work on %s after an offer', async text => {
    mocks.state.currentItem = null;
    mocks.state.machines[0].status = 'skipped';
    render(React.createElement(StockerApp));
    await say(text);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith(expect.stringContaining('top or bottom'));
  });

  it('go back stays available after deferring the remaining skipped machines', async () => {
    mocks.state.currentItem = null;
    mocks.state.machines[0].status = 'skipped';
    render(React.createElement(StockerApp));
    await say('go back to skipped');
    expect(mocks.execute.mock.calls[0][0][0].function.name).toBe('go_back_to_skipped');
  });

  it('a debounced duplicate is not reported as a speech failure', async () => {
    mocks.execute.mockResolvedValue([{ result: { ignored: true } }] as any);
    render(React.createElement(StockerApp));
    await say('skip it');
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(mocks.voice.resumeListening).toHaveBeenCalled();
  });

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

  it('confirms a lower-confidence fuzzy action before changing route progress', async () => {
    render(React.createElement(StockerApp));
    await say('nexxt');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith('Next item?');
    await say('yes');
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][0][0].function.name).toBe('get_next_item');
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
