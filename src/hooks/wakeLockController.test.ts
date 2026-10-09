import { describe, expect, it, vi } from 'vitest';
import { createWakeLockController } from './wakeLockController';

class FakeSentinel extends EventTarget {
  released = false;
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  });
}

describe('screen wake-lock lifecycle', () => {
  it('clears a browser-released sentinel and reacquires when the app is visible again', async () => {
    let hidden = false;
    const sentinels: FakeSentinel[] = [];
    const request = vi.fn(async () => {
      const next = new FakeSentinel();
      sentinels.push(next);
      return next as unknown as WakeLockSentinel;
    });
    const controller = createWakeLockController({
      getManager: () => ({ request } as unknown as WakeLock),
      isHidden: () => hidden,
    });

    expect(await controller.start('route-start')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    hidden = true;
    await sentinels[0].release();
    expect(request).toHaveBeenCalledTimes(1);

    hidden = false;
    expect(await controller.refresh('visible')).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not undo an intentional Pause by reacquiring from the release event', async () => {
    const sentinel = new FakeSentinel();
    const request = vi.fn(async () => sentinel as unknown as WakeLockSentinel);
    const controller = createWakeLockController({
      getManager: () => ({ request } as unknown as WakeLock),
      isHidden: () => false,
    });

    await controller.start('route-start');
    await controller.stop('pause');

    expect(controller.isWanted()).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reacquires on the same Resume path used by the on-screen button', async () => {
    const request = vi.fn(async () => new FakeSentinel() as unknown as WakeLockSentinel);
    const controller = createWakeLockController({
      getManager: () => ({ request } as unknown as WakeLock),
      isHidden: () => false,
    });

    await controller.start('route-start');
    await controller.stop('pause');
    expect(await controller.start('resume')).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
