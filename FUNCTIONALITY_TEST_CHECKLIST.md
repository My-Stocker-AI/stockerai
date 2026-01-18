# Stocker AI Functionality Test Checklist
**Date:** 2026-01-18
**Purpose:** Comprehensive test plan to coordinate with bug fixes
**Version:** 1.0

---

## Test Protocol

**For each fix that impacts UX:**
1. Run ALL relevant tests from this checklist
2. Mark ✅ PASS or ❌ FAIL with notes
3. Only proceed to next fix after all tests pass

**Test Environment:**
- Device: [Android/iOS/Desktop]
- Browser: [Chrome/Safari/Firefox]
- Date: [YYYY-MM-DD]
- Routes loaded: [Route names]

---

## CRITICAL PATH TESTS (Must Work Every Time)

### 1. Session Initialization
- [ ] App loads without errors
- [ ] User profile displays correctly on Teams page
- [ ] Routes list loads for today's date
- [ ] Can select a route and start voice session
- [ ] Session persists across page refresh

### 2. Voice Recognition - Basic Commands
- [ ] "OK Stocker" wakes the app (from paused/muted)
- [ ] "What's next" → Speaks current item
- [ ] "Next" → Moves to next item
- [ ] "Done" → Moves to next item
- [ ] "Got it" → Moves to next item
- [ ] "Repeat" → Repeats last spoken response

### 3. Voice Control - Stop/Pause/Resume
- [ ] **CRITICAL:** "Stop" button stops voice mid-speech
- [ ] **CRITICAL:** "Pause" button pauses listening
- [ ] **CRITICAL:** "Resume" button resumes listening
- [ ] **CRITICAL:** "Hey Stocker" wakes from paused state
- [ ] **CRITICAL:** Mute button mutes microphone
- [ ] **CRITICAL:** Unmute button unmutes microphone

### 4. Machine Navigation
- [ ] "Skip machine" → Asks for confirmation
- [ ] Confirm "yes" → Skips to next machine
- [ ] "Go back" → Returns to skipped machine
- [ ] "Top" (when asked) → Starts from first item
- [ ] "Bottom" (when asked) → Starts from last item

### 5. Route Management
- [ ] Can view available routes
- [ ] Can select route by saying route name
- [ ] Can switch routes mid-session
- [ ] Progress saves when switching (if requested)

---

## ERROR RECOVERY TESTS

### 6. Network Failures
- [ ] Turn off internet → "No internet connection" error
- [ ] Turn on internet → Resumes normally
- [ ] n8n timeout → Retry logic works (check console)
- [ ] Deepgram disconnects → Reconnects automatically (check console for backoff)

### 7. Microphone Issues
- [ ] Deny mic permission → Clear error message
- [ ] Grant mic permission → Works immediately
- [ ] Mic in use by another app → Clear error message
- [ ] Unplug headset mid-session → Graceful fallback

### 8. Session Edge Cases
- [ ] Say "next" before session loads → Conversational error (not "Session not initialized")
- [ ] Close app mid-speech → Audio stops immediately
- [ ] Background tab → Audio stops (privacy)
- [ ] Return to tab → Can resume session

---

## VOICE RECOGNITION QUALITY TESTS

### 9. Wake Phrase Detection
- [ ] "OK Stocker" recognized
- [ ] "Hey Stocker" recognized
- [ ] "Okay Stocker" recognized
- [ ] Common mishearings work: "OK Stalker", "OK Stoker", "OK Docker"
- [ ] Wake phrase after TTS completes → Doesn't echo filter

### 10. Command Accuracy
- [ ] Numbers recognized correctly (quantities)
- [ ] Product names recognized (Snickers, Doritos, Coca-Cola)
- [ ] Route names recognized (even complex names)
- [ ] "Skip" vs "Next" distinguished correctly
- [ ] Slot numbers recognized when asked

### 11. Echo Filtering
- [ ] AI speaks item → User speech within 800ms ignored (echo prevention)
- [ ] AI speaks item → User speech after 800ms processed (not over-filtered)
- [ ] User speaks during AI speech → Ignored (correct)

---

## ADVANCED FUNCTIONALITY TESTS

