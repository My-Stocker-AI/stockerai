import type { PickingCommand } from './commandRecognizer';

export const PENDING_CONFIRMATION_MAX_AGE_MS = 15_000;

export interface PendingCommandConfirmation {
  command: PickingCommand;
  contextKey: string;
  createdAt: number;
  invalidated?: boolean;
}

export type PendingConfirmationStatus = 'current' | 'expired' | 'context-changed' | 'invalidated';

export function capturePendingConfirmation(
  command: PickingCommand,
  contextKey: string,
  now = Date.now(),
): PendingCommandConfirmation {
  return { command, contextKey, createdAt: now };
}

export function invalidatePendingConfirmation(
  pending: PendingCommandConfirmation | null,
): PendingCommandConfirmation | null {
  return pending ? { ...pending, invalidated: true } : null;
}

export function pendingConfirmationStatus(
  pending: PendingCommandConfirmation,
  contextKey: string,
  now = Date.now(),
): PendingConfirmationStatus {
  if (pending.invalidated) return 'invalidated';
  if (pending.contextKey !== contextKey) return 'context-changed';
  if (now - pending.createdAt > PENDING_CONFIRMATION_MAX_AGE_MS) return 'expired';
  return 'current';
}
