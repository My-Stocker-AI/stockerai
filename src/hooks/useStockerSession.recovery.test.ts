// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useStockerSession, MachineState } from './useStockerSession';

afterEach(cleanup);

it('retains the server revision and identity for the next command', async () => {
  const {result}=renderHook(() => useStockerSession(null));
  await act(() => result.current.updateFromTool('skip_current_machine', {
    action:'offer_go_back',picking_revision:'revision-new',session_id:'server-session',
  }));
  expect(result.current.routeState.pickingRevision).toBe('revision-new');
  expect(result.current.sessionId).toBe('server-session');
});
function setup() {
  const hook = renderHook(() => useStockerSession(null));
  const machines: MachineState[] = [
    { id: 'm1', name: 'Skipped', location: 'Test', sequence: 1, totalItems: 10, completedItems: 2, skippedAtItem: 2, status: 'skipped' },
    { id: 'm2', name: 'Done', location: 'Test', sequence: 2, totalItems: 3, completedItems: 3, status: 'completed' },
    { id: 'm3', name: 'Current', location: 'Test', sequence: 3, totalItems: 5, completedItems: 4, status: 'in_progress' },
  ];
  act(() => hook.result.current.setRouteState(prev => ({ ...prev, routeId: 'route', routeName: 'Fixture', machines,
    totalMachines: 3, currentMachineId: 'm3', currentMachineName: 'Current', currentMachineIndex: 3,
    currentMachineTotalItems: 5, currentMachineItemsRemaining: 1,
    currentItem: { product: 'Last', quantity: 1, slot: '1', slot_spoken: 'one' },
  })));
  return hook;
}

it('keeps a completion handoff to skipped work skipped until it is started', async () => {
  const { result } = setup();
  await act(() => result.current.updateFromTool('get_next_item', {
    action: 'next_machine', next_machine_id: 'm1', next_machine: 'Skipped', returning_to_skipped: true,
  }));
  expect(result.current.routeState.currentMachineIndex).toBe(1);
  expect(result.current.routeState.machines[0].status).toBe('skipped');
  expect(result.current.routeState.machines[2].status).toBe('completed');
  expect(result.current.routeState.pendingMachineTransition?.nextMachineId).toBe('m1');
});

it('a wrapped skip shows the actual destination index and progress', async () => {
  const { result } = setup();
  await act(() => result.current.updateFromTool('skip_current_machine', {
    action: 'next_machine', skipped_machine_id: 'm3', next_machine_id: 'm1', next_machine: 'Skipped',
  }));
  const state = result.current.routeState;
  expect(state.currentMachineIndex).toBe(1);
  expect(state.pendingMachineTransition?.nextMachineIndex).toBe(1);
  expect(state.currentMachineTotalItems).toBe(10);
  expect(state.currentMachineItemsRemaining).toBe(8);
  expect(state.machines[2].status).toBe('skipped');
});

it('an offer preserves unfinished work and clears both displayed items', async () => {
  const { result } = setup();
  await act(() => result.current.updateFromTool('skip_current_machine', { action: 'offer_go_back', skipped_machine_id: 'm3' }));
  const state = result.current.routeState;
  expect(state.completed).toBe(false);
  expect(state.sessionInvalidated).not.toBe(true);
  expect(state.currentItem).toBeNull();
  expect(state.currentItem2).toBeNull();
  expect(state.pendingMachineTransition).toBeNull();
  expect(state.machines[2].completedItems).toBe(4);
});

it('returning to skipped work does not reopen the completed previous machine', async () => {
  const { result } = setup();
  act(() => result.current.setRouteState(prev => ({ ...prev, currentMachineId: 'm2', currentMachineIndex: 2 })));
  await act(() => result.current.updateFromTool('go_back_to_skipped', {
    action: 'machine_ready', machine_id: 'm1', machine_name: 'Skipped', total_items: 10, completed_items: 2,
  }));
  const state = result.current.routeState;
  expect(state.machines[1].status).toBe('completed');
  expect(state.machines[0].status).toBe('pending');
  expect(state.currentMachineIndex).toBe(1);
  expect(state.currentItem).toBeNull();
  expect(state.pendingMachineTransition?.nextMachineIndex).toBe(1);
});

it('a failed start preserves the destination and its pending direction', async () => {
  const { result } = setup();
  act(() => result.current.setRouteState(prev => ({ ...prev,
    pendingMachineTransition: { nextMachineId: 'm3', nextMachineName: 'Current', nextMachineIndex: 3 },
  })));
  const before = result.current.routeState;
  await act(() => result.current.updateFromTool('start_machine', { error: 'Rejected' }));
  expect(result.current.routeState).toEqual(before);
});
