/**
 * Samsung Galaxy S24 Ultra-sized installed-app simulation.
 *
 * This proves responsive layout, installed-mode gating, touch controls and in-route text
 * resizing without pretending that desktop Chromium can establish microphone, Bluetooth,
 * speaker-routing, phone-call or lock-screen behavior.
 */

import { test, expect } from './fixtures/test';
import {
  beSignedIn,
  gatedServerIsUp,
  prepareDisposableRoute,
  routeApiToLocal,
  signInDisposableUser,
} from './fixtures/browserSession';

declare global {
  interface Window {
    __testInjectTranscript: (transcript: string) => void;
  }
}

test.describe('S24 Ultra installed-app layout simulation', () => {
  test.use({ routeShape: { machines: 2, itemsPerMachine: 3 } });

  test.beforeEach(async () => {
    test.setTimeout(90_000);
    test.skip(!(await gatedServerIsUp()), 'the disposable gated API is not running');
  });

  test('keeps picking and text-size controls usable without horizontal overflow', async ({ page, fixtureRoute }) => {
    const session = await signInDisposableUser();
    await prepareDisposableRoute(session, fixtureRoute.routeName, fixtureRoute.deliveryDate);
    await beSignedIn(page, session);
    await routeApiToLocal(page);

    await page.route('https://stocker-deepgram-stt.russ-731.workers.dev/token', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'disposable-browser-token' }),
    }));
    await page.addInitScript(() => {
      class SilentWebSocket {
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        static readonly CLOSING = 2;
        static readonly CLOSED = 3;
        readonly CONNECTING = 0;
        readonly OPEN = 1;
        readonly CLOSING = 2;
        readonly CLOSED = 3;
        readyState = SilentWebSocket.CONNECTING;
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        constructor() {
          setTimeout(() => {
            this.readyState = SilentWebSocket.OPEN;
            this.onopen?.(new Event('open'));
          }, 0);
        }
        send() {}
        close() {
          this.readyState = SilentWebSocket.CLOSED;
          this.onclose?.(new CloseEvent('close', { code: 1000, wasClean: true }));
        }
      }
      Object.defineProperty(window, 'WebSocket', { configurable: true, value: SilentWebSocket });
    });

    await page.goto(`/app?route=${fixtureRoute.routeId}&resume=1`);
    await expect(page.getByRole('heading', { name: fixtureRoute.routeName })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/runs from the installed StockerAI app/i)).toHaveCount(0);
    await expect(page.getByTestId('ai-response')).toContainText(/top or bottom/i, { timeout: 30_000 });

    await page.evaluate(() => window.__testInjectTranscript('top'));
    await expect(page.getByTestId('current-item-card')).toContainText(
      fixtureRoute.itemsForMachine(1)[0].product_name,
      { timeout: 30_000 },
    );

    const layoutBefore = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layoutBefore.scrollWidth).toBeLessThanOrEqual(layoutBefore.clientWidth);

    const itemBox = await page.getByTestId('current-item-card').boundingBox();
    expect(itemBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const settings = page.getByTitle(/Settings/i);
    const settingsBox = await settings.boundingBox();
    expect(settingsBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(settingsBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await settings.click();
    await page.getByRole('button', { name: 'Extra Large' }).click();
    await expect(page.locator('html')).toHaveCSS('font-size', '19px');
    await page.getByRole('button', { name: 'Done' }).click();

    const layoutAfter = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layoutAfter.scrollWidth).toBeLessThanOrEqual(layoutAfter.clientWidth);
    await expect(page.getByTestId('current-item-card')).toBeVisible();
  });
});
