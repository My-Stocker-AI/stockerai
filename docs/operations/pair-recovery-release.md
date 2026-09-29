# Exact unfinished-window recovery

Finding 10 follow-up. Server `completed_items` remains the presented count. The
unfinished window is the item(s) in the versioned transition receipt for the
authenticated session and current route revision. The confirmed prefix excludes
that entire window. No current preference, parity calculation or slot-based
deduplication determines the restored width.

`/api/resume-state` now returns `current_item2`, `confirmed_items`,
`awaiting_direction` and `resume_window_version: 1`. It verifies receipt identity,
direction, action, count and machine progress, then rechecks the context after
loading the snapshot. Missing/stale/ambiguous records return 409 without writes.
The next transition remains revision-bound, including a write after the final
snapshot check. Recovery and retries do not confirm items or advance progress.

The screen restores both items regardless of the current pick-mode preference,
announces the confirmed prefix, and restores the direction prompt between
machines. It rejects older snapshot contracts instead of silently dropping the
second item. The request also declares `resume_window_version: 1`; the server
refuses a pair response to older clients that would ignore the second item.
One-item recovery remains compatible with an older client when its saved receipt
is valid. A changed preference applies only to the next requested window.

## Release and rollback

No database migration is required; receipts are already saved atomically by the
deployed versioned transitions. Do not delete or rewrite receipts or driver data.
Following explicit release approval, verify both the API's exact commit/health
and the frontend markers `v0.2.3-pair-recovery` / `stocker-ai-v12-pair-recovery`.
Existing workflows deploy both services on a merged change. During mixed-version
rollout the new screen refuses an old API's incomplete snapshot; the new API
refuses pair recovery to an old screen. Close/reopen clients before controlled
acceptance. Do not treat either service's successful rollout alone as completion.

Rollback the frontend before rolling back the API. The old implementation cannot
be relied on for server-only pair recovery. Retain receipts and route state.

## Validation and open boundaries

Unit tests cover exact one/two-item windows, forward/reverse, odd final windows,
null slots, missing/stale/foreign receipts and concurrent revision changes. The
disposable database suite recovers after every transition across two machines,
changes pick mode, repeats recovery, replays lost responses, verifies no recovery
writes, and finishes with each item presented once. Mounted screen tests restore
both items, ask an interleaved question and confirm once using the real session
reducer and command transport with external I/O mocked.

Legacy sessions or state changed by an untracked writer can lack a receipt for
the current revision; these remain unavailable for exact server-only restoration
and are refused, not guessed. Skipped-work and undo semantics remain their own
contracts. This correction does not redefine durable completion throughout all
legacy paths or close finding 10 as a whole.

Physical iOS and Android acceptance remains separate: record actual device, OS,
browser, installed/browser mode and build. Use disposable routes to test one/two
items in both directions, interruption before/after confirmation, changed mode,
lost response, background/foreground, screen lock, permissions, Bluetooth and
touch fallback. Compare the restored items and saved count/revision; successful
deployment or a one-item test does not establish two-item/device acceptance.
