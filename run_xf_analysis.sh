#!/bin/bash
cd /home/visionairy/Xpansion

.venv/bin/python tools/ralph_xf_hybrid.py << 'EOF'
CONTEXT: StockerAI voice-guided warehouse stocking system

PRIOR STATE (Before Reset Route fix - commit fe420c0):
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

SYMPTOM 2: Design flaw
- Can only change 1-item vs 2-item mode once Voice app is active
- Should have toggle on main screen
- Should have master setting in dashboard

WHAT I NEED TO DISCOVER:

Discover ALL boundaries that could cause these symptoms:
- What changed in data flow?
- What changed in state management?
- Could isClearing flag affect normal operations?
- Could blocked saves cause state desync?
- How does 2-item mode interact with session state?
- What triggers route completion check?
- Could there be race conditions?
- What else could the Reset fix have broken?
EOF
