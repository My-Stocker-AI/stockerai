/**
 * Playwright global setup - runs once before all tests
 * No setup needed - uses existing routes in database
 */

async function globalSetup() {
  console.log('[Global Setup] Using existing routes in database - no setup needed');
}

export default globalSetup;
