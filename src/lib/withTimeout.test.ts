import { describe, expect, it, vi } from 'vitest';
import { OperationTimeoutError, withTimeout } from './withTimeout';

describe('withTimeout', () => {
  it('returns an operation result before the deadline', async () => {
    await expect(withTimeout(Promise.resolve('ready'), 100, 'too slow')).resolves.toBe('ready');
  });

  it('rejects a stalled operation at the deadline', async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<string>(() => undefined), 100, 'too slow');
    const assertion = expect(result).rejects.toEqual(new OperationTimeoutError('too slow'));
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    vi.useRealTimers();
  });
});
