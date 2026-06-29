import { describe, it, expect } from 'vitest';
import { pickKey } from './restoreKey';

describe('pickKey — restore-after-refresh dedup', () => {
  it('two blank-slot items at different sequence positions do NOT collide (the bug)', () => {
    const a = { machineName: 'M1', item_index: 3, slot: '', product: 'Coke' };
    const b = { machineName: 'M1', item_index: 4, slot: '', product: 'Coke' };
    expect(pickKey(a)).not.toBe(pickKey(b));
  });

  it('the same item produces the same key (so a true duplicate is caught)', () => {
    const a = { machineName: 'M1', item_index: 3, slot: '', product: 'Coke' };
    expect(pickKey(a)).toBe(pickKey({ ...a }));
  });

  it('falls back to slot when there is no sequence position (legacy saved data)', () => {
    expect(pickKey({ machineName: 'M1', slot: '5', product: 'Pepsi' })).toBe('M1:s5:Pepsi');
  });

  it('different machines never collide on the same slot + product', () => {
    const a = { machineName: 'M1', slot: '1', product: 'Coke' };
    const b = { machineName: 'M2', slot: '1', product: 'Coke' };
    expect(pickKey(a)).not.toBe(pickKey(b));
  });
});
