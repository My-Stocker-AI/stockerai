import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const primary = 'https://www.stocker-ai.com';

describe('public identity and evidence-safe claims', () => {
  it('uses the intended production website as the only crawler canonical', () => {
    const html = read('index.html');
    const sitemap = read('public/sitemap.xml');
    const robots = read('public/robots.txt');
    const prerender = read('scripts/prerender.mjs');
    expect(html).toContain(`<link rel="canonical" href="${primary}/" />`);
    expect(html).toContain(`<meta property="og:url" content="${primary}/" />`);
    expect(sitemap).not.toContain('my-stocker-ai.com');
    expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].every(match => match[1].startsWith(primary))).toBe(true);
    expect(robots).toContain(`Sitemap: ${primary}/sitemap.xml`);
    expect(prerender).toContain(`const publicOrigin = '${primary}'`);
    expect(prerender).toContain("canonical.setAttribute('href', url)");
    expect(prerender).toContain('STOCKER_PRERENDER_BROWSER');
    expect(prerender).toContain('undefined,\n      { timeout: 15000 }');
  });

  it('does not publish unsupported speed, accuracy, training, or completion guarantees', () => {
    const publicCopy = `${read('index.html')}\n${read('src/pages/Home.tsx')}`;
    for (const claim of [
      '40% faster', 'up to 35% faster', 'near-zero mistakes', 'Same accuracy and speed',
      'productive in 15 minutes', 'zero training', 'Zero rework', '100% route completion',
    ]) {
      expect(publicCopy).not.toContain(claim);
    }
  });
});
