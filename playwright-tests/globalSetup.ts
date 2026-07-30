/**
 * Runs once before the browser suite.
 *
 * It used to say "using existing routes in database - no setup needed" and do nothing, which
 * meant every test ran against whatever data happened to be there — including routes Davy
 * abandoned mid-pick. A test that passes because the data lined up proves nothing.
 *
 * Now each test seeds and removes its own route (see fixtures/test.ts). This step only clears
 * leftovers from a run that crashed before it could clean up after itself. It deletes nothing
 * except routes the fixture system created — real routes are filtered out by name.
 */

import { sweepStaleFixtures } from './fixtures/seedRoute';

async function globalSetup() {
  try {
    const removed = await sweepStaleFixtures();
    console.log(
      removed > 0
        ? `[Global Setup] Cleared ${removed} leftover test route(s) from an earlier run.`
        : '[Global Setup] No leftover test routes. Clean start.',
    );
  } catch (err) {
    // Not fatal: a suite that never seeds (the smoke tests) should still run.
    console.warn(`[Global Setup] Could not check for leftover test routes: ${(err as Error).message}`);
  }
}

export default globalSetup;
