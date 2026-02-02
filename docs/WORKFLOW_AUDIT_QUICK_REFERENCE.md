# StockerAI Workflow Audit - Quick Reference
**Date:** 2026-02-01

## Critical Issues (Fix Now)

| # | Workflow | Issue | Impact | Fix Time |
|---|----------|-------|--------|----------|
| 1 | get_next_item | 🔥 Hardcoded service_role API key in code | **CRITICAL SECURITY** | 15 min |
| 2 | All | No RLS on tables | Multi-tenant blocker | 2-4 hours |
| 3 | delete_route | No CASCADE DELETE verification | Data integrity | 30 min |

## High Priority Issues (Fix This Sprint)

| # | Workflow | Issue | Impact | Fix Time |
|---|----------|-------|--------|----------|
| 4 | skip_current_machine | Can skip already-skipped machine | State corruption | 20 min |
| 5 | get_next_item | Slow Edge Function + workflow queries | 50-70% slower | 2 hours |
| 6 | switch_route | No transaction safety | Data corruption | 2 hours |
| 7 | set_route_sequence | Route error doesn't stop execution | Broken session | 15 min |
| 8 | get_next_item | No optimistic locking | Race condition | 30 min |

## Workflow Health Score

| Workflow | Score | Status | Critical Issues | High Issues | Med/Low Issues |
|----------|-------|--------|-----------------|-------------|----------------|
| delete_route | ✅ 95/100 | PASS | 0 | 0 | 1 assumption |
| go_back_to_skipped | ✅ 90/100 | PASS | 0 | 0 | 2 minor |
| start_machine | ✅ 88/100 | PASS | 0 | 0 | 3 minor |
| get_current_status | ✅ 85/100 | PASS | 0 | 1 | 2 minor |
| set_route_sequence | ⚠️ 75/100 | WARN | 0 | 1 | 4 warnings |
| skip_current_machine | ⚠️ 70/100 | WARN | 1 | 1 | 3 warnings |
| switch_route | ⚠️ 68/100 | WARN | 0 | 1 | 4 warnings |
| get_next_item | ❌ 55/100 | FAIL | 1 | 2 | 4 warnings |

## Quick Fixes (< 30 min each)

### Fix 1: Remove Hardcoded API Key (get_next_item)
**Node:** Increment Completed Items
**Action:** Replace Code node with HTTP Request node
```
- Method: PATCH
- URL: https://wvtkuposrlvadyeixlke.supabase.co/rest/v1/machines?id=eq.{{ $json.machine_id }}
- Auth: Use credential "my-stocker-ai Supabase Secret Key"
- Headers: Prefer: return=minimal
- Body: { "completed_items": {{ $json.new_completed_items }} }
```

### Fix 2: Stop on Route Error (set_route_sequence)
**Location:** After "Find Route" node
**Action:** Add IF node
```javascript
// Condition: {{ $json.error }} exists
// TRUE branch: Return error (connect to webhook response)
// FALSE branch: Continue to Pause Other Sessions
```

### Fix 3: Validate Skip Status (skip_current_machine)
**Node:** Prepare Skip Update
**Action:** Add validation
```javascript
// Add before return:
if (machine.status === 'skipped') {
  throw new Error('Machine already skipped. Say "go back" to resume.');
}
```

### Fix 4: Verify CASCADE (delete_route)
**Action:** Run SQL query
```sql
-- Check if CASCADE exists
SELECT delete_rule
FROM information_schema.referential_constraints
WHERE constraint_name LIKE '%routes%machines%';

-- If NOT 'CASCADE', add manual delete nodes before Delete Route
```

## Performance Optimization Targets

| Workflow | Current | Target | Method |
|----------|---------|--------|--------|
| get_next_item | 1200-1800ms | 400-600ms | Single Edge Function |
| get_current_status | 500-800ms | 100-200ms | Joined query |
| set_route_sequence | 1200-1800ms | 800-1200ms | Reduce HTTP calls |
| switch_route | 2000-3000ms | 1000-1500ms | Transaction function |

## Test Checklist (After Fixes)

### Critical Path Testing
- [ ] Get next item works (regular flow)
- [ ] Skip machine works (not already skipped)
- [ ] Skip machine errors if already skipped
- [ ] Switch route preserves progress
- [ ] Switch route resets progress
- [ ] Delete route verifies ownership
- [ ] Delete route cascades to machines/items

### Edge Cases
- [ ] Rapid "next" commands (race condition)
- [ ] Skip last machine (route completion)
- [ ] Skip already-skipped (error handling)
- [ ] Switch to non-existent route (error)
- [ ] Delete active route (should block?)

### Performance
- [ ] get_next_item < 600ms
- [ ] get_current_status < 300ms
- [ ] All workflows respond within 2 seconds

## Monitoring Recommendations

### Key Metrics to Track
1. **Workflow execution time** (p50, p95, p99)
2. **Error rate by workflow** (errors / total executions)
3. **Database query count per workflow**
4. **API key exposure checks** (scan code nodes)

### Alerts to Set
- Error rate > 5% for any workflow
- Average execution time > 3 seconds
- Any workflow disabled/inactive unexpectedly

## See Full Report
For detailed analysis, fixes, and code examples:
- `/home/visionairy/StockerAI/docs/WORKFLOW_AUDIT_2026-02-01.md`
