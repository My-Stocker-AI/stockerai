import { describe, it, expect } from 'vitest';
import { CommandRecognizer, PickingCommand } from './commandRecognizer';

/**
 * THE HELP SHEET IS A PROMISE. THIS HOLDS IT TO IT.
 *
 * Every phrase below is printed to the driver inside the app (src/components/stocker/HelpSheet.tsx)
 * as something he can say. Nothing checked that the app could actually understand any of them.
 *
 * An audit on 2026-08-06, after Davy's live route, found 11 of 31 unrecognised — and two that
 * answered a DIFFERENT question with full confidence, which is worse than silence because
 * nothing tells him he was misheard.
 *
 * The help sheet and the matcher were two versions of the same truth, drifting apart with
 * nothing comparing them. This test is the comparison. If a phrase is added to the help sheet
 * it belongs here too, and if it cannot be understood the test says so before a driver does.
 *
 * NOTE ON WHAT IS ASSERTED: for questions the app answers from its own state, UNKNOWN is an
 * acceptable result ONLY where the app deliberately hands the phrase to the semantic path
 * instead of pattern-matching it. Those are marked `semantic`. Everything else must resolve
 * locally, because actions have to work instantly and without a network.
 */

type Expect = PickingCommand | 'semantic';

const PROMISES: Array<{ phrase: string; expect: Expect; from: string }> = [
  // — Getting the next item —
  { phrase: 'next', expect: PickingCommand.NEXT_ITEM, from: 'core' },
  { phrase: 'got it', expect: PickingCommand.NEXT_ITEM, from: 'natural speech' },
  { phrase: 'yep', expect: PickingCommand.AFFIRMATIVE, from: 'natural speech' },

  // — Checking inventory —
  { phrase: 'how many are in the machine', expect: PickingCommand.INVENTORY_QUERY, from: 'inventory' },
  { phrase: "what's the current inventory", expect: PickingCommand.INVENTORY_QUERY, from: 'inventory' },
  { phrase: "what's the par level", expect: PickingCommand.INVENTORY_QUERY, from: 'inventory' },
  { phrase: 'how many should be in there', expect: PickingCommand.INVENTORY_QUERY, from: 'inventory' },

  // — Starting a machine —
  { phrase: 'start from the top', expect: PickingCommand.DIRECTION_TOP, from: 'starting' },
  { phrase: 'stock from the beginning', expect: PickingCommand.DIRECTION_TOP, from: 'starting' },
  { phrase: 'start from the bottom', expect: PickingCommand.DIRECTION_BOTTOM, from: 'starting' },
  { phrase: 'work from the end of the list', expect: PickingCommand.DIRECTION_BOTTOM, from: 'starting' },

  // — Skipping a machine —
  { phrase: 'skip this machine', expect: PickingCommand.SKIP_MACHINE, from: 'skipping' },
  { phrase: 'go to the next machine', expect: PickingCommand.SKIP_MACHINE, from: 'skipping' },
  { phrase: 'come back to this one later', expect: PickingCommand.SKIP_MACHINE, from: 'skipping' },

  // — Hearing an item again (must NOT move him) —
  { phrase: 'repeat that', expect: PickingCommand.REPEAT, from: 'hear again' },
  { phrase: 'say that again', expect: PickingCommand.REPEAT, from: 'hear again' },

  // — Going back an item (DOES move him) —
  { phrase: 'go back', expect: PickingCommand.PREVIOUS_ITEM, from: 'go back an item' },
  { phrase: 'previous item', expect: PickingCommand.PREVIOUS_ITEM, from: 'go back an item' },
  { phrase: 'back one', expect: PickingCommand.PREVIOUS_ITEM, from: 'go back an item' },

  // — Undoing a pick —
  { phrase: 'undo that', expect: PickingCommand.UNDO, from: 'undo' },
  { phrase: 'oops that was wrong', expect: PickingCommand.UNDO, from: 'undo' },
  { phrase: 'that was a mistake', expect: PickingCommand.UNDO, from: 'undo' },

  // — Returning to a skipped machine (the whole phrase, not bare "go back") —
  { phrase: 'go back to the skipped machine', expect: PickingCommand.GO_BACK, from: 'return to skipped' },
  { phrase: 'skipped machine', expect: PickingCommand.GO_BACK, from: 'return to skipped' },

  // — Waking it —
  { phrase: 'ok stocker', expect: PickingCommand.WAKE_ONLY, from: 'pause & wake' },

  // — Questions answered from state. These go to the semantic path on purpose: they change
  //   nothing, they are not time-critical, and a driver phrases them a hundred ways.
  { phrase: 'which machines did i skip', expect: 'semantic', from: 'progress' },
  { phrase: 'how many machines have we skipped', expect: 'semantic', from: 'Davy asked this live' },
  { phrase: 'what slot am i on', expect: 'semantic', from: 'Davy asked this live' },
  { phrase: 'what item number am i on', expect: 'semantic', from: 'Davy asked this live' },
  { phrase: "what's my progress", expect: 'semantic', from: 'progress' },
  { phrase: 'what route am i on', expect: 'semantic', from: 'progress' },
  { phrase: 'which machine am i working on', expect: PickingCommand.WHICH_MACHINE, from: 'progress' },
  { phrase: 'how many machines are left', expect: PickingCommand.MACHINES_LEFT, from: 'progress' },
];

describe('the in-app help sheet promises only what the app can actually do', () => {
  const r = new CommandRecognizer();

  for (const { phrase, expect: want, from } of PROMISES) {
    it(`"${phrase}" (help: ${from})`, () => {
      const got = r.recognize(phrase);

      if (want === 'semantic') {
        // Must NOT be claimed by a pattern. A confident wrong answer is worse than no answer —
        // it sends the driver away believing a number that answers a question he did not ask.
        expect(
          got.command,
          `"${phrase}" is meant for the semantic path but a pattern claimed it as ${got.command}`,
        ).toBe(PickingCommand.UNKNOWN);
        return;
      }

      expect(
        got.command,
        `the app tells the driver he can say "${phrase}", and it resolves to ${got.command}`,
      ).toBe(want);
      expect(got.confidence).toBeGreaterThanOrEqual(0.7);
    });
  }
});
