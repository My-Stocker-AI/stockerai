# StockerAI production source of truth

Last reconciled: 2026-09-30. This document describes the supported product and the evidence boundary for the current release. The remediation register owns finding status and acceptance history. Historical plans, audits, `MEMORY.md`, and archived documents do not override current code or verified runtime evidence.

## Public product and deployment

| Area | Current fact | Evidence boundary |
| --- | --- | --- |
| Primary website | `https://www.stocker-ai.com/` | Intended production identity. The apex, `my-stocker-ai.com`, and `stockerai.pages.dev` currently remain reachable aliases. Redirect behavior is a Cloudflare configuration decision and is not changed by this document. |
| Frontend | React/TypeScript/Vite PWA on Cloudflare Pages | Remote `main` and last deployed application baseline are `0e4b8f0cafab6e07ca3ca7e370a153b11ba6d885`; public service worker is `stocker-ai-v13-durable-undo`. Local review candidates and production-only database changes are not deployed application code. |
| API | FastAPI service `stockerai-api` on Render | Public `/health` returned `status: ok` on 2026-09-30. Exact-commit rollout evidence remains release-specific in the remediation register. |
| Database/auth | Supabase project `wvtkuposrlvadyeixlke` | Production migration ledger remains unreconciled; never infer that every repository migration was applied. Apply only reviewed migrations in their documented order. |
| Picking path | Frontend uses the authenticated Python API exclusively | Direct Python paths are current. Legacy Edge/n8n material is operational history, not a selectable browser runtime. |
| Language model | Direct OpenAI chat through the Python API; current configured model is `gpt-4o-mini` | Deterministic commands bypass the model. The model must not invent progress-changing targets. |
| Speech recognition | Deepgram streaming through the token worker | Browser microphone/device behavior still requires separate physical iOS and Android acceptance. |
| Text to speech | TTS worker with browser speech fallback | Provider configuration and physical audio routing are release/environment evidence, not guaranteed by source alone. |

## Supported customer workflow

1. An authenticated account uploads a route report.
2. StockerAI parses the route into machines and items and exposes warnings or unsupported-format handling.
3. An administrator assigns the route to authorized drivers.
4. A driver selects a route and chooses a picking direction.
5. The app presents one or two items, keeps voice and touch controls available, and sends progress-changing actions through authenticated, revision-bound API operations.
6. The server saves authoritative route, machine, and item-window state; the browser mirrors only confirmed results.
7. Refresh/reopen recovery restores an exact saved item window when authoritative evidence exists and refuses ambiguous state.
8. Completion, history, and team visibility remain subject to the acceptance limits in the remediation register.

## Supported inputs and controls

- Verified parser layout: Parlevel **Prekitting Detail** PDF.
- Other named vending systems are intake targets, not blanket parser guarantees. Their reports require format setup and review before route use.
- Voice intents include route selection, direction, next, repeat, item/slot/quantity/progress questions, skip/return, pause/resume, and bounded undo.
- Touch controls are a required fallback, not an optional accessibility extra.
- Browser and installed-PWA use are supported product modes. Background/lock behavior is constrained by mobile browsers and must be recorded separately on physical iOS and Android devices.

## State and safety rules

- Authentication identifies the caller; request bodies cannot select another user.
- Account/route ownership is enforced at API/database boundaries, not only by hidden UI.
- Progress-changing operations use an operation ID, expected route revision, expected machine, and expected state.
- Duplicate retries replay one committed result; stale or competing operations fail without silently changing newer work.
- Presented items and confirmed items are distinct. Resume and undo use persisted operation receipts rather than preference, parity, or browser-only history.
- Reset is consequential and requires explicit confirmation. Ambiguous or unverifiable recovery must preserve progress and offer a safe retry/touch path.

## Pricing and ROI

Public pricing currently displayed by the application is $20 per driver/month for 1–5 drivers, $18 for 6–20, $15 for 21–50, and contact sales for 51+, with a two-driver minimum and a 14-day trial. This describes public product copy; complete Stripe entitlement, webhook, and billing reconciliation remains open under findings 13–17.

The ROI calculator is illustrative. It offers exactly **25%, 30%, and 35% picking-time reduction** choices, with **35% selected by default**. It assumes one route per driver per workday, five workdays per week, and 52 working weeks per year. The driver slider covers 2–50 drivers and applies the displayed per-driver price tier. Time freed is not necessarily payroll savings, and the illustrated result is not a guarantee of speed, accuracy, training time, completion, or payroll reduction.

## Runtime configuration names

Secret values never belong in documentation. Required/used names are:

- Frontend build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- FastAPI runtime: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`; `OPENAI_API_KEY` is required for conversational chat paths.
- Optional unsupported-format notifications: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Provider workers and Supabase/Stripe functions have separately managed secrets; their values and live presence must be verified in their service consoles without disclosure.

## Current release and acceptance boundary

Production remains on `5aecfd1` until a reviewed release is explicitly authorized and verified. Local branch `codex/production-readiness` contains review candidates for deterministic status questions and durable revision-bound undo; neither is published or deployed.

Automated tests and a successful rollout do not establish physical-device acceptance. Record iOS and Android separately with actual device, OS, browser, build, browser/installed mode, microphone permission, Bluetooth state, background/foreground, screen lock, voice and touch recovery. A pass on one platform does not prove the other.

General self-service launch remains incomplete while the remediation register has unresolved authority containment, account lifecycle, route replacement/import, billing, operational recovery, and physical-device acceptance gates. No production route or customer data may be used as a deployment test.
