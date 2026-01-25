# Team Invite System - Isolated Testing Plan
**Date:** 2026-01-10
**Purpose:** Test new invite workflow OUTSIDE production before deployment

---

## 🎯 GOAL

Build and test the redesigned invite system in **complete isolation** from the production system, then swap once validated.

**Zero Risk to Production:**
- Existing workflow stays ACTIVE and untouched
- Users can continue inviting team members with current (buggy) workflow
- New workflow tested thoroughly before going live

---

## 📋 TESTING ENVIRONMENT SETUP

### Option 1: Duplicate Workflow (RECOMMENDED)

**What We'll Create:**

| Component | Production (Current) | Testing (New) |
|-----------|---------------------|---------------|
| **n8n Workflow** | "Stocker: Invite Team Member" (ID: TxrJyFmG4yNazEEF) | "Stocker: Invite Team Member (TEST)" (NEW ID) |
| **Webhook Path** | `/invite-team-member` | `/invite-team-member-test` |
| **Status** | ACTIVE (unchanged) | ACTIVE (for testing only) |
| **Frontend** | Team.tsx calls production webhook | TestInvite.tsx calls test webhook |

**How It Works:**
1. Create NEW workflow with correct logic
2. Use different webhook path: `/invite-team-member-test`
3. Create test page in frontend: `/test-invite`
4. Test thoroughly with real emails
5. Once validated → Deactivate old, activate new with production path

**Pros:**
- ✅ Zero impact on production
- ✅ Test with real Supabase database (same tables)
- ✅ Easy rollback (just deactivate test workflow)
- ✅ Can compare old vs new side-by-side

**Cons:**
- Test invites will create real users in production database
- Need to clean up test users after

---

### Option 2: Staging Supabase Project

**What We'd Need:**
- Separate Supabase project (staging database)
- Duplicate all tables, RLS policies
- Separate n8n workflow pointing to staging
- Test frontend pointing to staging

**Pros:**
- ✅ Complete isolation (no test data in production)
- ✅ Can break things without consequence

**Cons:**
- ❌ Takes time to set up staging environment
- ❌ Staging database won't have real account data
- ❌ Extra cost (separate Supabase project)

---

## 🎯 RECOMMENDED APPROACH: Option 1 (Duplicate Workflow)

**Reasoning:**
- Faster to implement (15 minutes vs hours for staging)
- Tests against real production data (better validation)
- Easy to clean up test users afterward
- Standard practice for workflow testing

---

## 📝 IMPLEMENTATION STEPS

### Step 1: Create Test Workflow (n8n)
1. ✅ Create NEW workflow: "Stocker: Invite Team Member (TEST)"
2. ✅ Use webhook path: `/invite-team-member-test`
3. ✅ Implement new logic:
   - Check user existence BEFORE create
   - Branch A: Update existing user
   - Branch B: Create new user
4. ✅ Activate workflow

**Test Webhook URL:**
`https://visionairy.app.n8n.cloud/webhook/invite-team-member-test`

---

### Step 2: Create Test Frontend Page
1. ✅ Create `/src/pages/TestInvite.tsx` (copy from Team.tsx)
2. ✅ Update webhook URL to test endpoint
3. ✅ Add route: `/test-invite`
4. ✅ Add warning banner: "TEST MODE - Testing new invite system"

**Access:**
- Navigate to: `https://my-stocker-ai.com/test-invite`
- Only accessible to you (no link from main nav)

---

### Step 3: Test Scenarios

**Test Data:**
- Use REAL email addresses (yours, test Gmail accounts)
- Use REAL account_id (your actual account)
- Test users will be created in production database

**5 Test Scenarios:**

| # | Scenario | Expected Result |
|---|----------|----------------|
| 1 | Invite NEW user (never existed) | Email sent, correct name, link to /set-password, user created |
| 2 | Invite EXISTING user (was in system before) | user_metadata updated, email sent, correct NEW name |
| 3 | Admin name with empty strings | Falls back to "Your Team Admin" |
| 4 | Invite same email twice in row | Second invite updates first |
| 5 | Invalid email format | Error message, no user created |

