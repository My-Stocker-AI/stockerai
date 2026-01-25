# Team Management - Deployment & Testing Guide
**Date:** 2026-01-10
**Architecture:** Supabase Edge Functions + RPC (NOT n8n)
**Status:** Ready for deployment

---

## 📦 WHAT WAS BUILT

### 1. Database Layer
**File:** `/supabase/migrations/20260110_seat_management_rpc.sql`

**Function:** `check_seat_availability(account_id, role)`
- Counts active drivers (not admins)
- Compares against account's `driver_count` limit
- Returns: total_seats, used_seats, available_seats, can_add, reason

**Key Decision:** Admins unlimited, only drivers count against seats

---

### 2. Edge Function
**File:** `/supabase/functions/invite-team-member/index.ts`

**Flow:**
1. Authenticate requesting user (must be admin)
2. Call `check_seat_availability` RPC
3. If at limit → Return error (seat limit reached)
4. Check if user exists in auth.users
5. **Branch A (Existing User):**
   - Update user_metadata
   - Upsert profile
   - Update or insert account_users
   - Re-send invite email
6. **Branch B (New User):**
   - Create user with metadata
   - Insert profile
   - Insert account_users
   - Invite email sent automatically
7. Return success with user data

**Fixes Applied:**
- ✅ Wrong names in email → Updates user_metadata correctly
- ✅ Existing users fail → Proper existence check and update
- ✅ Seat limits enforced → RPC check before invite
- ✅ No admin name → Frontend change (removed admin_name param)

---

### 3. Frontend Update
**File:** `/src/pages/dashboard/Team.tsx` (line 101-124)

**Changed from:**
```typescript
// OLD: n8n webhook
fetch('https://visionairy.app.n8n.cloud/webhook/invite-team-member', {
  method: 'POST',
  body: JSON.stringify({
    email, first_name, last_name,
    account_id, role, can_view_all_routes,
    admin_name, admin_email  // ← These are NOT needed
  })
});
```

**Changed to:**
```typescript
// NEW: Supabase Edge Function
await supabase.functions.invoke('invite-team-member', {
  body: {
    email, first_name, last_name,
    account_id, role, can_view_all_routes
    // admin_name/email NOT sent - Supabase handles via email template
  }
});
```

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Deploy Database Migration

```bash
cd /home/visionairy/StockerAI

# Push migration to Supabase
npx supabase db push
```

**What this does:**
- Creates `check_seat_availability` RPC function
- Grants execute permission to authenticated users

**Verification:**
```sql
-- Test the function in Supabase SQL Editor
SELECT * FROM check_seat_availability(
  '<your-account-id>'::UUID,
  'driver'
);

-- Should return: total_seats, used_seats, available_seats, can_add, reason
```

---

### Step 2: Deploy Edge Function

```bash
cd /home/visionairy/StockerAI

# Deploy the Edge Function to Supabase
npx supabase functions deploy invite-team-member
```

**What this does:**
- Uploads `/supabase/functions/invite-team-member/index.ts` to Supabase
- Makes it available at: `https://<project-ref>.supabase.co/functions/v1/invite-team-member`

**Verification:**
- Go to Supabase Dashboard → Edge Functions
- Should see "invite-team-member" listed
- Status should be "deployed"

---

### Step 3: Deploy Frontend Changes

```bash
cd /home/visionairy/StockerAI

# Commit and push to GitHub
git add src/pages/dashboard/Team.tsx
git commit -m "Switch team invites from n8n to Supabase Edge Function

- Replace n8n webhook with supabase.functions.invoke()
- Remove admin_name/admin_email params (handled by Supabase)
- Cleaner integration with native Supabase Auth

Architecture change: Core SaaS logic belongs in Supabase, not n8n

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push
```

**What this does:**
- Cloudflare Pages auto-deploys from main branch
- Frontend will call Edge Function instead of n8n webhook

---

## 🧪 TESTING CHECKLIST

### Pre-Deployment Tests (Supabase Dashboard)

**Test 1: RPC Function**
```sql
-- In Supabase SQL Editor
SELECT * FROM check_seat_availability(
  '<your-account-id>'::UUID,
  'driver'
);

-- Expected: Shows your current seat usage
-- If driver_count = 10 and used_seats = 2, should show available_seats = 8
```

**Test 2: Edge Function (via Postman/curl)**
```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/invite-team-member' \
  -H 'Authorization: Bearer <your-jwt-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "first_name": "Test",
    "last_name": "User",
    "account_id": "<your-account-id>",
    "role": "driver",
    "can_view_all_routes": false
  }'

# Expected: { "success": true, "user": {...}, "seat_info": {...} }
```

---

### Post-Deployment Tests (Production)

**Test 1: Invite New User (Never Existed)**
1. Go to https://my-stocker-ai.com/dashboard/team
2. Click "Invite Team Member"
3. Fill in:
   - Email: (use a real email you can access)
   - First Name: John
   - Last Name: Doe
   - Role: Driver
4. Click "Invite"
5. **Expected:**
   - ✅ Success message appears
   - ✅ User appears in team list
   - ✅ Email sent to John (check inbox)
   - ✅ Email shows "John Doe" (not wrong name)

