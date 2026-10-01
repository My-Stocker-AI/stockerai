// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseVoiceOptions } from '@/hooks/useVoice';
import type { WorkflowResult } from '@/hooks/useStockerSession';

interface TestToolCall { id: string; function: { name: string; arguments: string } }
interface TestToolResult { tool_call_id?: string; result: WorkflowResult }
interface TestAIMessage { content: string; tool_calls?: TestToolCall[] }
type ExecuteTools = (
  calls: TestToolCall[],
  onResult?: (name: string, result: WorkflowResult) => void,
  routeCompleted?: boolean,
  context?: unknown,
  resetConfirmed?: boolean,
) => Promise<TestToolResult[]>;
interface TestRouteState {
  pickingRevision?: string;
  routeId: string | null; routeName: string | null; routeDate: string | null;
  totalMachines: number; currentMachineId: string | null; currentMachineName: string | null;
  currentMachineIndex: number; currentMachineItemsRemaining: number;
  machines: Array<{ id: string; name: string; status: string }>;
  currentItem: { product: string; quantity: number; slot: string; slot_spoken?: string; item_index?: number } | null;
  currentItem2: null; completedItems: WorkflowResult[]; pendingMachineTransition: { nextMachineId: string; nextMachineName: string; nextMachineIndex: number } | null;
}
interface TestVoice {
  status: string; getStatus: () => string; speak: ReturnType<typeof vi.fn>;
  stopListening: ReturnType<typeof vi.fn>; stopAudio: ReturnType<typeof vi.fn>;
  pauseListening: ReturnType<typeof vi.fn>; mute: ReturnType<typeof vi.fn>; unmute: ReturnType<typeof vi.fn>;
  setAwaitingDirection: ReturnType<typeof vi.fn>; setThinking: ReturnType<typeof vi.fn>;
  resumeListening: ReturnType<typeof vi.fn>; playErrorBeep: ReturnType<typeof vi.fn>;
  playSuccessBeep: ReturnType<typeof vi.fn>; prefetchTTS: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  options: null as unknown as UseVoiceOptions,
  execute: vi.fn<ExecuteTools>(async () => []), speak: vi.fn(async () => {}),
  send: vi.fn<() => Promise<TestAIMessage>>(async () => ({ content: 'test reply' })),
  state: null as unknown as TestRouteState,
  voice: null as unknown as TestVoice,
  update: vi.fn(), track: vi.fn(),
  loading: true, clear: vi.fn(async () => {}),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: mocks.loading }) }));
