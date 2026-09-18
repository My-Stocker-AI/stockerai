# Local test isolation

The supported entry points are `npm test`, `python -m pytest` from `python-api`, and `npm run test:e2e`. Historical scripts under `tests/api`, `tests/gates`, root SQL/JavaScript utilities and manual Supabase commands are not covered by these safeguards. Do not run them with production credentials.

## Unit tests

Install the locked frontend dependencies with `npm ci`. Use a separate Python environment with `python-api/requirements-dev.txt`. The local `.test-runtime/` directory is ignored by Git.

- Frontend: `npm test`.
- Backend: from `python-api`, `python -m pytest -q`.

Backend tests replace ordinary application database settings with dummy values before application import, disable dotenv discovery, refuse unmocked Supabase clients by default and block external socket connections. Loopback sockets remain available for Windows' in-process test client. Picking logic tests use mocked authentication; passing them does not establish authenticated end-to-end behavior.

The 23 database scenarios require explicit opt-in and otherwise report skips. These skips are not acceptance evidence. Unexpected application import errors now fail rather than becoming configuration skips.

## Disposable database scenarios

Provision and review a disposable local Supabase schema first (remediation 04). This change does not provide a complete production-equivalent schema. Never forward a local port to production; a loopback URL cannot prove what service is behind it.

Explicit environment settings:

| Setting | Purpose |
| --- | --- |
| `STOCKERAI_DB_TESTS=1` | Enable local database/browser scenarios |
| `STOCKERAI_TEST_SUPABASE_URL` | HTTP loopback URL with explicit port, e.g. `http://127.0.0.1:54321` |
| `STOCKERAI_TEST_SERVICE_KEY` | Key for that disposable database only |
| `STOCKERAI_TEST_ANON_KEY` | Browser public key for that disposable database |
| `STOCKER_TEST_API` | Explicit loopback URL for the isolated Python API |
| `STOCKERAI_TEST_USER_ID` | Disposable local browser fixture identity |
| `STOCKERAI_TEST_EMAIL` | Disposable local login identity ending `@example.invalid` |

Backend fixtures use generated user UUIDs and record each successfully inserted route ID. Cleanup targets those IDs, including sessions linked to those routes; it does not delete all sessions of a configured driver. A finalizer attempts cleanup after setup/test failures. If the isolated schema requires Auth/profile rows for these UUIDs, provision the fixture identity model before enabling these scenarios; no real database run has validated those constraints yet.

Browser configuration refuses to load without explicit test settings. It does not reuse an existing dev server, overrides frontend Supabase settings, disables service workers, and uses context request/WebSocket guards for external destinations. Browser login uses explicit local credentials; its API interception forwards to the specified local API without following redirects. The application's Render URL remains hard-coded: other picking scenarios need explicit local interception or a later configurable API change before they can pass. External voice providers are blocked rather than exercised.

The separately started local Python API must also use the disposable Supabase configuration. The browser runner cannot prove the backend's database target from its URL. Inspect that server's configuration before an integration run.

Browser teardown requires route IDs recorded by the current worker. Automatic cross-run sweeping is removed; reset the disposable database explicitly if a crashed process leaves fixtures behind. Cleanup errors fail the fixture instead of being logged as successful teardown.

## Voice evidence boundaries

`voiceConfirmationBoundary.test.ts` covers prompt/echo timing, acceptance of full direction replies and rejection of whole/dropped-word prompt echoes. The two formerly expected failures are now ordinary regression tests after rewording the direction confirmation prompts. This addresses those text collisions; it does not establish acoustic recognition accuracy on a phone.

`StockerApp.voice.test.ts` now mounts the application with external hooks/services mocked and drives its actual transcript handler. `useVoice.counting.test.ts` mounts the actual voice hook with simulated microphone, socket and audio APIs. These cover the counting/confirmation/queue boundary but do not exercise a real database, recognition acoustics or complete device route. The remaining pending-intent/reconnect cases, persisted progress and phone/headset behavior still require integration/device checks. No test result here establishes production readiness.
