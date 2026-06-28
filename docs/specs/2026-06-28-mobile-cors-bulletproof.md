# Spec of Record — Bulletproof Mobile (Android + iOS) for all users

**Date:** 2026-06-28
**Mode:** Code / Repair
**Author:** Russ + Claude (via /xffi discovery, spec engine on native Opus)
**Intent (confirmed):** Fix the Feb-9 invalid-CORS regression at its root so the
ENTIRE StockerAI mobile app works on Android and iOS for every user (Russ, Davy,
future drivers). Acceptance = a complete real-route run on real devices.

---

## Root cause (evidence-based)

- **What changed:** Feb 9, commit `a55bcb6` "Switch frontend to Python API backend"
  moved every app call from the old n8n service (which worked on phones) to the
  Python/Render backend.
- **The defect it introduced:** `python-api/app/main.py` configured CORS with
  `allow_origins=["*"]` **and** `allow_credentials=True`. That combination is
  invalid per the CORS spec. It made the server emit **inconsistent permission
  headers** — the preflight echoed the calling origin, the actual response sent
  `*`. Lenient desktop browsers ignored the mismatch; **strict mobile browsers
  rejected it as "Failed to fetch."**
- **Confirmed in the lab:** upload works from desktop browsers and emulated
  Android/iOS (Playwright), and fails on Russ's real Android (wifi + cellular,
  installed PWA + incognito). Backend itself healthy (real 153 KB PDF → 200, 8
  machines / 269 items). The before-fix CORS test shows every endpoint wrongly
  grants a rogue origin (the wildcard).

---

## The 7 pieces (engine decomposition, Opus)

1. **cors-middleware-credentials-fix** — list the exact app origins instead of a
   wildcard. *(DONE — `python-api/app/main.py`)*
2. **exception-handler-cors-preservation** — error responses must carry CORS
   headers too. *(Covered by the middleware once origins are specific; verified
   by the test suite below.)*
3. **preflight-options-route-coverage** — every endpoint answers the phone's
   preflight with valid headers. *(Handled by CORSMiddleware; asserted by the
   test.)*
4. **service-worker-fetch-intercept-audit** — the offline-helper must never
   intercept backend calls. *(Audited clean; hardened with an explicit
   `onrender` skip guard in `public/sw.js`.)*
5. **api-level-cors-test-suite** — automated proof for every endpoint.
   *(DONE — `tests/api/cors_mobile_test.sh`.)*
6. **device-e2e-validation (iOS)** — Davy completes a full real route on iPhone.
   *(PENDING — human acceptance gate.)*
7. **android-device-validation** — Russ completes a full real route on Android.
   *(PENDING — human acceptance gate.)*

---

## The fix

- `python-api/app/main.py`: `allow_origins` now lists `https://my-stocker-ai.com`
  and `https://stocker-ai.pages.dev`, plus an `allow_origin_regex` for Cloudflare
  preview deploys and the `www` host. With specific origins, `allow_credentials=True`
  is valid and the headers are consistent on preflight AND actual response.
- `public/sw.js`: explicit `onrender` skip guard so the service worker can never
  intercept a backend request.

## Verification gate (acceptance)

1. **Automated (internal first):** `bash tests/api/cors_mobile_test.sh` →
   24 passed, 0 failed against the deployed backend. (Before fix: 16/8.)
2. **Real device — Android (Russ):** upload a route, pick start-to-finish,
   exercise skip-machine + all functions, voice works, route reaches completed.
3. **Real device — iOS (Davy):** the same full run on iPhone.

Only when all three pass is this "bulletproof for everyone." Backend deploys to
Render on push to `main`; frontend (sw.js) deploys to Cloudflare on the same push.

## Follow-ups (logged, not in this fix)

- XFFI bug: the spec engine printed "cheap models couldn't ground this" when it
  actually ran on native Sonnet — misleading; needs a label fix.
- Rotate the GitHub token currently embedded in the repo's git remote.
