import { describe, expect, it } from 'vitest';
import { buildDeepgramKeywordParams, DEEPGRAM_CRITICAL_COMMANDS } from './deepgramKeywords';

describe('buildDeepgramKeywordParams', () => {
  it('repeats the documented keywords parameter and weights critical directions', () => {
    const result = buildDeepgramKeywordParams(
      ['top', 'bottom'],
      ['next', 'South Route'],
    );
    expect(result).toBe(
      '&keywords=top%3A3&keywords=bottom%3A3&keywords=next%3A1.5&keywords=South%20Route%3A1.5',
    );
    expect(result).not.toContain('keywords_boost');
    expect(result).not.toContain('top%2Cbottom');
  });

  it('drops empty and duplicate terms', () => {
    expect(buildDeepgramKeywordParams(['top'], ['TOP', '', 'next']))
      .toBe('&keywords=top%3A3&keywords=next%3A1.5');
  });

  it('boosts next alongside the direction words that failed in field use', () => {
    expect(DEEPGRAM_CRITICAL_COMMANDS).toContain('next');
    expect(buildDeepgramKeywordParams(DEEPGRAM_CRITICAL_COMMANDS, ['next']))
      .toContain('&keywords=next%3A3');
  });
});
