# Team Management Deployment Status
**Date:** 2026-01-10
**Session:** 32

---

## ✅ COMPLETED (No User Action Needed)

### 1. Edge Function - DEPLOYED ✅
- **Function:** `invite-team-member`
- **Status:** Live at https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/invite-team-member
- **Dashboard:** https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke/functions
- **Deployed:** 2026-01-10 (via `npx supabase functions deploy`)

### 2. Frontend - AUTO-DEPLOYING ✅
- **Status:** Pushed to GitHub main branch
- **Cloudflare:** Auto-deploying (5-10 minutes)
- **URL:** https://my-stocker-ai.com
- **Change:** Team.tsx now calls Supabase Edge Function instead of n8n webhook

---

## ⏳ PENDING (1 Quick Manual Step Required)

### Database Migration - Needs 60 Seconds of Your Time

**What:** Create the `check_seat_availability` RPC function in your database

**Why manual:** Supabase CLI has migration tracking issues (trying to re-run old migrations that are already applied)

**How to deploy (60 seconds):**

1. **Open Supabase Dashboard:**
   - Go to: https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke
   - Click: **SQL Editor** (left sidebar)

2. **Run the SQL:**
   - Click: **New Query**
   - Copy-paste the contents of: `/home/visionairy/StockerAI/deploy_seat_management.sql`
   - Click: **Run** (or press Cmd/Ctrl + Enter)

3. **Verify success:**
   - Should see: "Success. No rows returned"
   - That means the function was created

**OR** (if you prefer one command):

```sql
-- Just copy-paste this entire block into SQL Editor and click Run:

CREATE OR REPLACE FUNCTION check_seat_availability(p_account_id UUID, p_role TEXT DEFAULT 'driver')
RETURNS TABLE (
  total_seats INTEGER,
  used_seats INTEGER,
  available_seats INTEGER,
  can_add BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_count INTEGER;
  v_active_drivers INTEGER;
BEGIN
  SELECT driver_count INTO v_driver_count FROM accounts WHERE id = p_account_id;
  IF v_driver_count IS NULL THEN RAISE EXCEPTION 'Account not found: %', p_account_id; END IF;

  SELECT COUNT(*) INTO v_active_drivers FROM account_users WHERE account_id = p_account_id AND role = 'driver';

  IF p_role = 'primary_admin' THEN
    RETURN QUERY SELECT v_driver_count, v_active_drivers, (v_driver_count - v_active_drivers), TRUE, 'Admins are unlimited';
    RETURN;
  END IF;

  IF v_active_drivers >= v_driver_count THEN
    RETURN QUERY SELECT v_driver_count, v_active_drivers, 0, FALSE, 'Driver seat limit reached. Upgrade plan to add more drivers.';
  ELSE
    RETURN QUERY SELECT v_driver_count, v_active_drivers, (v_driver_count - v_active_drivers), TRUE, 'Seat available';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_seat_availability(UUID, TEXT) TO authenticated;
```

---

## 🧪 AFTER YOU RUN THE SQL

### Test the deployment:

1. **Test the RPC function (in SQL Editor):**
   ```sql
   SELECT * FROM check_seat_availability(
     '6ed5d948-479c-466a-8c95-67246c821e66'::UUID,  -- Your account ID
     'driver'
   );
   ```
   - Should show your current seat usage

2. **Test the frontend:**
   - Go to https://my-stocker-ai.com/dashboard/team
   - Click "Invite Team Member"
   - Try inviting someone
   - Should see success message (no more n8n webhook errors)

---

## 📊 What's Different Now

| Component | Before (n8n) | After (Supabase) |
|-----------|--------------|------------------|
| **Invite Logic** | n8n workflow | Edge Function (deployed ✅) |
| **Seat Checks** | None (revenue leak!) | RPC function (needs manual deploy) |
| **Frontend** | Calls n8n webhook | Calls Supabase Edge Function (deployed ✅) |
| **Version Control** | GUI changes only | Git-tracked TypeScript ✅ |

---

## ❓ Why Can't This Be Fully Automated?

The Supabase CLI is trying to run ALL migrations from the beginning, but your database already has structures from previous migrations. This creates a conflict.

**The workaround:** Run just the new SQL directly in the dashboard (which takes 60 seconds).

**Future migrations:** Once this is deployed, future migrations will work normally via CLI.

---

## 🎯 Summary

**DONE:** Edge Function deployed, Frontend deploying, Code committed
**TODO:** Run 1 SQL query in Supabase dashboard (60 seconds)
**THEN:** Test and celebrate! 🎉

Let me know when you've run the SQL and I'll help you test it!
