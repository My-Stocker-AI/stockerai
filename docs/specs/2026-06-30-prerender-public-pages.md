# Spec — Prerender StockerAI Public Pages (fix Google Soft 404 / SPA invisibility)

**Date:** 2026-06-30
**Mode:** Code (small-slice escape per #215 — XFFI decomposed but the work is one-file-sized; terminals below are the verification surface)
**Origin:** /xffi — intent receipt 9a08be8d247022b5, branch receipt 000bf7ad9c4170be
**Scope narrowed:** Cloudflare/Render auto-deploy reconnect handled as a separate direct task, NOT in this spec.

## Distilled intent
Implement build-time prerendering for 7 public routes so each ships as static HTML with marketing
content readable without JavaScript (clearing Google's Soft 404). Keep /app and /dashboard as
client-only SPA routes. Prerender runs automatically on every build.

## Locked terminals (XFFI-decomposed, binary-verifiable against the codebase)

1. **install-and-wire-prerenderer** — A prerender plugin dependency is added to package.json and
   imported/registered in the vite.config.ts plugins array so it runs as part of the existing build script.

2. **enumerate-public-route-paths-in-vite-config** — The prerender config lists exactly these literal
   path strings: `/`, `/pricing`, `/demo`, `/guide`, `/troubleshooting`, `/privacy`, `/terms`.

3. **exclude-spa-routes-and-preserve-app-tsx** — The prerender routes list contains neither `/app` nor
   `/dashboard`, and the `/app` and `/dashboard` Route entries in src/App.tsx remain client-rendered
   and unchanged.

4. **verify-prerendered-html-and-robots** — After `npm run build`, each prerendered public-route HTML
   file contains non-empty rendered markup inside the root `<div id="root">`, and public/robots.txt
   permits those paths to be crawled.

## Out of scope (firm)
- /app and /dashboard behavior (must stay identical — verified by terminal 3 + 4).
- Auto-deploy reconnect (separate task).

## Open before build
- Tool selection: confirm the current (2026) prerender tool that works with Vite 5 + React Router 6
  SPA on Cloudflare Pages. Engine guessed older libs — verify before installing.
