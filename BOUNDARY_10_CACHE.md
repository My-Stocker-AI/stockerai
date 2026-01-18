# Boundary 10: Cache Invalidation - Deep Analysis
**Date:** 2026-01-17
**Status:** Complete

---

## Discovery Question

**Where can cached data become stale?**

---

## Discovered Failure Modes

### 1. ITEM CACHE

#### 1A. Cached items don't match DB
- **Trigger:** Item data updated in DB, cache not cleared
- **Symptom:** Wrong inventory counts displayed
- **Location:** `useItemCache.ts`
- **Likelihood:** 3/5 | **Impact:** 3/5 | **Priority:** 9
- **Action:** **AUDIT CACHE INVALIDATION**

#### 1B. Cache TTL too long
- **Trigger:** Cache expires after 1 hour, but data changes every 5 minutes
- **Symptom:** Stale data for up to 1 hour
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4

---

### 2. ROUTE LIST CACHE

#### 2A. New route not in cache
- **Trigger:** Route added via admin, cache not invalidated
- **Symptom:** User doesn't see new route until refresh
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4

---

### 3. SESSION CACHE

#### 3A. Stale session state
- **Trigger:** Session updated in DB, frontend cache stale
- **Symptom:** UI shows wrong progress
- **Likelihood:** 2/5 | **Impact:** 3/5 | **Priority:** 6
- **Already covered:** Boundary 1 (State Sync)

---

### 4. AI CONVERSATION CACHE

#### 4A. Old context affects new responses
- **Trigger:** AI uses cached conversation history
- **Symptom:** AI references old items no longer relevant
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4

---

### 5. SERVICE WORKER CACHE (PWA)

#### 5A. Old app version cached
- **Trigger:** Service worker caches old frontend bundle
- **Symptom:** Users see old UI after deployment
- **Likelihood:** 3/5 | **Impact:** 3/5 | **Priority:** 9
- **Action:** **CHECK SW UPDATE STRATEGY**

#### 5B. API responses cached inappropriately
- **Trigger:** SW caches dynamic API responses
- **Symptom:** Stale data from cached responses
- **Likelihood:** 1/5 | **Impact:** 3/5 | **Priority:** 3

---

### 6. CDN / CLOUDFLARE CACHE

#### 6A. Updated workflow not reflected
- **Trigger:** n8n workflow updated but CDN serves old webhook response
- **Symptom:** Old behavior persists
- **Likelihood:** 0/5 (webhooks not CDN cached) | **Impact:** 3/5 | **Priority:** 0

---

### 7. BROWSER CACHE

#### 7A. Hard refresh required after update
- **Trigger:** Browser caches JS/CSS with long TTL
- **Symptom:** Users don't see changes
- **Likelihood:** 2/5 | **Impact:** 2/5 | **Priority:** 4

---

## Risk Summary

| Failure Mode | Priority | Action |
|--------------|----------|--------|
| 1A. Item cache stale | 9 | **AUDIT INVALIDATION** |
| 1B. Cache TTL too long | 4 | **CHECK TTL** |
| 2A. Route list stale | 4 | Monitor |
| 3A. Session cache stale | 6 | Covered (Boundary 1) |
| 4A. AI context stale | 4 | Monitor |
| 5A. Service worker old app | 9 | **CHECK SW STRATEGY** |
| 5B. API response cache | 3 | Monitor |
| 6A. CDN cache | 0 | N/A |
| 7A. Browser cache | 4 | Monitor |

---

## High Priority (9+)

1. **Item cache invalidation** (Priority: 9) - Audit logic
2. **Service worker update strategy** (Priority: 9) - Ensure app updates

---

**Status:** 9 failure modes discovered, 2 high-priority caching issues
