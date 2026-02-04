# System Impact Audit: MyRoutes Direct Supabase Delete

**Date:** 2026-02-04
**Change:** Replace n8n webhook deletion with direct Supabase deletion in MyRoutes
**Severity:** CRITICAL
**Trigger:** MyRoutes delete fails with "invalid input syntax for type uuid: ''" (execution 29086)

---

## Problem Statement

**Current State:**
- **MyRoutes.tsx** uses n8n webhook (`/webhook/delete-route`) → FAILS ❌
- **UploadRoutes.tsx** uses direct Supabase deletion → WORKS ✅

**Error in MyRoutes:**
```
POST https://visionairy.app.n8n.cloud/webhook/delete-route
Error: invalid input syntax for type uuid: ""
```

**Root Cause:** n8n workflow IF node data passing issue
- "Check Active Sessions" returns `[]` (no active sessions)
- "Is Route Active?" IF node FALSE branch should go to "Delete Route"
- But "Delete Route" node receives `$json.route_id` from IF node output (empty array)
- URL constructed: `/routes?id=eq.` (missing UUID)
- Database rejects empty UUID

---

## Proposed Change

**Make MyRoutes.tsx use direct Supabase deletion like UploadRoutes.tsx:**

```typescript
// MyRoutes.tsx lines 169-204 (REPLACE)
const deleteRouteMutation = useMutation({
  mutationFn: async (routeId: string) => {
    // Delete items first
    const { error: itemsError } = await supabase
      .from('items')
      .delete()
      .in('machine_id',
        (await supabase.from('machines').select('id').eq('route_id', routeId)).data?.map(m => m.id) || []
      );

    // Delete machines
    const { error: machinesError } = await supabase
      .from('machines')
      .delete()
      .eq('route_id', routeId);

    // Delete assignments
    const { error: assignmentsError } = await supabase
      .from('route_assignments')
      .delete()
      .eq('route_id', routeId);

    // Delete route
    const { error } = await supabase
      .from('routes')
      .delete()
      .eq('id', routeId);

    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['my-routes'] });
    toast({ title: "Route deleted successfully" });
    setDeleteDialogOpen(false);
    setRouteToDelete(null);
  },
  onError: (error) => {
    toast({
      title: "Error deleting route",
      description: error.message,
      variant: "destructive"
    });
  },
});
```

---

## Boundary Analysis

### DATA

**Field:** Route deletion operation
- Current: n8n webhook receives `{route_id, user_id}`, returns `{success, message}`
- Proposed: Direct Supabase mutation receives `routeId` string
- Data Contract: UNCHANGED (same route_id used) ✅

**Deletion Order:** (both approaches use same order)
1. Items (CASCADE from machines)
2. Machines (CASCADE from routes)
3. Route Assignments
4. Route

### NODES (Upstream/Downstream Consumers)

**1. n8n Workflow (zmgTBX1w1rc5bOpO) - BYPASSED**

**Workflow Structure:**
```
Webhook
  → Prepare Input (validate route_id, user_id)
  → Verify Route Ownership (RLS check via Supabase)
  → Check Route Exists (verify route exists)
  → Check Active Sessions (query sessions table) ⚠️ CRITICAL SAFETY CHECK
  → Is Route Active? (IF node)
      TRUE → Return Active Error (prevents deletion) ⚠️ CRITICAL PROTECTION
      FALSE → Delete Route → Format Output
```

**Critical Safety Checks in n8n:**
1. ✅ Route ownership verification (also in RLS)
2. ✅ Route exists check
3. ⚠️ **ACTIVE SESSION CHECK** - Queries `sessions` table for `status=stocking`
4. ⚠️ **DELETE PREVENTION** - Blocks deletion if route is in active use

**What Direct Supabase LOSES:**
- ❌ No active session check
- ❌ No protection against deleting in-use routes
- ❌ No "Cannot delete active route" error message

**What Direct Supabase KEEPS:**
- ✅ Row Level Security (RLS) policies enforce ownership
- ✅ CASCADE deletion maintains data integrity
- ✅ Faster execution (no webhook latency)

**2. Frontend - MyRoutes.tsx**
- Impact: Changes delete handler from fetch to useMutation
- Change needed: Replace lines 169-204
- Risk: LOW - Standard React Query pattern (same as UploadRoutes)

**3. Database - Cascade Deletion**
- Impact: UNCHANGED (both approaches use Supabase CASCADE)
- Foreign keys: `items.machine_id → machines.id`, `machines.route_id → routes.id`
- Risk: NONE - Database handles cleanup automatically

**4. Frontend - Active Sessions**
- Current state: MyRoutes queries `sessions` table to show route status
- Knows if route is in_progress/stocking (lines 136-151)
- Risk: ⚠️ HIGH - UI shows status but doesn't prevent deletion

