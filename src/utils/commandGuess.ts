/**
 * BEST GUESS — what the picker probably meant, when the exact matcher has nothing.
 *
 * THE PROBLEM (found 2026-07-30 by the state × command × timing survey)
 *
 * The exact matcher is all-or-nothing: it answers with full certainty or with nothing at all.
 * There is no "maybe". So when the picker says something reasonable that simply isn't on the
 * list — "keep going", "forget this machine", "say that one more time" — the app answers
 * "I didn't catch that. Can you say that again?" and waits.
 *
 * Repeating it word-for-word gets the same answer. He loops, then gives up. That is what
 * "it keeps breaking" feels like from his side.
 *
 * WHAT THIS DOES
 *
 * Scores the phrase against how each command is actually spoken, and returns the best guess
 * with a score. The app then ASKS — "Next item?" — and acts on yes or no. A wrong guess costs
 * one word. Not guessing costs the whole interaction.
 *
 * No network, no AI, no state. Every phrase below came from reading the real matcher's output
 * on natural phrasings a picker would use.
 */

import { PickingCommand } from './commandRecognizer';

/**
 * How each command gets said in the wild, in the picker's own words.
 * These are MEANING phrases, not spellings — spelling errors are already handled by the
 * exact matcher's fuzzy tier. Order within a list does not matter.
 */
const INTENT_PHRASES: Partial<Record<PickingCommand, string[]>> = {
  [PickingCommand.NEXT_ITEM]: [
    'next', 'keep going', 'go on', 'onward', 'move along', 'carry on',
    'continue', 'after this', 'whats after', 'what comes next', 'following',
    'another', 'more', 'proceed', 'forward', 'ahead', 'lets go', 'go',
    // Verb forms a picker actually uses. This list is curated on purpose — it is why the
    // guess is predictable — so word endings get listed rather than stripped by a rule that
    // would also mangle words it shouldn't.
    'keep moving', 'moving', 'moving on', 'going', 'rolling', 'keep rolling',
  ],
  [PickingCommand.SKIP_MACHINE]: [
    'skip', 'forget this machine', 'forget it', 'pass on this', 'leave this machine',
    'this machine is done', 'done with this machine', 'finished this machine',
    'nothing here', 'empty', 'come back to this', 'later', 'move to the next machine',
    'go to the next machine', 'different machine', 'another machine',
  ],
  [PickingCommand.REPEAT]: [
    'repeat', 'again', 'one more time', 'say that again', 'i missed that',
    'i didnt hear', 'didnt catch', 'what was it', 'come again', 'pardon',
    'sorry what', 'once more', 'read it back',
  ],
  [PickingCommand.UNDO]: [
    'undo', 'go back', 'wrong', 'mistake', 'i grabbed the wrong', 'wrong one',
    'take that back', 'reverse', 'oops', 'my bad', 'scratch that', 'not that one',
  ],
  [PickingCommand.DIRECTION_TOP]: [
    'top', 'start at the top', 'from the top', 'top down', 'upper', 'above',
    'high', 'first row', 'start high',
  ],
  [PickingCommand.DIRECTION_BOTTOM]: [
    'bottom', 'start at the bottom', 'from the bottom', 'bottom up', 'lower',
    'below', 'low', 'last row', 'start low', 'underneath',
  ],
  [PickingCommand.INVENTORY_QUERY]: [
    'how many', 'how much', 'what is the count', 'par level', 'inventory',
    'quantity', 'amount', 'number',
  ],
};

/** Words carrying no meaning — they must not earn a command any credit. */
const NOISE = new Set([
  'the', 'a', 'an', 'to', 'of', 'is', 'it', 'this', 'that', 'i', 'im', 'me', 'my',
  'we', 'you', 'and', 'or', 'so', 'but', 'ok', 'okay', 'well', 'just', 'now', 'then',
  'lets', 'let', 'us', 'please', 'can', 'could', 'would', 'do', 'does', 'did', 'be',
  'was', 'are', 'for', 'on', 'in', 'at', 'with', 'one', 'thing', 'stuff',
]);

export interface CommandGuess {
  command: PickingCommand;
  /** 0–1. Higher means more of the phrase pointed at this command and nothing else. */
  score: number;
  /** The words that earned it — so a log line can show WHY it guessed. */
  matched: string[];
}

/**
 * Below this, the guess is not worth interrupting the picker with a question.
 * Chosen so a phrase must contribute at least one whole meaning-word, not a stray fragment.
 */
export const GUESS_ASK_THRESHOLD = 0.34;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !NOISE.has(w));
}

/**
 * The best guess for a phrase the exact matcher could not place.
 * Returns null when nothing meaningful pointed anywhere — the honest "I didn't catch that".
 */
export function guessCommand(transcript: string): CommandGuess | null {
  const said = words(transcript);
  if (said.length === 0) return null;

  const saidSet = new Set(said);
  let best: CommandGuess | null = null;
  let runnerUpScore = 0;

  for (const [command, phrases] of Object.entries(INTENT_PHRASES)) {
    const matched = new Set<string>();

    for (const phrase of phrases as string[]) {
      const phraseWords = words(phrase);
      if (phraseWords.length === 0) continue;

      // A multi-word phrase counts only if EVERY one of its words was said — "forget this
      // machine" must not fire on "machine" alone.
      const allPresent = phraseWords.every((w) => saidSet.has(w));
      if (allPresent) phraseWords.forEach((w) => matched.add(w));
    }

    if (matched.size === 0) continue;

    // Share of what he actually said that pointed at this command. Saying a lot of other
    // things dilutes it, which is what keeps "the truck is out front" from scoring.
    const score = matched.size / said.length;

    if (!best || score > best.score) {
      if (best) runnerUpScore = best.score;
      best = { command: command as PickingCommand, score, matched: [...matched] };
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (!best) return null;

  // A tie means two commands fit equally well — asking about one of them would be a coin flip
  // on the picker's stock. Say nothing rather than guess wrong.
  if (runnerUpScore >= best.score) return null;

  return best;
}

/** The question to ask, in the words the picker uses. */
export const CONFIRM_PROMPT: Partial<Record<PickingCommand, string>> = {
  [PickingCommand.NEXT_ITEM]: 'Next item?',
  [PickingCommand.SKIP_MACHINE]: 'Skip this machine?',
  [PickingCommand.REPEAT]: 'Say it again?',
  [PickingCommand.UNDO]: 'Go back one?',
  [PickingCommand.DIRECTION_TOP]: 'Start at the top?',
  [PickingCommand.DIRECTION_BOTTOM]: 'Start at the bottom?',
  [PickingCommand.INVENTORY_QUERY]: 'How many to load?',
};

/**
 * What the app says back: a question when it has a decent guess, the honest fallback when not.
 */
export function resolveUnknownReply(transcript: string): {
  ask: boolean;
  phrase: string;
  guess: CommandGuess | null;
} {
  const guess = guessCommand(transcript);

  if (guess && guess.score >= GUESS_ASK_THRESHOLD) {
    const prompt = CONFIRM_PROMPT[guess.command];
    if (prompt) return { ask: true, phrase: prompt, guess };
  }

  return { ask: false, phrase: "I didn't catch that. Can you say that again?", guess };
}
