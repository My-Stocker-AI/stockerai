import { describe, expect, it } from 'vitest';
import { PickingCommand } from './commandRecognizer';
import {
  capturePendingConfirmation,
  invalidatePendingConfirmation,
  pendingConfirmationStatus,
  PENDING_CONFIRMATION_MAX_AGE_MS,
} from './pendingCommandConfirmation';

describe('pending command confirmation', () => {
  it('accepts the original command only in its original live context', () => {
    const pending = capturePendingConfirmation(PickingCommand.NEXT_ITEM, 'route:revision:item', 100);
    expect(pending.command).toBe(PickingCommand.NEXT_ITEM);
    expect(pendingConfirmationStatus(pending, 'route:revision:item', 101)).toBe('current');
    expect(pendingConfirmationStatus(pending, 'route:new-revision:item', 101)).toBe('context-changed');
  });

  it('expires instead of authorizing an old mutation', () => {
    const pending = capturePendingConfirmation(PickingCommand.SKIP_MACHINE, 'context', 100);
    expect(pendingConfirmationStatus(pending, 'context', 100 + PENDING_CONFIRMATION_MAX_AGE_MS)).toBe('current');
    expect(pendingConfirmationStatus(pending, 'context', 101 + PENDING_CONFIRMATION_MAX_AGE_MS)).toBe('expired');
  });

  it('retains an invalidation tombstone so a later yes cannot become a fresh command', () => {
    const pending = capturePendingConfirmation(PickingCommand.NEXT_ITEM, 'context', 100);
    const invalidated = invalidatePendingConfirmation(pending);
    expect(invalidated && pendingConfirmationStatus(invalidated, 'context', 101)).toBe('invalidated');
  });
});
