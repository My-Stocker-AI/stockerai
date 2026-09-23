# Credential publication guard

Run `python scripts/check-secrets.py` from the repository before publishing. CI runs
the same blocking check and its synthetic regression tests. It examines the working
contents of tracked files, so stage new files before checking. CI checks the committed
checkout. Diagnostics report only filenames, line numbers and categories, never values.

The focused guard rejects non-public JWTs, selected provider-token formats, private-key
headers, `.mcp.json` and environment files other than example/sample/template files.
Examples still undergo content scanning. Supabase `anon` JWTs are public client keys
and are allowed. This is not an exhaustive secret detector or a scan of Git history.

Keep local connector configuration in the ignored `.mcp.json`. The legacy n8n fetch
helper now requires `N8N_API_KEY` from the environment and does not echo its value.
The two old direct-database increment examples are retired fail-closed stubs; use the
authenticated picking API instead. Changing these repository files does not update
any workflow already installed in n8n.

## Containment still required

Removing a literal does not revoke it or erase historical commits. Inventory each
affected credential's provider, current validity, owner and live dependents without
printing values. Coordinate replacement/revocation, verify legitimate services, then
record whether historical material is invalid. Decide history treatment separately.
Do not test exposed credentials against driver data or rotate a shared signing secret
without checking session and service dependencies.

Passing CI does not currently prevent a direct main push or independent deployments.
Required branch checks and deployment gates are separate release-hardening work.