**Test 2: Re-Invite Existing User (Update Name)**
1. Invite the same email again with different name:
   - Email: (same as Test 1)
   - First Name: Jonathan  (changed!)
   - Last Name: Smith      (changed!)
2. Click "Invite"
3. **Expected:**
   - ✅ Success message appears
   - ✅ User updated in team list (shows "Jonathan Smith")
   - ✅ New invite email sent
   - ✅ Email shows "Jonathan Smith" (not "John Doe")

**Test 3: Seat Limit Enforcement**
1. Set your `driver_count` to a low number (e.g., 2):
   ```sql
   UPDATE accounts
   SET driver_count = 2
   WHERE id = '<your-account-id>';
   ```
2. Invite drivers until you hit the limit
3. Try to invite one more driver
4. **Expected:**
   - ❌ Error message: "Driver seat limit reached. Upgrade plan to add more drivers."
   - ✅ Invite blocked (not sent)

**Test 4: Admin Invitation (Unlimited)**
1. With driver seats at limit, try inviting an admin
2. **Expected:**
   - ✅ Admin invited successfully (no seat check)
   - ✅ Admins don't count against driver_count

**Test 5: Check Browser Console**
1. Open DevTools → Console
2. Perform an invite
3. **Expected:**
   - ✅ No errors in console
   - ✅ Network tab shows call to `invoke-team-member` (not n8n webhook)

---

## 🔄 ROLLBACK PLAN

**If Edge Function fails:**

1. **Immediate Rollback (Frontend):**
   ```bash
   git revert HEAD  # Revert Team.tsx changes
   git push
   ```
   - Cloudflare redeploys
   - Frontend calls n8n webhook again (old flow)
   - Downtime: ~2-3 minutes

2. **Delete Edge Function:**
   ```bash
   npx supabase functions delete invite-team-member
   ```

3. **Keep or Drop Migration:**
   - RPC function has zero impact if not called
   - Can leave it deployed (harmless)
   - OR drop it:
     ```sql
     DROP FUNCTION IF EXISTS check_seat_availability(UUID, TEXT);
     ```

**If n8n workflow was deleted prematurely:**
- We have backup JSON export (from Session 31)
- Can re-import workflow via n8n GUI
- Re-activate and frontend works again

---

## ✅ SUCCESS CRITERIA

**Before marking complete, verify:**

- [ ] ✅ RPC function deployed and returns correct seat data
- [ ] ✅ Edge Function deployed and visible in dashboard
- [ ] ✅ Frontend calling Edge Function (not n8n webhook)
- [ ] ✅ Invite new user works (correct name in email)
- [ ] ✅ Re-invite existing user updates name correctly
- [ ] ✅ Seat limit blocks driver invites when at capacity
- [ ] ✅ Admin invites bypass seat limit (unlimited admins)
- [ ] ✅ No console errors in browser
- [ ] ✅ n8n workflow can be safely deleted (after validation period)

---

## 📊 COMPARISON: Before vs After

| Aspect | n8n Workflow (OLD) | Supabase Edge Function (NEW) |
|--------|-------------------|------------------------------|
| **Tool** | n8n (data workflow tool) | Supabase (SaaS backend) |
| **Version Control** | ❌ GUI changes, manual export | ✅ Git-tracked TypeScript |
| **Testing** | ❌ Manual only | ✅ Automated tests possible |
| **Seat Limits** | ❌ None (revenue leak!) | ✅ Enforced via RPC |
| **Existing User Updates** | ❌ Broken (stale metadata) | ✅ Fixed (proper update) |
| **Integration** | ⚠️ HTTP calls to Supabase API | ✅ Native Supabase SDK |
| **Security** | ⚠️ Service key in GUI | ✅ Env vars, not exposed |
| **Iteration Speed** | 🐢 GUI changes, export, test | 🚀 Code change, deploy, test |
| **Appropriate for Use Case** | ❌ Wrong abstraction | ✅ Perfect fit |

---

## 🎯 NEXT STEPS (After Validation)

### Phase 2: Email Template & Onboarding
- Update Supabase email template (add admin name, account context)
- Create auth callback handler for `/set-password` redirect
- Show seat counter in Team page UI

### Phase 3: Stripe Billing Integration
- Prorated billing calculation
- Confirmation dialog before adding seat
- Auto-add seat setting

### n8n Workflow Cleanup
**ONLY AFTER 100% confidence in Supabase solution:**
1. Deactivate n8n workflow: "Stocker: Invite Team Member" (ID: TxrJyFmG4yNazEEF)
2. Keep archived for 30 days
3. Delete permanently after no issues

---

## 📝 NOTES

**Why This is Better:**
- Team management is **core SaaS logic**, not a workflow
- Supabase Edge Functions are designed for this exact use case
- Version controlled = auditable, testable, maintainable
- n8n should be reserved for **data processing** (PDF → routes)

**What We Learned:**
- XF Codec Phase Gates would have prevented n8n approach
- Architecture Decision must come BEFORE implementation
- Tool selection matters: right tool for the job

---

**Ready to deploy?** Follow steps 1-3 above, then run the testing checklist.
