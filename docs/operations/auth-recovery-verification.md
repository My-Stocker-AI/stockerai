# Authentication recovery verification

This procedure verifies the password-recovery and identity-isolation changes without using a
customer account. Application deployment does not by itself establish recovery acceptance.

## Automated release gates

- TypeScript checking and active-source lint must pass.
- The complete Vitest suite must include both `*.test.ts` and `*.test.tsx` files.
- Focused recovery coverage must prove:
  - reset email destinations use `/auth/callback?type=recovery`;
  - implicit and PKCE callbacks require an authenticated recovery session;
  - legacy `/login` recovery hashes reach the password form rather than the dashboard;
  - an ordinary authenticated session cannot open the recovery password form;
  - the tab-scoped recovery marker is consumed after a successful password update;
  - stale initial-session and role/profile responses cannot replace a newer identity;
  - account-scoped query data is cleared when identity changes.

## Production acceptance

Use an explicitly authorized disposable account. Do not reset a customer or driver password as a
smoke test, and do not copy callback tokens into evidence.

1. Record the exact deployed commit and application asset.
2. Request one reset email for the disposable user and confirm the delivered link returns through
   `/auth/callback` to the password form, without first entering the dashboard.
3. Set a unique temporary password. Confirm the marker is consumed, the dashboard opens, the old
   password fails and the new password succeeds.
4. Open `/set-password` during an ordinary authenticated session and confirm it returns to the
   dashboard without presenting the form.
5. Sign out and immediately sign in as a second disposable user from a different disposable
   account. Confirm no name, role, routes, subscription or capability from the first identity is
   displayed while the second identity loads.
6. Record browser and installed-web-app results separately on actual iOS and Android devices,
   including device, OS and browser versions. A desktop pass is not a mobile acceptance pass.

Stop and investigate if the link enters the dashboard before password selection, a missing or
expired recovery session can open the password form, or any prior-identity data appears after an
account change.
