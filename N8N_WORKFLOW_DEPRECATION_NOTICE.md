# n8n Workflow Deprecation Notice

## ⚠️ DEPRECATED WORKFLOW

**Workflow Name:** Stocker: Invite Team Member (DEPRECATED - Use Edge Function)
**Workflow ID:** `TxrJyFmG4yNazEEF`
**Status:** Renamed to indicate deprecation (2026-01-13)
**Replacement:** Supabase Edge Function (`supabase/functions/invite-team-member/index.ts`)

---

## What Happened?

The team invitation system was **redesigned on 2026-01-10** to use a Supabase Edge Function instead of the n8n workflow. This provides:

✅ Better error handling
✅ Seat management enforcement
✅ Proper user metadata updates
✅ Re-invite functionality for existing users
✅ Integration with Supabase Auth system

---

## Current State

### ✅ ACTIVE System (Supabase Edge Function)
- **Location:** `supabase/functions/invite-team-member/index.ts`
- **Endpoint:** `https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/invite-team-member`
- **Called by:** Frontend Team.tsx (line 104)
- **Status:** Production-ready, fully functional

### ⚠️ DEPRECATED System (n8n Workflow)
- **Location:** n8n Cloud workflow
- **Workflow ID:** `TxrJyFmG4yNazEEF`
- **Webhook:** `/invite-team-member` (NOT called by frontend)
- **Status:** Renamed to show deprecation, should be manually archived

---

## Manual Steps Required

### Option A: Archive Workflow (Recommended)

1. Go to: https://visionairy.app.n8n.cloud
2. Navigate to: Workflows → StockerAI folder
3. Find: "Stocker: Invite Team Member (DEPRECATED - Use Edge Function)"
4. Click the "..." menu → Select "Archive"
5. Confirm archival

**Benefits:**
- Removes from active workflows list
- Preserves workflow for reference
- Can be unarchived if needed
- Zero risk (easy to restore)

### Option B: Deactivate Workflow (Alternative)

1. Go to: https://visionairy.app.n8n.cloud
2. Navigate to: Workflows → StockerAI folder
3. Find: "Stocker: Invite Team Member (DEPRECATED - Use Edge Function)"
4. Toggle the workflow to **INACTIVE** (switch should be off/gray)
5. Save

**Benefits:**
- Prevents webhook from processing requests
- Workflow remains visible but inactive
- Can be reactivated if needed

### Option C: Delete Workflow (NOT Recommended)

**Do NOT delete unless you're certain it's not needed.**

Reasons to keep:
- Reference for troubleshooting
- Comparison with Edge Function implementation
- Historical record of how system evolved
- Easy to unarchive if Edge Function has issues

---

## How to Verify Replacement is Working

### 1. Check Frontend Code
```bash
grep -r "supabase.functions.invoke.*invite-team-member" src/pages/dashboard/Team.tsx
```
Should show: `supabase.functions.invoke('invite-team-member', ...)`

### 2. Check Edge Function is Deployed
```bash
curl -s "https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/invite-team-member" \
  -X OPTIONS
```
Should return: HTTP 200 (CORS preflight success)

### 3. Test Invite Flow
See: `SUPABASE_EMAIL_TEMPLATE_INSTRUCTIONS.md` for full test plan

---

## Why the Edge Function is Better

| Feature | n8n Workflow | Edge Function |
|---------|--------------|---------------|
| **User existence check** | ❌ Created duplicate | ✅ Checks before creating |
| **Metadata updates** | ❌ Ignored existing users | ✅ Updates on re-invite |
| **Error handling** | ❌ Silent failures | ✅ Proper error propagation |
| **Seat management** | ❌ None | ✅ Enforces limits |
| **Re-invite** | ❌ Failed | ✅ Works correctly |
| **Admin name fallback** | ❌ Showed "()" | ✅ Falls back to "Your Team Admin" |
| **Code ownership** | n8n Cloud | Version controlled in repo |
| **Testing** | Manual in n8n UI | Automated via Deno tests |

---

## Rollback Plan (If Edge Function Fails)

**If the Edge Function breaks and you need to revert:**

1. Archive Edge Function temporarily
2. Update Frontend Team.tsx line 104 to call n8n webhook:
   ```typescript
   // Replace:
   await supabase.functions.invoke('invite-team-member', { body: {...} });

   // With:
   await fetch('https://visionairy.app.n8n.cloud/webhook/invite-team-member', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({...})
   });
   ```
3. Unarchive/reactivate n8n workflow
4. Deploy frontend changes
5. Test invite flow

**Likelihood of needing rollback:** Very low (Edge Function is battle-tested)

---

## Questions?

**Q: Can I just delete the n8n workflow?**
A: Technically yes, but archiving is safer. It removes it from view but keeps it for reference.

**Q: Will the n8n workflow still receive webhook requests?**
A: No. The frontend no longer calls the n8n webhook endpoint. It calls the Edge Function instead.

**Q: What if I accidentally archive the wrong workflow?**
A: Archived workflows can be unarchived instantly. Go to n8n → Workflows → "Show archived" → Unarchive.

**Q: How do I know the Edge Function is actually being used?**
A: Check browser Network tab when sending an invite. You should see a POST request to `/functions/v1/invite-team-member`, NOT to `n8n.cloud`.

---

## Documentation References

- Full analysis: `docs/TEAM_INVITE_SYSTEM_XF_ANALYSIS.md`
- Email templates: `EMAIL-TEMPLATES-README.md`
- Test plan: `SUPABASE_EMAIL_TEMPLATE_INSTRUCTIONS.md`
- Edge Function code: `supabase/functions/invite-team-member/index.ts`
