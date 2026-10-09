import { describe, expect, it } from 'vitest';
import { directionRetryPrompt } from './voicePrompts';

describe('direction retry wording', () => {
  it('does not claim the driver spoke when the recognizer received noise without text', () => {
    const prompt = directionRetryPrompt();
    expect(prompt).toBe("No problem. When you're ready, say top or bottom.");
    expect(prompt).not.toMatch(/i heard|you said|didn't catch/i);
  });

  it('can keep the driver oriented without sounding accusatory', () => {
    expect(directionRetryPrompt('Machine 7')).toBe(
      "No problem. When you're ready, say top or bottom for Machine 7.",
    );
  });
});
