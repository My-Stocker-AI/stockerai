# Local test isolation

The supported entry points are `npm test`, `python -m pytest` from `python-api`, and `npm run test:e2e`. Historical scripts under `tests/api`, `tests/gates`, root SQL/JavaScript utilities and manual Supabase commands are not covered by these safeguards. Do not run them with production credentials.

## Unit tests

Install the locked frontend dependencies with `npm ci`. Use a separate Python environment with `python-api/requirements-dev.txt`. The local `.test-runtime/` directory is ignored by Git.

- Frontend: `npm test`.
- Backend: from `python-api`, `python -m pytest -q`.

Backend tests replace ordinary application database settings with dummy values before application import, disable dotenv discovery, refuse unmocked Supabase clients by default and block external socket connections. Loopback sockets remain available for Windows' in-process test client. Picking logic tests use mocked authentication; passing them does not establish authenticated end-to-end behavior.

The 26 database scenarios require explicit opt-in and otherwise report skips. These skips are not acceptance evidence. Unexpected application import errors fail rather than becoming configuration skips.

## Disposable database scenarios

On September 22, 2026, the local `stockerai-disposable` project was provisioned and all 26 database scenarios passed. The full database-enabled backend suite reported 123 passed and one intentionally skipped unit-mode guard. A separate unit-mode run covers that guard. This is not a complete production-equivalent environment: authentication at the HTTP picking boundary is mocked, platform images are newer, and function ownership/ACLs, Storage and external integrations are not reproduced as production acceptance evidence.

The local baseline generator is `scripts/disposable-db/generate-baseline.py`. It reads the September 18 public catalog/column captures, copies 23 function definitions, and recreates 14 public tables with constraints, indexes, public policies and relevant triggers. It imports no driver data. The generated migration lives only under ignored `.test-runtime/disposable/supabase/migrations/`; never apply it to a hosted project. A service-role-only marker identifies this test database.

The running services are PostgreSQL, Auth, PostgREST and Kong. Docker project/network labels identify `stockerai-disposable`; database port 55322 and API port 55321 bind explicitly to `127.0.0.1`. The network is a dedicated bridge, **not an outbound firewall**. Python tests block external sockets, load no application dotenv credentials, require the exact local configuration, and check the database marker before provisioning identities. Never forward these ports to production.

Run the backend suite from the repository root in PowerShell:

```powershell
& scripts/disposable-db/run-tests.ps1
```

The wrapper checks container/network identity and loopback bindings, obtains only local credentials without printing them, and enables the guarded tests. Credentials and generated Compose configuration remain in ignored `.test-runtime`, not source control.

To stop/restart the existing local environment without deleting its schema volume:

```powershell
docker compose -p stockerai-disposable -f .test-runtime/disposable/compose.json stop
docker compose -p stockerai-disposable -f .test-runtime/disposable/compose.json up -d
```

Initial reconstruction used pinned Supabase CLI 2.117.0, `init --workdir .test-runtime/disposable`, and a generated config with project ID `stockerai-disposable`, API 55321, DB 55322, shadow DB 55320, Postgres 17 and seed disabled. Generate the SQL before starting. Create the labeled `stockerai-disposable-local` Docker bridge; start with `--workdir .test-runtime/disposable --network-id stockerai-disposable-local --exclude realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`. Do not use the repository-root Supabase project or link/push commands. On this Docker Desktop installation an internal bridge prevented host access and the CLI ignored the bridge's default loopback binding. `scripts/disposable-db/bind-local.py` therefore recreates only the four named test containers with explicit loopback ports, preserving the local volume and gateway configuration. This is a one-time conversion from CLI containers; subsequent starts use the generated Compose file. Check service health before tests. Initial CLI startup briefly publishes all-interface ports, so perform first-time provisioning on a trusted host; the test runner refuses such bindings.

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

Backend fixtures use generated user UUIDs and record each successfully inserted route ID. Cleanup targets those IDs, including sessions linked to those routes; it does not delete all sessions of a configured driver. A module fixture checks the local marker, creates disposable Auth users (exercising the captured profile trigger), and deletes them after route cleanup. The September 22 run verified these foreign keys/triggers and confirmed zero remaining routes, machines, items, sessions, Auth users and profiles. HTTP caller authentication remains mocked.

Browser configuration refuses to load without explicit test settings. It does not reuse an existing dev server, overrides frontend Supabase settings, disables service workers, and uses context request/WebSocket guards for external destinations. Browser login uses explicit local credentials; its API interception forwards to the specified local API without following redirects. The application's Render URL remains hard-coded: other picking scenarios need explicit local interception or a later configurable API change before they can pass. External voice providers are blocked rather than exercised.

The separately started local Python API must also use the disposable Supabase configuration. The browser runner cannot prove the backend's database target from its URL. Inspect that server's configuration before an integration run.

Browser teardown requires route IDs recorded by the current worker. Automatic cross-run sweeping is removed; reset the disposable database explicitly if a crashed process leaves fixtures behind. Cleanup errors fail the fixture instead of being logged as successful teardown.

## Voice evidence boundaries

`voiceConfirmationBoundary.test.ts` covers prompt/echo timing, acceptance of full direction replies and rejection of whole/dropped-word prompt echoes. The two formerly expected failures are now ordinary regression tests after rewording the direction confirmation prompts. This addresses those text collisions; it does not establish acoustic recognition accuracy on a phone.

`StockerApp.voice.test.ts` now mounts the application with external hooks/services mocked and drives its actual transcript handler. `useVoice.counting.test.ts` mounts the actual voice hook with simulated microphone, socket and audio APIs. These cover the counting/confirmation/queue boundary but do not exercise a real database, recognition acoustics or complete device route. The remaining pending-intent/reconnect cases, persisted progress and phone/headset behavior still require integration/device checks. No test result here establishes production readiness.
