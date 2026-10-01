# Support incident release

This release adds a driver-facing problem report that stores a bounded, account-bound incident without changing route progress. Email notification is optional and does not determine whether the report was saved.

## Release order

1. Run the backend and frontend tests with no production credentials loaded.
2. Apply only `20261005000000_support_incidents.sql` to production after confirming the `accounts`, `routes`, `get_user_account_id` and `has_role` prerequisites.
3. Verify the table, indexes, row-level security, policies and grants through catalog-only queries. Do not insert a report into a customer account as a migration smoke test.
4. Deploy the exact reviewed backend and frontend commit through the gated release jobs.
5. Confirm the API health endpoint and exact public frontend assets.
6. With an explicitly disposable signed-in user and route, submit one report, confirm that route progress does not change, confirm the incident belongs to that user's account, then remove the disposable fixture.

## Optional email settings

Set all three Render variables to enable email delivery: `RESEND_API_KEY`, `INCIDENT_ALERT_TO` and `INCIDENT_FROM_EMAIL`. If any is absent, the durable incident still succeeds and records notification failure for follow-up. Never put their values in source, logs or release evidence.

## Acceptance limits

The client attaches route and device context plus recent voice event types and timestamps. It does not attach raw transcript or diagnostic payload data. Offline reports retain at most ten pending reports for the signed-in user on that device and retry when connectivity returns. A deployment pass does not establish Android or iOS usability; verify the button, dialog, offline queue and unchanged picking progress on each platform separately.
