#!/usr/bin/env python3
"""
XF Systematic Analysis: Reset Route Fix System Impact
Analyzes what broke after Reset Route button implementation
"""

import sys
sys.path.insert(0, '/home/visionairy/Xpansion/tools')
from adapters import SystemAdapter

problem = """
CONTEXT: StockerAI voice-guided warehouse stocking system

PRIOR STATE (Before Reset Route fix):
- System fully functional
- Voice commands working correctly
- Item progression working (1 item and 2 item calling)
- Session persistence working
- Route completion logic correct

CHANGE MADE: Reset Route Button Fix (commit fe420c0)

Changes implemented:
1. Added isClearing state flag in StockerApp.tsx
2. Modified saveSessionState() to block saves when isClearing=true
3. Enhanced clearServer() with verification and error handling
4. Added 800ms wait time (500ms before, 300ms after clear)
5. Added extensive logging for reset process

The isClearing flag prevents auto-save from writing new session between clear and reload.

CURRENT SYMPTOMS (After Reset fix):

SYMPTOM 1: Route completes prematurely when changing item count
- User gets 1 item call from system
- User changes toggle from 1-item to 2-item mode
- System says "route completed" instead of giving next item
- This did NOT happen before the Reset fix

SYMPTOM 2: Design flaw identified
- Can only change 1-item vs 2-item mode once Voice app is active
- Should have toggle on main screen
- Should have master setting in dashboard
- But system must be functional first

TECHNICAL DETAILS:

Session State Structure:
- routeState (routeName, routeDate, currentMachineId, currentItemIndex, pickDirection)
- sessionId (UUID)
- messages (chat history)
- Saved to IndexedDB + Supabase on every route change

Two-Item Feature:
- localStorage flag: 'stocker-call-two-items'
- Toggle in SettingsSheet.tsx
- When enabled: AI calls 2 items together instead of 1

Auto-Save Trigger:
- useEffect watching routeState changes
- Calls saveSessionState() on any change
- Now BLOCKED if isClearing=true

ANALYZE FOR SYSTEM IMPACT:

1. DATA FLOW: What data enters/exits? What changed in the flow?
   - How does isClearing flag affect normal operation?
   - Could blocking saves cause state desync?
   - How does 2-item mode interact with session state?

2. CALLERS (Upstream): What triggers saveSessionState?
   - Route changes
   - Item index changes
   - Machine changes
   - Could toggle change trigger unwanted side effects?

3. CALLEES (Downstream): What happens when save is blocked?
   - Session state not persisted
   - What if app crashes during blocked period?
   - Could this cause route completion logic to fail?

4. SIDE EFFECTS: What else changed?
   - 800ms delay in reset process
   - Enhanced error handling
   - More logging
   - Could any of these affect normal operation?

5. STATE DEPENDENCIES: Race conditions?
   - isClearing flag state
   - Toggle state change timing
   - Auto-save timing
   - Route completion check timing

6. ERROR PROPAGATION: When things fail, what cascades?
   - If save blocked incorrectly, what breaks?
   - If toggle changes state, what updates?
   - How does route completion check work?

SPECIFIC QUESTIONS TO ANSWER:

Q1: Could isClearing flag be set to true outside of reset process?
Q2: Could toggle change trigger save while flag is set?
Q3: How does route completion check current item index?
Q4: Could blocked save cause item index to be lost/incorrect?
Q5: What is the exact mechanism that checks "route completed"?
Q6: Could 2-item mode cause double increment of item index?
Q7: Are there any React state timing issues introduced?
Q8: Could the 800ms wait affect concurrent operations?

GOAL: Identify ALL issues caused by Reset fix and any other impediments.
"""

print("=" * 80)
print("XF SYSTEM IMPACT ANALYSIS - RESET ROUTE FIX")
print("=" * 80)
print()

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

print("\n" + "=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
print(result)
