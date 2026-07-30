/**
 * Tests for command recognition fixes:
 * 1. pendingMachineTransition clearing after start_machine (next works after OK)
 * 2. Last-item notification prefix in voice responses
 */

// Seeds a throwaway 3-machine × 5-item route before each test and deletes it afterwards.
// Until 2026-07-30 these tests said "start North route" — Davy Dupon's REAL route from
// 2026-07-10 — so every run rewrote his live pick history. They also assumed 3 machines of
// 5 items, which North (2 machines, 159 items) never matched, so they could not have passed
// honestly either. Both problems go away with a route the test owns.
import { test, expect } from './fixtures/test';

// Helper to inject transcript directly (bypasses real voice)
async function injectTranscript(page: any, text: string) {
  await page.evaluate((transcript: string) => {
    (window as any).__testInjectTranscript(transcript);
  }, text);
  // Wait for processing to complete
  await page.waitForTimeout(500);
}

// Helper to set up mock Supabase auth session
async function setupMockAuth(page: any) {
  // Mock auth session in localStorage (Supabase storage key)
  // Use REAL user UUID (russ@visionairy.biz) - matches globalSetup.ts
  const mockSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: 'bdc96b72-3f35-4cae-9e79-99473eb4a23b', // REAL user UUID
      email: 'russ@visionairy.biz',
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  };

  await page.addInitScript((session: any) => {
    // Supabase stores session in localStorage with a specific key format
    const supabaseKey = 'sb-wvtkuposrlvadyeixlke-auth-token';
    localStorage.setItem(supabaseKey, JSON.stringify(session));
  }, mockSession);
}

