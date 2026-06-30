// Post-build prerender — fixes Google "Soft 404" / SPA-invisibility.
//
// WHY: the public marketing routes ship as an empty <div id="root"> shell; AI answer
// engines and crawlers that don't run JS see nothing. This script runs AFTER `vite build`,
// loads each PUBLIC route in a headless browser (the same one Playwright already installs),
// waits for React to finish painting, and overwrites that route's static HTML with the
// fully-rendered markup. The app's source/routing is never touched.
//
// SAFETY: only the 7 public routes are snapshotted. /app and /dashboard get NO prerendered
// file, so Cloudflare's SPA fallback serves the normal shell and the app boots exactly as
// before. React re-renders the correct route on hydration regardless of initial HTML.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

// The 7 public routes — must match public/sitemap.xml and the spec terminals.
const ROUTES = ['/', '/pricing', '/demo', '/guide', '/troubleshooting', '/privacy', '/terms'];

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('[prerender] dist/index.html missing — run `vite build` first.');
  process.exit(1);
}

const server = await preview({ preview: { port: 4183, strictPort: true } });
const base = `http://localhost:4183`;
const browser = await chromium.launch();
const page = await browser.newPage();

let failures = 0;
for (const route of ROUTES) {
  const url = base + route;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait until React has actually painted real content into #root.
    await page.waitForFunction(
      () => { const r = document.getElementById('root'); return r && r.innerText.trim().length > 50; },
      { timeout: 15000 }
    );
    const html = '<!DOCTYPE html>\n' + await page.evaluate(() => document.documentElement.outerHTML);
    const outPath = route === '/'
      ? join(distDir, 'index.html')
      : join(distDir, route.replace(/^\//, ''), 'index.html');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');
    const bytes = Buffer.byteLength(html);
    console.log(`[prerender] ${route.padEnd(18)} -> ${outPath.replace(distDir + '/', 'dist/').padEnd(34)} (${bytes} bytes)`);
  } catch (e) {
    failures++;
    console.error(`[prerender] FAILED ${route}: ${e.message}`);
  }
}

await browser.close();
await server.httpServer.close();

if (failures > 0) { console.error(`[prerender] ${failures} route(s) failed.`); process.exit(1); }
console.log(`[prerender] Done — ${ROUTES.length} public routes prerendered. /app and /dashboard untouched.`);