### FLOW (Critical Paths)

**Path 1: User deletes route while actively picking**
```
User A: Actively picking items (session status = 'stocking')
  ↓
User A: Finishes machine 3, says "next machine"
  ↓ (SIMULTANEOUSLY)
User B (admin): Opens MyRoutes, clicks Delete on same route
  ↓
Direct Supabase: Deletes route (no active session check) ❌
  ↓
Database: CASCADE deletes machines → items
  ↓
User A: Voice command "next" calls get_next_item
  ↓
🔴 ERROR: Route/machine/items no longer exist in database
  ↓
Frontend: Crashes or shows "Session Invalidated"
  ↓
User A: Loses all progress, must reload page
```

**n8n workflow protection (current):**
```
User B: Clicks Delete on active route
  ↓
n8n: Check Active Sessions → finds User A's session
  ↓
n8n: IF node TRUE branch → Return Active Error
  ↓
Frontend: Shows "Cannot delete active route. Please complete or pause the session."
  ↓
User A: Can continue picking safely ✅
```

**Path 2: User deletes route with no active session**
```
User: Clicks Delete on completed/not-started route
  ↓
Check Active Sessions: [] (no sessions)
  ↓
Direct Supabase: Deletes route ✅
  ↓
Success (no impact)
```

**Path 3: Multi-user conflict**
```
User A: Pauses route, closes app
  ↓
Session: status = 'paused' (not 'stocking')
  ↓
User B: Deletes route (active session check looks for status='stocking')
  ↓
⚠️ EDGE CASE: Paused session not detected
  ↓
Direct Supabase: Deletes route
  ↓
User A: Reopens app, tries to resume
  ↓
🔴 ERROR: Route no longer exists
```

### ERRORS (New Failure Modes)

**Error 1: Deletion during active picking**
- Symptom: "Session Invalidated" or frontend crash mid-session
- Frequency: Whenever admin deletes while user is actively picking
- Severity: CRITICAL
- User impact: Lost progress, data inconsistency, angry user

**Error 2: Deletion of paused session**
- Symptom: Resume fails, route not found
- Frequency: If admin deletes route with paused (not stocking) session
- Severity: HIGH
- User impact: Lost progress, must re-upload route