test.describe('Command Recognition Fixes', () => {
  // Requesting fixtureRoute here guarantees the route exists in the database BEFORE the app
  // loads and asks for today's routes.
  test.beforeEach(async ({ page, fixtureRoute }) => {
    console.log(`[Test] seeded route: ${fixtureRoute.routeName}`);

    // Set up mock authentication
    await setupMockAuth(page);

    // Navigate to app (will use mock session)
    await page.goto('http://localhost:8080/app');

    // Wait for initialization
    await page.waitForSelector('text=Hi', { timeout: 10000 });

    // Clear any AI conversation history to prevent tool_call state errors
    await page.evaluate(() => {
      localStorage.removeItem('stocker-ai-conversation');
    });
    await page.reload();
    await page.waitForSelector('text=Hi', { timeout: 10000 });
  });

  test('Fix 1: "next" command works after "OK" during machine transition', async ({ page, fixtureRoute }) => {
    /**
     * Reproduces the bug where:
     * 1. Machine completes → pendingMachineTransition set
     * 2. User says "OK" → start_machine called
     * 3. User says "next" → BLOCKED (should work)
     * 4. User says "OK" again → Works via fallback
     *
     * Expected after fix:
     * - "next" should work immediately after "OK" starts machine
     */

    // Start a route (assumes test route exists)
    await injectTranscript(page, `start ${fixtureRoute.spokenName} route`);
    await page.waitForTimeout(2000);

    // Choose direction for first machine
    await injectTranscript(page, 'top');
    await page.waitForTimeout(2000);

    // Pick items until machine 1 completes
    // Assuming 5 items per machine in test data
    for (let i = 0; i < 4; i++) {
      await injectTranscript(page, 'next');
      await page.waitForTimeout(1000);
    }

    // Last item triggers machine transition
    await injectTranscript(page, 'next');
    await page.waitForTimeout(2000);

    // Should hear: "Machine 1 complete. Next is Machine 2. Ready to go?"
    // Verify we're at transition point
    const response1 = await page.textContent('[data-testid="ai-response"]') ||
                      await page.textContent('.text-center.text-lg');
    expect(response1).toContain('complete');

    // Say "OK" to start machine 2
    console.log('[Test] User says OK to start machine 2');
    await injectTranscript(page, 'OK');
    await page.waitForTimeout(2000);

    // Verify machine 2 started (should see first item)
    const response2 = await page.textContent('[data-testid="ai-response"]') ||
                      await page.textContent('.text-center.text-lg');
    console.log('[Test] After OK, response:', response2);

    // CRITICAL TEST: Say "next" - should work, NOT be blocked
    console.log('[Test] User says "next" - should work (not blocked)');
    await injectTranscript(page, 'next');
    await page.waitForTimeout(2000);

    // Verify "next" worked (should see second item, NOT "Top or bottom?" prompt)
    const response3 = await page.textContent('[data-testid="ai-response"]') ||
                      await page.textContent('.text-center.text-lg');
    console.log('[Test] After "next", response:', response3);

    // Should NOT contain direction prompt
    expect(response3).not.toContain('Top or bottom');
    expect(response3).not.toContain('didn\'t catch that');

    // Should show item details (product name or count)
    expect(response3.length).toBeGreaterThan(0);
  });

  test('Fix 2: Last-item notification prefix (1-pick mode)', async ({ page, fixtureRoute }) => {
    /**
     * Tests that the last item in a machine is prefaced with:
     * "This is the last item. [product details]"
     */

    // Start a route in 1-pick mode
    await injectTranscript(page, `start ${fixtureRoute.spokenName} route`);
    await page.waitForTimeout(2000);

    await injectTranscript(page, 'top');
    await page.waitForTimeout(2000);

    // Pick items until second-to-last
    // Assuming 5 items per machine
    for (let i = 0; i < 3; i++) {
      await injectTranscript(page, 'next');
      await page.waitForTimeout(1000);
    }

    // Say "next" for the last item
    console.log('[Test] Getting last item in machine (1-pick mode)');
    await injectTranscript(page, 'next');
    await page.waitForTimeout(2000);

    // Check response contains last-item prefix
    const response = await page.textContent('[data-testid="ai-response"]') ||
                     await page.textContent('.text-center.text-lg');
    console.log('[Test] Last item response:', response);

    // Should contain "This is the last item"
    expect(response).toContain('last item');
    // Should be singular (not "last 2 items")
    expect(response).not.toContain('last 2 items');
  });

  test('Fix 2: Last-item notification prefix (2-pick mode)', async ({ page, fixtureRoute }) => {
    /**
     * Tests that the last 2 items in a machine are prefaced with:
     * "These are the last 2 items. [product details]"
     */

    // Enable 2-pick mode in localStorage
    await page.evaluate(() => {
      localStorage.setItem('stocker-call-two-items', 'true');
    });

    // Start a route
    await injectTranscript(page, `start ${fixtureRoute.spokenName} route`);
    await page.waitForTimeout(2000);

    await injectTranscript(page, 'top');
    await page.waitForTimeout(2000);

    // Pick items until last 2 remain
    // With 5 items total, first call shows 1-2, second call shows 3-4
    await injectTranscript(page, 'next');
    await page.waitForTimeout(1000);

    // Say "next" for the last 2 items (items 3-4)
    console.log('[Test] Getting last 2 items in machine (2-pick mode)');
    await injectTranscript(page, 'next');
    await page.waitForTimeout(2000);

    // Check response contains last-item prefix (plural)
    const response = await page.textContent('[data-testid="ai-response"]') ||
                     await page.textContent('.text-center.text-lg');
    console.log('[Test] Last 2 items response:', response);

    // Should contain "These are the last 2 items"
    expect(response).toContain('last 2 items');
    // Should be plural (not singular)
    expect(response).not.toContain('This is the last item.');
  });

  test('Fix 2: Last-item notification with odd count (2-pick mode)', async ({ page, fixtureRoute }) => {
    /**
     * Edge case: 2-pick mode, but only 1 item remains
     * Should say "This is the last item" (singular), not "These are the last 2 items"
     */

    // Enable 2-pick mode
    await page.evaluate(() => {
      localStorage.setItem('stocker-call-two-items', 'true');
    });

    // Start a route with 5 items per machine
    await injectTranscript(page, `start ${fixtureRoute.spokenName} route`);
    await page.waitForTimeout(2000);

    await injectTranscript(page, 'top');
    await page.waitForTimeout(2000);

    // Pick first 2 items (items 1-2)
    await injectTranscript(page, 'next');
    await page.waitForTimeout(1000);

    // Pick next 2 items (items 3-4)
    await injectTranscript(page, 'next');
    await page.waitForTimeout(1000);

    // Say "next" for the last item (only item 5 remains)
    console.log('[Test] Getting last single item in 2-pick mode');
    await injectTranscript(page, 'next');
    await page.waitForTimeout(2000);

    // Check response contains SINGULAR prefix (only 1 item displayed)
    const response = await page.textContent('[data-testid="ai-response"]') ||
                     await page.textContent('.text-center.text-lg');
    console.log('[Test] Last single item response:', response);

    // Should contain singular "This is the last item"
    expect(response).toContain('This is the last item');
    // Should NOT contain plural "last 2 items"
    expect(response).not.toContain('last 2 items');
  });

  test('Regression: "next" after "OK" in multiple transitions', async ({ page, fixtureRoute }) => {
    /**
     * Stress test: Multiple machine transitions in a row
     * Ensures pendingMachineTransition clearing works consistently
     */

    // Start route
    await injectTranscript(page, `start ${fixtureRoute.spokenName} route`);
    await page.waitForTimeout(2000);
    await injectTranscript(page, 'top');
    await page.waitForTimeout(2000);

    // Complete 3 machines, testing "OK" → "next" pattern each time
    for (let machine = 1; machine <= 3; machine++) {
      console.log(`[Test] Machine ${machine}: Completing items`);

      // Complete all items in machine
      for (let i = 0; i < 5; i++) {
        await injectTranscript(page, 'next');
        await page.waitForTimeout(800);
      }

      // Machine transition should occur
      await page.waitForTimeout(2000);

      // Say "OK" to start next machine
      console.log(`[Test] Machine ${machine}: Starting machine ${machine + 1} with OK`);
      await injectTranscript(page, 'OK');
      await page.waitForTimeout(2000);

      // Say "next" - should work every time
      console.log(`[Test] Machine ${machine + 1}: Testing "next" after OK`);
      await injectTranscript(page, 'next');
      await page.waitForTimeout(1000);

      // Verify no blocking message
      const response = await page.textContent('[data-testid="ai-response"]') ||
                       await page.textContent('.text-center.text-lg');
      expect(response).not.toContain('Top or bottom');
      expect(response).not.toContain('didn\'t catch that');
    }
  });
});
