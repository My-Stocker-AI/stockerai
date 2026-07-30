/**
 * VOICE FAILURE SPEECH — should the app SAY something when voice trouble hits?
 *
 * Proof, not a claim. Davy's 2026-07-12 route died at machine 3 of 6: the app froze after a
 * barge-in, and — this is the part that ended the route — it never told him. He was holding
 * stock, not watching the screen. handleVoiceError in StockerApp.tsx put text on screen and
 * spoke nothing, so a recovery and a permanent death looked and sounded identical to him:
 * silence. He could not tell "it's working again" from "it's still dead", so he stopped.
 *
 * This module decides ONLY whether to speak and what to say. It holds no state and touches no
 * DOM (house style, per voiceHandoffPolicy.ts / reconnectPolicy.ts) so the decision can be
 * unit-tested without mounting the app.
 *
 * The risk being managed is nagging. A phone that talks over a picker in a loud warehouse is
 * worse than one that stays quiet — so speech is deliberately rationed:
 *   - only while a pick is actually in progress (no talking on an idle screen)
 *   - only for failures the picker can act on, never for internal noise
 *   - never the same line twice in a row (a reconnect loop must not become a chant)
 *
 * Spec: .xf/specs/2026-07-30-voice-sibling-fixes-xffi.md
 */

/** What the picker is told. Short, spoken aloud, hands-free — not the app's internal wording. */
export type FailureSpeech =
  | { speak: false; reason: 'no-active-pick' | 'not-actionable' | 'already-said' }
  | { speak: true; phrase: string; kind: FailureKind };

export type FailureKind = 'reconnecting' | 'recovered' | 'needs-tap' | 'mic-blocked';

/**
 * Classify a raw failure message into what the picker actually needs to hear.
 * Returns null when the message is internal noise the picker cannot act on.
 */
export function classifyFailure(errorMsg: string): FailureKind | null {
  const m = (errorMsg || '').toLowerCase();

  // Mic is blocked at the OS/browser level — he must fix it, and cannot from the pick screen.
  if (
    m.includes('permission') ||
    m.includes('not allowed') ||
    m.includes('notallowed') ||
    m.includes('denied') ||
    m.includes('microphone is in use') ||
    m.includes('no microphone')
  ) {
    return 'mic-blocked';
  }

  // Voice stopped and will NOT come back on its own — he must tap.
  if (m.includes('tap to reconnect') || m.includes('tap to resume') || m.includes('another window')) {
    return 'needs-tap';
  }

  // Voice is coming back by itself — he should wait, not repeat himself.
  if (m.includes('reconnect')) return 'reconnecting';

  // Voice is back after a stall — the line that ends the "is it dead?" doubt.
  if (m.includes('listening again') || m.includes('recovered') || m.includes('back')) {
    return 'recovered';
  }

  // Rate limits, transport codes, anything else: on screen only. He cannot act on it.
  return null;
}

/** The words spoken aloud. Deliberately short — a picker with his hands full, in a loud room. */
export const FAILURE_PHRASES: Record<FailureKind, string> = {
  reconnecting: 'One moment, reconnecting.',
  recovered: "I'm listening again.",
  'needs-tap': 'Voice stopped. Tap the screen to start it again.',
  'mic-blocked': 'I can’t hear you. Check the microphone permission.',
};

/**
 * The whole decision: speak, or stay quiet and why.
 *
 * @param errorMsg   the raw failure text useVoice emitted
 * @param hasCurrentItem  is a pick actually in progress right now
 * @param lastSpokenKind  the kind spoken most recently in this session, if any
 */
export function resolveFailureSpeech(args: {
  errorMsg: string;
  hasCurrentItem: boolean;
  lastSpokenKind: FailureKind | null;
}): FailureSpeech {
  const { errorMsg, hasCurrentItem, lastSpokenKind } = args;

  const kind = classifyFailure(errorMsg);
  if (kind === null) return { speak: false, reason: 'not-actionable' };

  // A blocked mic is the one thing worth saying even off a pick — he is stuck either way and
  // nothing else in the app will tell him out loud.
  if (!hasCurrentItem && kind !== 'mic-blocked') {
    return { speak: false, reason: 'no-active-pick' };
  }

  // Never chant. A reconnect loop firing the same message repeatedly must speak once.
  if (kind === lastSpokenKind) return { speak: false, reason: 'already-said' };

  return { speak: true, phrase: FAILURE_PHRASES[kind], kind };
}