---

### Step 4: Validation Checklist

**Before approving for production:**

**Workflow Tests:**
- [ ] Test 1 passes (new user)
- [ ] Test 2 passes (existing user)
- [ ] Test 3 passes (empty string fallback)
- [ ] Test 4 passes (duplicate invite)
- [ ] Test 5 passes (error handling)

**n8n Execution Logs:**
- [ ] No "Unknown error" failures
- [ ] All executions show "success" status
- [ ] Execution time < 5 seconds

**Email Tests:**
- [ ] Email received within 1 minute
- [ ] Subject line correct
- [ ] Admin name shows correctly (not "()")
- [ ] Invitee name shows correctly in email
- [ ] Link goes to /set-password (not /login)

**Database Tests:**
- [ ] auth.users created with correct user_metadata
- [ ] profiles table has correct first_name, last_name
- [ ] account_users table has correct role, account_id

**Edge Cases:**
- [ ] User with NULL profile → Creates profile
- [ ] User with empty string names → Updates with new names
- [ ] User already in account_users → Shows "already member" error

---

### Step 5: Cleanup Test Data

**After testing complete, delete test users:**

```sql
-- Find test users
SELECT id, email, user_metadata FROM auth.users
WHERE email IN ('test1@example.com', 'test2@example.com');

-- Delete from account_users
DELETE FROM account_users WHERE user_id IN ('<test-user-ids>');

-- Delete from profiles
DELETE FROM profiles WHERE id IN ('<test-user-ids>');

-- Delete from auth.users (via Supabase Dashboard)
-- Authentication → Users → Search → Delete
```

---

### Step 6: Production Deployment

**Once all tests pass:**

1. ✅ Export test workflow JSON (backup)
2. ✅ **Option A: Replace production workflow**
   - Deactivate old workflow (TxrJyFmG4yNazEEF)
   - Update test workflow webhook path to `/invite-team-member`
   - Frontend already points to `/invite-team-member` (no change needed)

3. ✅ **Option B: Update production workflow in-place**
   - Export test workflow JSON
   - Import into production workflow (overwrites nodes)
   - Keep same webhook path

4. ✅ Test one real invite in production
5. ✅ Monitor for 24 hours
6. ✅ Delete test workflow after validation

---

## 🚨 ROLLBACK PLAN

**If test workflow has issues:**
- Just deactivate it
- Delete test frontend page
- No impact on production

**If production deployment has issues:**
- Deactivate new workflow
- Reactivate old workflow (TxrJyFmG4yNazEEF)
- Everything back to before

---

## ⏱️ TIMELINE

| Step | Time | Status |
|------|------|--------|
| Create test workflow | 30 min | ⏳ PENDING |
| Create test frontend page | 15 min | ⏳ PENDING |
| Run 5 test scenarios | 30 min | ⏳ PENDING |
| Validate results | 15 min | ⏳ PENDING |
| Cleanup test data | 10 min | ⏳ PENDING |
| Deploy to production | 10 min | ⏳ PENDING |
| **TOTAL** | **2 hours** | - |

---

## 📊 SUCCESS CRITERIA

**Test Phase Success:**
- ✅ All 5 test scenarios pass
- ✅ 0 workflow errors in n8n
- ✅ Emails sent with correct data
- ✅ Links go to /set-password

**Production Phase Success:**
- ✅ First production invite works correctly
- ✅ No errors in first 24 hours
- ✅ User feedback positive (correct names, working flow)

---

## 🤔 USER DECISION NEEDED

**Which testing approach do you prefer?**

**Option A (Recommended): Duplicate Workflow Testing**
- 2 hours total
- Tests with production database (real data)
- Requires cleanup afterward
- Standard approach

**Option B: Full Staging Environment**
- 1-2 days to set up
- Completely isolated
- No cleanup needed
- Overkill for this change

**Option C: Manual Testing Only**
- Just create workflow manually in n8n
- Test by calling webhook with Postman/curl
- No frontend changes needed
- Fastest (1 hour) but less thorough

---

**Which option do you want to proceed with?**
