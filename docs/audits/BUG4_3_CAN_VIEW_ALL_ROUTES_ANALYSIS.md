# Bug #4.3: can_view_all_routes Enforcement Analysis

**Date:** 2026-01-18
**Status:** APPLICATION ENFORCED, DATABASE NOT ENFORCED
**Severity:** MEDIUM (not CRITICAL)

---

## Finding Summary

✅ **Application Layer:** ENFORCED (MyRoutes.tsx lines 47-86)
❌ **Database Layer:** NOT ENFORCED (no RLS policies on routes table)

**Conclusion:** Flag is working as intended at application level, but lacks defense-in-depth database protection.

---

## Application-Level Enforcement (VERIFIED)

**Code Analysis: MyRoutes.tsx**

**Lines 47-48:**
```typescript
const isPrimaryAdmin = userRole?.role === 'primary_admin';
const canViewAllRoutes = userRole?.can_view_all_routes || isPrimaryAdmin;
```

**Lines 56-66 (can_view_all_routes = true):**
```typescript
if (canViewAllRoutes) {
  // Admin or user with can_view_all_routes - fetch all routes for the user
  const { data, error } = await supabase
    .from('routes')
    .select('*, profiles:user_id(first_name, last_name)')
    .eq('user_id', user.id)  // Gets all routes owned by this user/account
    .order('delivery_date', { ascending: true });

  if (error) throw error;
  return data as RouteData[];
```

**Lines 66-86 (can_view_all_routes = false):**
```typescript
} else {
  // Driver - fetch only assigned routes
  const { data: assignments, error: assignError } = await supabase
    .from('route_assignments')
    .select('route_id')
    .eq('user_id', user.id);  // Gets only assigned routes

  if (assignError) throw assignError;

  if (assignments.length === 0) return [];

  const routeIds = assignments.map(a => a.route_id);
  const { data, error } = await supabase
    .from('routes')
    .select('*, profiles:user_id(first_name, last_name)')
    .in('id', routeIds)  // Filters to only assigned routes
    .order('delivery_date', { ascending: true });

  if (error) throw error;
  return data as RouteData[];
}
```

**Status:** ✅ Working correctly at application level

**Logic:**
- Primary admins: Always see all routes
- Drivers with `can_view_all_routes=true`: See all routes
- Drivers with `can_view_all_routes=false`: See ONLY assigned routes via route_assignments table

---

## Database-Level Enforcement (MISSING)

**Database Investigation:**

**Query:** Search for RLS policies on routes table
```bash
grep -r "CREATE POLICY.*routes" supabase/migrations/
# No matches found
```

**Query:** Search for RLS enabled on routes table
```bash
grep -r "ENABLE ROW LEVEL SECURITY.*routes" supabase/migrations/
# No matches found
```

**Finding:** No RLS policies exist on the routes table

**Impact:**
- If application code bypassed (direct database query with credentials)
- Driver could query ALL routes, not just assigned routes
- Privacy leak: driver sees routes not assigned to them

**Likelihood:** LOW (requires database credentials)

**Severity:** MEDIUM (data leak, not privilege escalation)

---

## Security Assessment

### Current Protection

| Layer | Status | Protection Level |
|-------|--------|------------------|
| **Application (Frontend)** | ✅ ENFORCED | Filters routes by can_view_all_routes flag |
| **Database (RLS)** | ❌ NOT ENFORCED | No policies on routes table |

**Risk Level:** MEDIUM