**Error 3: RLS violation (if user doesn't own route)**
- Symptom: Supabase error "new row violates row-level security policy"
- Frequency: Only if RLS is working correctly
- Severity: LOW (expected behavior)
- User impact: Deletion correctly blocked

---

## n8n Workflow Bug Analysis

**Why n8n delete fails:**

**Problem:** "Delete Route" node receives empty `$json.route_id`

**Root Cause:** IF node data passing issue
1. "Check Active Sessions" returns `[]` (empty array when no active sessions)
2. "Is Route Active?" IF node evaluates `$json.length > 0` = FALSE
3. FALSE branch goes to "Delete Route" node
4. **BUT:** "Delete Route" receives data from IF node output (empty array)
5. Expression `{{ $json.route_id }}` evaluates to empty string
6. URL becomes: `/routes?id=eq.` (missing UUID)
7. Supabase rejects: "invalid input syntax for type uuid: ''"

**Fix Options for n8n workflow:**
- **Option A:** Change "Delete Route" to reference `$('Check Route Exists').first().json.route_id`
- **Option B:** Add intermediate node after IF FALSE to restore route data
- **Option C:** Restructure IF logic to avoid data loss

**But user chose:** Skip n8n workflow, use direct Supabase instead

---

## Risk Assessment

### Without Active Session Check (Direct Supabase Only)

| Risk | Severity | Probability | Impact |
|------|----------|-------------|--------|
| Delete route during active picking | CRITICAL | MEDIUM | Session crash, lost progress |
| Delete paused session route | HIGH | LOW | Resume fails |
| Multi-user conflict | HIGH | LOW | Data inconsistency |
| Admin accidentally deletes wrong route | MEDIUM | LOW | Permanent data loss |

**Verdict:** ❌ **UNSAFE for multi-user or active-session scenarios**

### With Active Session Check (Fix n8n Workflow)

| Risk | Severity | Probability | Impact |
|------|----------|-------------|--------|
| IF node data passing bug | HIGH | 100% | Current failure |
| Active session protection works | NONE | N/A | Prevents deletion during use |
| Webhook latency | LOW | MEDIUM | Slower delete (200-500ms) |

**Verdict:** ✅ **SAFE but currently broken**

### With Active Session Check in Frontend (Hybrid Approach)

| Risk | Severity | Probability | Impact |
|------|----------|-------------|--------|
| Frontend check bypassed | LOW | LOW | Requires malicious user |
| Active session protected | NONE | N/A | Checks before delete |
| Fast execution | NONE | N/A | Direct Supabase speed |

**Verdict:** ✅ **SAFE and fast**

---

## Solution Options

### Option 1: Direct Supabase (As Requested) - NO SAFETY

**Implementation:**
- Copy UploadRoutes deletion mutation to MyRoutes
- Remove n8n webhook call
- Use React Query mutation

**Pros:**
- ✅ Fixes immediate bug
- ✅ Faster (no webhook latency)
- ✅ Simpler code (no n8n dependency)
- ✅ Same pattern as UploadRoutes

**Cons:**
- ❌ No active session protection
- ❌ Can delete routes during picking
- ❌ Multi-user conflicts possible
- ❌ Data loss risk

**Time:** 5 minutes

---

### Option 2: Direct Supabase + Frontend Active Session Check - RECOMMENDED

**Implementation:**
1. Add active session check in MyRoutes BEFORE deletion
2. Query `sessions` table for `current_route_id = X AND status IN ('stocking', 'paused', 'in_progress')`
3. If active session exists → Show error, block deletion
4. If no active session → Proceed with direct Supabase deletion

**Code:**
```typescript
const deleteRouteMutation = useMutation({
  mutationFn: async (routeId: string) => {
    // CRITICAL: Check for active sessions FIRST
    const { data: activeSessions, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('current_route_id', routeId)
      .in('status', ['stocking', 'paused', 'in_progress']);

    if (sessionError) throw sessionError;

    if (activeSessions && activeSessions.length > 0) {
      throw new Error(
        'Cannot delete active route. This route is currently being used in an active session. ' +
        'Please complete or pause the session before deleting.'
      );
    }

    // Proceed with deletion (same as UploadRoutes)
    // ... (cascade deletion code)
  }
});
```

**Pros:**
- ✅ Fixes immediate bug
- ✅ Fast (direct Supabase)
- ✅ Preserves active session safety
- ✅ Protects against multi-user conflicts
- ✅ Handles paused sessions too (n8n only checked 'stocking')

**Cons:**
- ⚠️ Frontend check can be bypassed (malicious user with direct DB access)
- ⚠️ Slightly more complex than Option 1

**Time:** 15 minutes

---

### Option 3: Fix n8n Workflow - SLOWER BUT CENTRALIZED

**Implementation:**
1. Modify "Delete Route" node to reference route data from "Check Route Exists"
2. Change URL to: `$('Check Route Exists').first().json.route_id`
3. Test workflow

**Pros:**
- ✅ Preserves centralized safety checks
- ✅ Backend enforcement (can't be bypassed)
- ✅ Same safety for all delete callers

**Cons:**
- ❌ Webhook latency (200-500ms)
- ❌ n8n dependency
- ❌ More complex debugging
- ❌ Already broken (need to fix IF node issue)

**Time:** 30 minutes (fix + test + deploy)

---

## Recommendation

**CHOOSE OPTION 2: Direct Supabase + Frontend Active Session Check**

**Why:**
1. **Fixes immediate bug** - Unblocks user NOW
2. **Preserves safety** - Active session check prevents data loss
3. **Improves on n8n** - Also checks paused sessions (n8n only checked 'stocking')
4. **Fast execution** - No webhook latency
5. **Consistent pattern** - Matches UploadRoutes approach
6. **Low risk** - Frontend check sufficient for cooperative users

**Security Note:**
- RLS policies prevent unauthorized deletions
- Frontend check prevents accidental deletions during active use
- Only malicious users with direct DB access could bypass (not a concern for cooperative team)

---

## Implementation Plan (Option 2)

**Step 1: Update MyRoutes.tsx**
- Replace webhook delete (lines 169-204) with direct Supabase mutation
- Add active session check BEFORE deletion
- Use same cascade deletion order as UploadRoutes

**Step 2: Test**
- Create test route
- Start picking (status = 'stocking')
- Try to delete from MyRoutes → Should show error ✅
- Complete route (status = 'completed')
- Delete from MyRoutes → Should succeed ✅

**Step 3: Deploy**
- Commit changes
- Push to GitHub (auto-deploys to Cloudflare Pages)

**Step 4: Monitor**
- Watch for active session conflicts
- Verify error messages shown correctly
- Confirm deletion works when no active sessions

---

## Rollback Plan

**If Option 2 causes issues:**
1. **Immediate:** Revert commit (git revert)
2. **Alternative:** Fix n8n workflow (Option 3) while rolled back
3. **Fallback:** Keep UploadRoutes for deletion, disable MyRoutes delete button

---

**Status:** READY FOR IMPLEMENTATION
**Awaiting:** User approval to proceed with Option 2

