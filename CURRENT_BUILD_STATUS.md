# Current Build Status - Commit 90036c3

**Date:** Jan 15, 2026 (Reset to Jan 13 Evening State)
**Commit:** 90036c3 "Team invite system: Add error logging and documentation"
**Status:** 🟢 **STABLE STATE - Last Known Working Before Third Machine Investigation**

---

## ✅ What's Included (All Session 37-39 Fixes)

### Session 37: 2-Item Mode Core Fixes
1. **2-Item Mode UI Display** ✅
   - Shows both items immediately on first pick
   - Done card includes both items
   - No duplicate display issues

2. **Greeting Prompt** ✅
   - Changed from "Starting now." to "Ready to go?"

3. **Desktop Refresh Resume** ✅
   - Voice system auto-resumes on page reload

4. **Route Switching** ✅
   - Clears stale completedItems when switching routes

### Session 38: Workflow-Based 2-Item Mode
5. **Count Parameter in Workflows** ✅
   - Modified workflows: get_next_item (Optimized), start_machine
   - Workflows return 2 items when count=2
   - Frontend sends count parameter based on localStorage setting

6. **2-Item Mode Crash Fix** ✅
   - Fixed: `result.product_name` instead of `result.item1.product_name`

### Session 39: Production Polish
7. **Pronunciation Display** ✅
   - UI shows correct spelling ("Can")
   - TTS uses pronunciation version ("Kan")

8. **Environment Type Selection** ✅ **← THE "MORE NOTICEABLE" BUTTONS**
   - Quiet 🏡 / Moderate 🏢 / Loud 🏭 buttons
   - Enhanced visual feedback (glowing shadow, scale-up)
   - Connected to Deepgram endpointing

9. **Environment Auto-Detect Fix** ✅
   - Prevents microphone conflict during active sessions

10. **Android Speakerphone Fix** ✅
    - TTS routes to speakerphone (not earpiece)
    - Uses HTMLAudioElement instead of AudioContext

11. **Team Invite Error Logging** ✅
    - Added error logging for debugging

---

## ❌ What's NOT Included (Intentionally Excluded)

### Database Constraints (Broke Delete Route)
- ❌ `active_sessions_must_have_route` constraint
- ❌ Edge Function NULL route filter
- **Why excluded:** Broke delete route functionality

### Performance Optimizations (Safe But Rolled Back)
- ❌ 10 database performance indexes
- ❌ Edge Function LIMIT 500
- ❌ Edge Function bandwidth optimization
- **Why excluded:** Removed during hard reset (safe to re-add later)

### Bundle Optimization (Broke /App Page)
- ❌ Lazy loading
- ❌ Code splitting
- **Why excluded:** Caused blank /app page

---

## 🐛 Known Issues in This Build

### Third Machine Bug (Unresolved)
**Symptom:** Route completes prematurely after 2 items on third machine
**Status:** ⚠️ **NOT FIXED IN THIS BUILD**
**Reason:** This is the bug we were trying to fix before everything broke
**Potential Root Cause (Never Tested):**
- Update Session node missing `Prefer: return=representation` header
- Session updates fail silently, index stays at old value
- Next machine looks for wrong item index → declares complete

---

## 📋 Database Migrations Present

```
20260104221625_d43b6195-f5c7-4371-b5fd-3cde3652138d.sql
20260104221650_eb2e8227-043a-4509-8b2b-6208c3449384.sql
20260104221822_d4333fcb-51c1-44de-b267-5c4ee73aa10d.sql
20260106205214_add_reference_columns.sql
20260110_seat_management_rpc.sql
20260111_get_next_item_data_rpc.sql  ← Edge Function optimization
20260111_keyword_learning.sql
```

**NOT Present:**
- ❌ 20260114_prevent_null_route_id_in_active_sessions.sql (constraint)
- ❌ 20260114_fix_edge_function_null_route_filter.sql (NULL filter)
- ❌ 20260115_add_critical_performance_indexes.sql (indexes)
- ❌ 20260115_fix_third_machine_limit_bug.sql (LIMIT 500)

---

## 🧪 Testing Checklist

### Critical Functions (Should Work)
- ✅ Delete route
- ✅ /App page loads
- ✅ 2-item mode (with localStorage toggle)
- ✅ Environment selection (Quiet/Moderate/Loud)
- ✅ Android speakerphone
- ✅ Pronunciation display

### Known Issues to Expect
- ⚠️ Third machine bug (route completes early)
- ⚠️ Possibly "next" command issues (user reported)
- ⚠️ Possibly "stop/continue" websocket errors (user reported)

---

## 🔧 If Issues Found

### "Next" Command Not Working
**Likely Cause:** Webhook path mismatch
**Check:** n8n workflow "get_next_item (Optimized)" is active
**Webhook:** Should be `/get-next-item-optimized`

### "Stop/Continue" Websocket Error
**Likely Cause:** WebSocket connection issue
**Check:** Browser console for specific error
**Possible Fix:** Check WEBHOOK_MAP in frontend

### Third Machine Bug
**Status:** Expected - not fixed in this build
**Don't Attempt:** Any database changes without thorough testing

---

## 📈 Next Steps After Testing

### If Everything Works Except Third Machine Bug:
1. Stay at this stable state
2. Investigate third machine bug in isolation
3. Test Update Session header fix (one change at a time)

### If "Next" or "Stop/Continue" Issues:
1. Check n8n execution logs
2. Verify webhook paths
3. May need to go to earlier/later commit

### If Want Performance Back:
1. Re-apply performance indexes (safe, no constraints)
2. Re-apply Edge Function optimization (safe)
3. Test after each addition

---

## ⏱️ Deployment

**Cloudflare:** Deploying now (2-3 minutes from push)
**Hard Refresh:** Ctrl+Shift+R to clear cache
**Test:** Wait for deployment, then test /app page

---

## 🚨 Emergency Rollback

If this state doesn't work, we can go:
- **Earlier:** Commit 01d1f31 (before team invite logging)
- **Later:** Commit 2e85e92 (before database constraints)

**DO NOT go to:**
- ❌ e05bb62 or later (has database constraints)
- ❌ 31f4dc9 or later (has bundle optimization)
