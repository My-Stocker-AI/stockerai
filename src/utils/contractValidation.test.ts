import { describe, expect, it, vi } from 'vitest';
import { validateWorkflowOutput } from './contractValidation';

describe('validateWorkflowOutput', () => {
  it('rejects malformed spoken and counter values without throwing', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = validateWorkflowOutput({
      action: 'item_ready',
      spoken: { text: 'not a string' },
      machine_id: 'machine-1',
      items_remaining: 'two',
      item1: {},
      machine_total_items: 'ten',
    }, 'get_next_item');

    expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.rule)).toEqual(expect.arrayContaining([
      'spoken text required - frontend MUST NOT generate own text',
      'machine_total_items must be > 0',
      'items_remaining must be a non-negative number',
    ]));
    consoleError.mockRestore();
  });

  it('accepts a valid item-ready workflow boundary', () => {
    const result = validateWorkflowOutput({
      action: 'item_ready',
      spoken: 'Pick the next item.',
      machine_id: 'machine-1',
      items_remaining: 2,
      item1: { product: 'Snack' },
      machine_total_items: 5,
    }, 'get_next_item');

    expect(result).toEqual({ valid: true, errors: [] });
  });
});