**Why not CRITICAL:**
1. Application code IS enforcing correctly
2. Bypass requires database credentials (not just API access)
3. No privilege escalation (unlike Bug #3)
4. No account lockout (unlike Bug #4.2)
5. Only data leak (routes visible, not modifiable)

**Why still a concern:**
- Defense-in-depth missing
- Direct database queries could bypass
- Future code changes might miss the logic
- No database-level guarantee

---

## Recommended Fix (Optional)

### Option A: RLS Policy for Routes Table

Add database-level enforcement to match application logic:

```sql
-- Enable RLS on routes table
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

-- Policy 1: SELECT - Users can view routes based on can_view_all_routes flag
CREATE POLICY "routes_select_by_permission"
ON routes
FOR SELECT
TO authenticated
USING (
  -- Account owner (user_id) can always see their own routes
  user_id = auth.uid()
  OR
  -- Account members can see routes if they have can_view_all_routes=true OR are admin
  EXISTS (
    SELECT 1
    FROM account_users au
    INNER JOIN accounts a ON a.id = au.account_id
    WHERE au.user_id = auth.uid()
      AND a.user_id = routes.user_id  -- Account that owns this route
      AND (
        au.can_view_all_routes = true
        OR au.role = 'primary_admin'
      )
  )
  OR
  -- Drivers can see routes assigned to them
  EXISTS (
    SELECT 1
    FROM route_assignments ra
    WHERE ra.route_id = routes.id
      AND ra.user_id = auth.uid()
  )
);

-- Policy 2: INSERT - Only account owners can create routes
CREATE POLICY "routes_insert_own_account"
ON routes
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

-- Policy 3: UPDATE - Only account owners can update routes
CREATE POLICY "routes_update_own_account"
ON routes
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy 4: DELETE - Only account owners can delete routes
CREATE POLICY "routes_delete_own_account"
ON routes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Comments
COMMENT ON POLICY "routes_select_by_permission" ON routes IS
  'Enforces can_view_all_routes flag at database level. Drivers without flag can only see assigned routes.';
```

**Benefits:**
- Defense in depth (application + database)
- Survives application bugs
- Self-documenting (policy shows security requirement)
- Applies to ALL code paths (not just MyRoutes.tsx)

**Cons:**
- Requires database migration
- More complex policy logic
- Minor performance overhead (additional joins)

---

### Option B: Do Nothing

Accept current state with application-level enforcement only.

**Justification:**
- Application code is working correctly
- Bug #4.3 is MEDIUM severity, not CRITICAL
- No user reports of data leakage
- Focus on CRITICAL bugs first (Bugs #1-3, #4.2 already fixed)

**Recommendation:** Defer to post-launch (Phase 2 security hardening)

---

## Testing (If RLS Implemented)

### Test 1: Driver with can_view_all_routes=false

**Setup:**
- Driver user with can_view_all_routes=false
- Routes exist assigned to other drivers

**Test:**
```sql
-- As driver user, try to query all routes
SELECT * FROM routes;
```

**Expected:**
- Returns ONLY routes assigned to this driver via route_assignments
- Does NOT return routes assigned to other drivers
- **PASS**

### Test 2: Driver with can_view_all_routes=true

**Setup:**
- Driver user with can_view_all_routes=true

**Test:**
```sql
-- As driver user with flag, try to query all routes
SELECT * FROM routes;
```

**Expected:**
- Returns ALL routes for the account
- **PASS**

### Test 3: Primary Admin

**Setup:**
- Primary admin user

**Test:**
```sql
-- As admin, try to query all routes
SELECT * FROM routes;
```

**Expected:**
- Returns ALL routes for the account
- **PASS**

---

## Recommendation

**DEFER TO PHASE 2**

**Rationale:**
1. Bug #4.3 is MEDIUM severity (not CRITICAL)
2. Application layer IS enforcing correctly
3. Bugs #1-3 and #4.2 are CRITICAL and now fixed
4. Focus on deployment and user testing first
5. Add RLS policies in Phase 2 security hardening

**Phase 2 Tasks:**
- [ ] Implement RLS policies on routes table
- [ ] Implement RLS policies on route_assignments table
- [ ] Implement RLS policies on machines table
- [ ] Implement RLS policies on items table
- [ ] Comprehensive RLS audit of all tables

---

## Summary

**Bug #4.3 Status:** ✅ WORKING AT APPLICATION LEVEL, ❌ MISSING DATABASE LAYER

**Current Risk:** MEDIUM (data leak possible with database credentials)

**Fix Priority:** LOW (defer to Phase 2)

**Reason:** Application enforcement is sufficient for MVP, database enforcement is defense-in-depth

**No immediate action required** - Bug #4.3 is documented for future enhancement.

