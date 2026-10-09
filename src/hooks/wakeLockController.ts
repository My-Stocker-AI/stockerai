export interface WakeLockController {
  start(reason: string): Promise<boolean>;
  stop(reason: string): Promise<void>;
  refresh(reason: string): Promise<boolean>;
  isWanted(): boolean;
}

interface WakeLockControllerOptions {
  getManager: () => WakeLock | undefined;
  isHidden: () => boolean;
  onEvent?: (event: string, detail: unknown) => void;
}

/**
 * Owns the screen wake-lock lifecycle for one voice session.
 *
 * Browsers release a WakeLockSentinel whenever the app is backgrounded. The released sentinel
 * must be cleared before the app can request another one, and an intentional Pause/Stop must not
 * immediately reacquire the lock from the sentinel's release event.
 */
export function createWakeLockController({
  getManager,
  isHidden,
  onEvent,
}: WakeLockControllerOptions): WakeLockController {
  let wanted = false;
  let sentinel: WakeLockSentinel | null = null;
  let requestInFlight: Promise<boolean> | null = null;

  const request = async (reason: string): Promise<boolean> => {
    if (!wanted || isHidden()) return false;
    if (sentinel && !sentinel.released) return true;
    sentinel = null;
    if (requestInFlight) return requestInFlight;

    const manager = getManager();
    if (!manager) {
      onEvent?.('unsupported', { reason });
      return false;
    }

    const operation = (async () => {
      try {
        const acquired = await manager.request('screen');
        if (!wanted || isHidden()) {
          await acquired.release().catch(() => undefined);
          return false;
        }

        sentinel = acquired;
        onEvent?.('acquired', { reason });
        acquired.addEventListener('release', () => {
          if (sentinel === acquired) sentinel = null;
          onEvent?.('released', { reason });
          // A visible browser can revoke a lock for power-management reasons. Re-request only
          // while an active voice session still wants it; Pause and Stop set wanted=false first.
          if (wanted && !isHidden()) void request('released-while-visible');
        }, { once: true });
        return true;
      } catch (error) {
        onEvent?.('rejected', {
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      } finally {
        requestInFlight = null;
      }
    })();

    requestInFlight = operation;
    return operation;
  };

  return {
    async start(reason: string) {
      wanted = true;
      return request(reason);
    },
    async stop(reason: string) {
      wanted = false;
      const active = sentinel;
      sentinel = null;
      if (!active || active.released) return;
      try {
        await active.release();
        onEvent?.('released-intentionally', { reason });
      } catch (error) {
        onEvent?.('release-failed', {
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    refresh(reason: string) {
      return request(reason);
    },
    isWanted() {
      return wanted;
    },
  };
}