### 12. 2-Item Mode (Optional Setting)
- [ ] Enable "Call 2 Items at Once" in settings
- [ ] "Next" → Returns 2 items combined
- [ ] "Go back" once → Reaches 2nd item
- [ ] "Go back" twice → Reaches 1st item
- [ ] Disable setting → Returns to 1-item mode

### 13. Volume Control
- [ ] TTS volume setting persists (localStorage)
- [ ] Volume slider changes actual volume
- [ ] Invalid volume value (NaN) → Defaults to 1.5x
- [ ] Android → Uses HTMLAudioElement (speakerphone)
- [ ] iOS → Uses Web Audio API

### 14. Multiple Users (Teams)
- [ ] Primary admin can invite driver
- [ ] Primary admin can invite operational admin (can_upload_routes)
- [ ] Driver sees only assigned routes (if can_view_all_routes=false)
- [ ] Operational admin can upload routes
- [ ] Billing updated for drivers + operational admins
- [ ] Seat count accurate on Teams page

---

## RESOURCE LEAK TESTS (Background Issues)

### 15. Memory Leaks (Requires Browser DevTools)
- [ ] Open DevTools → Performance tab → Take heap snapshot
- [ ] Use voice for 10 "next" commands
- [ ] Take another heap snapshot → AudioContext count didn't increase
- [ ] Check Task Manager → Memory stable (no growth)

### 16. Wake Lock (Battery)
- [ ] Start voice → Wake lock acquired (screen stays on)
- [ ] Stop voice → Wake lock released (screen can timeout)
- [ ] Mic permission denied → Wake lock released
- [ ] Connection fails → Wake lock released

### 17. Microphone Privacy
- [ ] Start voice → Microphone indicator ON (red dot in browser)
- [ ] Stop voice → Microphone indicator OFF
- [ ] Connection fails after mic granted → Microphone indicator OFF
- [ ] Close app → Microphone indicator OFF

---

## REGRESSION TESTS (Previously Fixed Bugs)

### 18. Teams Invite Flow
- [ ] Invite driver → Billing updated (Stripe quantity +1)
- [ ] Invite operational admin with can_upload_routes → Billing updated
- [ ] Invite admin without can_upload_routes → Billing NOT updated
- [ ] Cross-account invite → Profile exists/created correctly
- [ ] Email case-insensitive (Russ@test.com = russ@test.com)
- [ ] Teams page shows proper names (not "Unknown User")
- [ ] Duplicate invite → Clear error, no orphaned records

### 19. Database Integrity
- [ ] Delete user → account_users cleaned up (CASCADE)
- [ ] Delete account → All related data cleaned up
- [ ] Last admin cannot be deleted/demoted
- [ ] Concurrent seat limit checks don't race

---

## KNOWN ISSUES TO MONITOR

### 20. Documented Bugs (Not Yet Fixed)
- [ ] **BUG-N8N-1:** Duplicate commands with different args blocked? (Not fixed yet)
- [ ] **BUG-VOICE-1:** Wake lock leaked on error? (Not fixed yet)
- [ ] **BUG-VOICE-2:** Mic stays on after connection failure? (Not fixed yet)
- [ ] **BUG-VOICE-3:** Multiple AudioContexts accumulate? (Not fixed yet)
- [ ] **BUG-VOICE-4:** Speak queue deadlock when interrupted? (Not fixed yet)

---

## NOTES TEMPLATE

**Test Session:** [Date]
**Tester:** [Name]
**Device/Browser:** [Details]

**Failures:**
- Test #X: [Description]
- Error: [Console log or screenshot]
- Reproducible: Yes/No

**Observations:**
- [Anything unexpected]
- [Performance issues]
- [User experience notes]

---

## Quick Smoke Test (5 Minutes)

Run this before considering any fix "done":

1. ✅ App loads, session initializes
2. ✅ Say "OK Stocker, what's next" → Speaks item
3. ✅ Say "next" 3 times → Progresses through items
4. ✅ Click "Stop" → Audio stops immediately
5. ✅ Click "Resume" → Can continue
6. ✅ Say "Hey Stocker, what's next" → Wakes and responds
7. ✅ Close app → Mic indicator turns off

**If ALL pass → Proceed. If ANY fail → Debug before next fix.**

---

**END OF FUNCTIONALITY TEST CHECKLIST**