vi.mock('@/hooks/useVoice', () => ({ useVoice: (options: UseVoiceOptions) => { mocks.options = options; return mocks.voice; } }));
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
  mocks.send.mockResolvedValue({ content: 'test reply' });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in this test'); }));
  window.matchMedia = vi.fn(() => ({ matches: false } as MediaQueryList));
  mocks.voice = {
    status: 'listening', getStatus: () => 'listening', speak: mocks.speak,
    stopListening: vi.fn(), stopAudio: vi.fn(), setAwaitingDirection: vi.fn(),
    pauseListening: vi.fn(), mute: vi.fn(), unmute: vi.fn(),
    setThinking: vi.fn(), resumeListening: vi.fn(), playErrorBeep: vi.fn(),
    playSuccessBeep: vi.fn(), prefetchTTS: vi.fn(),
  };
  mocks.state = {
    pickingRevision: 'revision-one',
    routeId: 'route-test', routeName: 'Fixture', routeDate: '2099-01-01',
    totalMachines: 3, currentMachineId: 'machine-test', currentMachineName: 'Fixture machine', currentMachineIndex: 0,
    currentMachineItemsRemaining: 4,
    machines: [
      { id: 'machine-test', name: 'Fixture machine', status: 'in_progress' },
      { id: 'machine-complete', name: 'Completed machine', status: 'completed' },
      { id: 'machine-skipped', name: 'Skipped fixture', status: 'skipped' },
    ],
    currentItem: { product: 'Fixture product', quantity: 2, slot: 'A1', slot_spoken: 'A one', item_index: 7 },
    currentItem2: null, completedItems: [], pendingMachineTransition: null,
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function say(text: string) {
  await act(async () => { await mocks.options.onTranscript?.(text, true); });
}

describe('actual StockerApp transcript dispatch with mocked services', () => {
  it.each(['top bottom', 'from the top or from the bottom', 'bottom top bottom', 'stop stop', 'pop pop'])('does not start a handoff from ambiguous repetition: %s', async text => {
    mocks.state.currentItem = null;
    mocks.state.pendingMachineTransition = { nextMachineId: 'machine-test', nextMachineName: 'Fixture machine', nextMachineIndex: 1 };
    render(React.createElement(StockerApp));
    await say(text);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith(expect.stringContaining('top or bottom'));
  });

  it('blocks a model-invented mutation at the dispatch boundary', async () => {
    mocks.send.mockResolvedValue({ content: 'Restarting.', tool_calls: [{ id: 'bad', function: { name: 'start_machine', arguments: '{}' } }] });
    render(React.createElement(StockerApp));
    await say('Is that the original flavor?');
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith(expect.stringContaining('repeat'));
  });

  it('clears local progress only after the server confirms reset', async () => {
    mocks.loading=false;
    let finish!: (value: TestToolResult[]) => void;
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
    mocks.execute.mockResolvedValue([{result:{error:'conflict'}}]);
    const view=render(React.createElement(StockerApp));
    fireEvent.click(view.getByRole('button',{name:'Reset Route'}));
    const original=mocks.state;
    mocks.state={...original,currentMachineId:'newer-machine'};
    view.rerender(React.createElement(StockerApp));
    await act(async () => {fireEvent.click(view.getAllByRole('button',{name:'Reset Route'})[0]);});
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0][3]).toBe(original);
    expect(mocks.execute.mock.calls[0][4]).toBe(true);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(view.getByText('Reset could not be confirmed. Reload your saved route before continuing.')).toBeTruthy();
  });

  it.each(['skip it', 'skip this machine'])('targets the current handoff for %s and explains a refusal', async text => {
    mocks.state.currentItem = null;
    mocks.state.machines[0].status = 'skipped';
    mocks.state.pendingMachineTransition = { nextMachineId: 'machine-test', nextMachineName: 'Fixture machine', nextMachineIndex: 1 };
    const before = structuredClone(mocks.state);
    mocks.execute.mockResolvedValue([{ result: { error: 'Request failed', user_message: 'This machine is still skipped. You can return to the unfinished work or pause for now.' } }]);
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

  it.each(['previous item', 'undo that'])('uses durable server undo before changing the screen: %s', async text => {
    mocks.state.completedItems = [{ product: 'Prior', quantity: 1, slot: 'A0', machineName: 'Fixture machine' }];
    const before = structuredClone(mocks.state);
    const confirmed = { action: 'undo_item', voice_text: 'Going back to Prior', item1: { product_name: 'Prior' } };
    mocks.execute.mockImplementation(async (_calls, onResult) => {
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.state).toEqual(before);
      onResult?.('undo_last_item', confirmed);
      return [{ tool_call_id: 'test', result: confirmed }];
    });
    render(React.createElement(StockerApp));
    await say(text);
    expect(mocks.execute.mock.calls[0][0][0].function.name).toBe('undo_last_item');
    expect(mocks.update).toHaveBeenCalledWith('undo_last_item', confirmed);
    expect(mocks.speak).toHaveBeenLastCalledWith('Going back to Prior');
  });

  it('preserves local progress when durable undo is refused', async () => {
    mocks.state.completedItems = [{ product: 'Prior', quantity: 1, slot: 'A0', machineName: 'Fixture machine' }];
    const before = structuredClone(mocks.state);
    mocks.execute.mockImplementation(async () => [{ result: { error: 'Request failed', user_message: 'Nothing to undo on this machine.' } }]);
    render(React.createElement(StockerApp));
    await say('previous item');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.state).toEqual(before);
    expect(mocks.speak).toHaveBeenLastCalledWith('Nothing to undo on this machine.');
  });

  it('a debounced duplicate is not reported as a speech failure', async () => {
    mocks.execute.mockResolvedValue([{ result: { ignored: true } }]);
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

  it.each([
    ['how many items do i have left', '4 items left on this machine.'],
    ['what route am i on', "You're on the Fixture route."],
    ['which machines did i skip', 'You skipped Skipped fixture.'],
    ['how many machines have we skipped', 'You skipped Skipped fixture.'],
    ['what slot am i on', 'The current slot is A one.'],
    ['what item number am i on', "You're on item 7."],
    ["what's my progress", "1 of 3 machines complete. You're on Fixture machine, with 4 items left."],
  ])('answers read-only status question locally without changing state: %s', async (question, answer) => {
    const before = structuredClone(mocks.state);
    render(React.createElement(StockerApp));
    await say(question);
    expect(mocks.speak).toHaveBeenLastCalledWith(answer);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.state).toEqual(before);
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

  it('refuses a confirmation after the authoritative picking context changes', async () => {
    const view = render(React.createElement(StockerApp));
    await say('nexxt');
    mocks.state = { ...mocks.state, pickingRevision: 'revision-two' };
    view.rerender(React.createElement(StockerApp));
    await say('yes');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith('That confirmation expired. Please say the command again.');
  });

  it('refuses an affirmative response after a confirmation expires', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      render(React.createElement(StockerApp));
      await say('nexxt');
      clock.mockReturnValue(now + 15_001);
      await say('yes');
    } finally {
      clock.mockRestore();
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith('That confirmation expired. Please say the command again.');
  });

  it('invalidates a pending mutation when voice capture fails', async () => {
    render(React.createElement(StockerApp));
    await say('nexxt');
    act(() => mocks.options.onError?.('Voice connection lost'));
    await say('yes');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith('That confirmation expired. Please say the command again.');
  });

  it.each(['pause', 'mute'])('invalidates a pending mutation on an explicit %s', async hold => {
    render(React.createElement(StockerApp));
    await say('nexxt');
    await say(hold);
    await say('yes');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.speak).toHaveBeenLastCalledWith('That confirmation expired. Please say the command again.');
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
