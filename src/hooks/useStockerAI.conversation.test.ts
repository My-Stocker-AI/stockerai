// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/authFetch', () => ({ authFetch: mocks.fetch }));
import { useStockerAI } from './useStockerAI';
import type { ConversationContext } from '@/utils/pickingConversation';

const context: ConversationContext = {
  availableRoutes: ['Fixture route'], date: '2099-01-01', currentRouteName: 'Fixture route',
  currentMachineId: 'second', currentMachineName: 'Second fixture', currentMachineIndex: 2,
  totalMachines: 3, completedItemsCount: 4, totalItems: 12,
  machines: [{ id: 'first', name: 'First fixture', status: 'completed' },
    { id: 'second', name: 'Second fixture', status: 'in_progress' }],
  pendingMachineTransition: null, currentItem2: { product: 'Original coffee', quantity: 3, slot: 'B2', slot_spoken: 'B two', machineName: 'Second fixture' },
};
const item = { product: 'Mocha coffee', quantity: 2, slot: 'B1', slot_spoken: 'B one', machineName: 'Second fixture' };
const history = [{ role: 'assistant', content: 'Start First fixture from top or bottom?' },
  { role: 'user', content: 'Is it mocha or original?' }];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Mocha and original.' } }] })));
});
afterEach(cleanup);

it('answers active picking questions using authoritative state without obsolete setup instructions or history', async () => {
  const { result } = renderHook(useStockerAI);
  await result.current.sendToAI(history, 'Fixture', item, context);
  const request = JSON.parse(mocks.fetch.mock.calls[0][1].body);
  expect(request.messages[0].content).toContain('CURRENT MACHINE: Second fixture');
  expect(request.messages[0].content).toContain('Mocha coffee');
  expect(request.messages[0].content).toContain('Original coffee');
  expect(request.messages[0].content).not.toContain('ROUTE SELECTION MODE');
  expect(request.messages.slice(1)).toEqual([history[1]]);
  expect(request.tools).toBeUndefined();
});

it('refuses model-invented tool calls during a picking question', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: {
    content: 'Starting First fixture.', tool_calls: [{ id: 'bad', function: { name: 'start_machine', arguments: '{}' } }],
  } }] })));
  const { result } = renderHook(useStockerAI);
  const response = await result.current.sendToAI(history, 'Fixture', item, context);
  expect(response.tool_calls).toBeUndefined();
  expect(response.content).not.toContain('Starting First fixture');
  expect(response.content).toContain('repeat');
});

it('retains route-selection tools before a route is selected', async () => {
  const { result } = renderHook(useStockerAI);
  await result.current.sendToAI([{ role: 'user', content: 'Fixture route' }], 'Fixture', null,
    { availableRoutes: ['Fixture route'], date: '2099-01-01' });
  const request = JSON.parse(mocks.fetch.mock.calls[0][1].body);
  expect(request.messages[0].content).toContain('ROUTE SELECTION MODE');
  expect(request.tools.some((tool: { function: { name: string } }) => tool.function.name === 'set_route_sequence')).toBe(true);
});
