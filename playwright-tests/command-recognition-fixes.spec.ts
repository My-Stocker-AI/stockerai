/**
 * Real-browser protection for the voice-command and recovery rules a driver depends on.
 *
 * Every route, login and API call stays inside the marked disposable environment. The old
 * version of this file used a production project key, a real user id and a made-up token;
 * those assumptions could neither authenticate honestly nor prove the production workflow.
 */

import { test, expect } from './fixtures/test';
import type { Page } from '@playwright/test';
import type { SeededRoute } from './fixtures/seedRoute';
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

const response = (page: Page) => page.getByTestId('ai-response');
const itemCard = (page: Page) => page.getByTestId('current-item-card');

async function injectTranscript(page: Page, transcript: string): Promise<void> {
  await page.evaluate((text) => window.__testInjectTranscript(text), transcript);
  // The visible response is set before the silent speech cycle releases the command lock.
  // Let that cycle finish so the next injected phrase models sequential driver speech.
  await page.waitForTimeout(1_600);
}

function captureSpokenWorkflowText(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.includes('[Voice] Using voice_text:')) messages.push(text);
  });
  return messages;
}

async function openPreparedRoute(page: Page, fixtureRoute: SeededRoute): Promise<void> {
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
    // Keep the voice state machine real while completing fallback speech immediately and
    // silently. Chromium is also launched with --mute-audio as a second safety boundary.
    const silentSpeech = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      cancel() {},
      pause() {},
      resume() {},
      getVoices() { return []; },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return true; },
      speak(utterance: SpeechSynthesisUtterance) {
        utterance.dispatchEvent(new Event('start'));
        queueMicrotask(() => utterance.dispatchEvent(new Event('end')));
      },
    } as unknown as SpeechSynthesis;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: silentSpeech });

    // Keep the voice connection healthy without contacting Deepgram. Transcript content is
    // injected explicitly below; this socket only models the open/close lifecycle.
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
        this.onclose?.(new CloseEvent('close', { code: 1000, reason: 'test complete', wasClean: true }));
      }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: SilentWebSocket });
  });

  await page.goto(`/app?route=${fixtureRoute.routeId}&resume=1`);
  await expect(page.getByRole('heading', { name: fixtureRoute.routeName })).toBeVisible({ timeout: 30_000 });
  await expect(response(page)).toContainText(/top or bottom/i, { timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function startAtTop(page: Page, fixtureRoute: SeededRoute): Promise<void> {
  await injectTranscript(page, 'top');
  await expect(itemCard(page)).toContainText(fixtureRoute.itemsForMachine(1)[0].product_name, {
    timeout: 30_000,
  });
}

test.describe('disposable browser command and recovery protection', () => {
  test.beforeEach(async () => {
    test.setTimeout(90_000);
    test.skip(!(await gatedServerIsUp()), 'the disposable gated API is not running');
  });

  test('an uncertain action asks before changing the displayed item', async ({ page, fixtureRoute }) => {
    await openPreparedRoute(page, fixtureRoute);
    await startAtTop(page, fixtureRoute);
    const [first] = fixtureRoute.itemsForMachine(1);

    await injectTranscript(page, 'keep going');
    await expect(response(page)).toHaveText('Next item?');
    await expect(itemCard(page)).toContainText(first.product_name);
  });

  test('next still works immediately after OK starts the next machine', async ({ page, fixtureRoute }) => {
    await openPreparedRoute(page, fixtureRoute);
    await startAtTop(page, fixtureRoute);

    for (let index = 0; index < fixtureRoute.itemsForMachine(1).length; index += 1) {
      await injectTranscript(page, 'next');
      if (index < fixtureRoute.itemsForMachine(1).length - 1) {
        await expect(page.getByText(`${index + 1} items picked`)).toBeVisible({ timeout: 30_000 });
      }
    }

    await expect(response(page)).toContainText(/complete/i, { timeout: 30_000 });
    await injectTranscript(page, 'OK');
    await expect(itemCard(page)).toContainText(fixtureRoute.itemsForMachine(2)[0].product_name, {
      timeout: 30_000,
    });

    await injectTranscript(page, 'next');
    await expect(itemCard(page)).toContainText(fixtureRoute.itemsForMachine(2)[1].product_name, {
      timeout: 30_000,
    });
    await expect(response(page)).not.toContainText(/top or bottom|didn't catch/i);
  });

  test('a connection loss keeps the verified item and touch recovery works when online returns', async ({ page, context, fixtureRoute }) => {
    await openPreparedRoute(page, fixtureRoute);
    await startAtTop(page, fixtureRoute);
    const [first, second] = fixtureRoute.itemsForMachine(1);

    await context.setOffline(true);
    await expect(page.getByText(/You're offline/i)).toBeVisible();
    await itemCard(page).click();
    await expect(itemCard(page)).toContainText(first.product_name);

    await context.setOffline(false);
    await expect(page.getByText(/You're offline/i)).toBeHidden();
    await itemCard(page).click();
    await expect(itemCard(page)).toContainText(second.product_name, { timeout: 30_000 });
  });

  test('one-item mode still announces the final item', async ({ page, fixtureRoute }) => {
    const spoken = captureSpokenWorkflowText(page);
    await openPreparedRoute(page, fixtureRoute);
    await startAtTop(page, fixtureRoute);

    for (let index = 1; index < fixtureRoute.itemsForMachine(1).length; index += 1) {
      await injectTranscript(page, 'next');
      await expect(itemCard(page)).toContainText(fixtureRoute.itemsForMachine(1)[index].product_name, {
        timeout: 30_000,
      });
    }
    await expect.poll(() => spoken.some((text) => text.includes('This is the last item'))).toBe(true);
    expect(spoken.some((text) => text.includes('last 2 items'))).toBe(false);
  });
});

test.describe('two-item browser protection', () => {
  test.use({ routeShape: { machines: 1, itemsPerMachine: 4 } });

  test.beforeEach(async () => {
    test.setTimeout(90_000);
    test.skip(!(await gatedServerIsUp()), 'the disposable gated API is not running');
  });

  test('two-item mode announces the final pair and retains both items', async ({ page, fixtureRoute }) => {
    const spoken = captureSpokenWorkflowText(page);
    await page.addInitScript(() => localStorage.setItem('stocker-call-two-items', 'true'));
    await openPreparedRoute(page, fixtureRoute);
    await injectTranscript(page, 'top');
    const items = fixtureRoute.itemsForMachine(1);
    await expect(itemCard(page)).toContainText(items[0].product_name, { timeout: 30_000 });
    await expect(itemCard(page)).toContainText(items[1].product_name);

    await injectTranscript(page, 'next');
    await expect(itemCard(page)).toContainText(items[2].product_name, { timeout: 30_000 });
    await expect(itemCard(page)).toContainText(items[3].product_name);
    await expect.poll(() => spoken.some((text) => text.includes('These are the last 2 items'))).toBe(true);
  });
});

test.describe('two-item odd-count protection', () => {
  test.use({ routeShape: { machines: 1, itemsPerMachine: 5 } });

  test.beforeEach(async () => {
    test.setTimeout(90_000);
    test.skip(!(await gatedServerIsUp()), 'the disposable gated API is not running');
  });

  test('two-item mode announces a singular final item when one remains', async ({ page, fixtureRoute }) => {
    const spoken = captureSpokenWorkflowText(page);
    await page.addInitScript(() => localStorage.setItem('stocker-call-two-items', 'true'));
    await openPreparedRoute(page, fixtureRoute);
    await injectTranscript(page, 'top');
    const items = fixtureRoute.itemsForMachine(1);
    await expect(itemCard(page)).toContainText(items[0].product_name, { timeout: 30_000 });
    await expect(itemCard(page)).toContainText(items[1].product_name);

    await injectTranscript(page, 'next');
    await expect(itemCard(page)).toContainText(items[2].product_name, { timeout: 30_000 });
    await expect(itemCard(page)).toContainText(items[3].product_name);

    await injectTranscript(page, 'next');
    await expect(itemCard(page)).toContainText(items[4].product_name, { timeout: 30_000 });
    await expect(itemCard(page)).not.toContainText(items[3].product_name);
    await expect.poll(() => spoken.some((text) => text.includes('This is the last item'))).toBe(true);
    expect(spoken.some((text) => text.includes('These are the last 2 items'))).toBe(false);
  });
});
