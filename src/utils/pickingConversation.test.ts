import { describe, expect, it } from 'vitest';
import { pickingQuestionPrompt } from './pickingConversation';

describe('picking information prompt', () => {
  it('forbids invented package descriptions and generic help responses', () => {
    const prompt = pickingQuestionPrompt('Davy', {
      product: "Miss Vickie's 40g",
      quantity: 1,
      slot: '7',
      slot_spoken: 'slot 7',
      machineName: 'Machine 7',
    }, { availableRoutes: [], date: '2026-10-08', currentMachineName: 'Machine 7' });

    expect(prompt).toContain('Never add can, bottle, bag or another package word');
    expect(prompt).toContain('Never answer with a generic offer such as "What can I help with?"');
  });
});
