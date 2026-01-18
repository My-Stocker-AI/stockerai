#!/usr/bin/env python3
"""
XF Discovery: Bug 3 - Stop Button Breaks Voice Permanently
User Report: "Stop hasn't worked. It doesn't start up again after stop at all, not with 'Hey Stocker' not with Continue button"
"""
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
Bug Report: User clicks Stop button. Voice stops. User cannot restart voice with "Hey Stocker" OR Continue button.

SYSTEM ARCHITECTURE:
- useVoice hook manages voice state
- Deepgram WebSocket for STT
- MediaRecorder for audio capture
- Voice states: idle, listening, speaking, thinking, paused, muted, error

STOP FLOW (what happens when user clicks Stop):
1. User clicks Stop button
2. handleStopClick() called
3. Shows confirmation dialog
4. confirmStop() → voice.stopListening()
5. stopListening() sets shouldReconnectRef.current = false
6. Closes WebSocket, stops MediaRecorder
7. Status → 'idle'

RESUME FLOW (what SHOULD happen):
1. User clicks Continue button OR says "Hey Stocker continue"
2. handleStopClick() detects status === 'idle'
3. Calls voice.startListening()
4. startListening() should:
   - Reset stoppedRef.current = false
   - Get audio stream
   - Set shouldReconnectRef.current = true
   - Connect Deepgram
   - Set status to 'listening'

USER EXPERIENCE:
- Stop works (voice stops)
- Continue button does NOTHING
- "Hey Stocker" wake phrase does NOTHING
- Voice is permanently dead until page refresh

ANALYZE FOR:
- What state cleanup does stopListening() do?
- What state initialization does startListening() need?
- What dependencies might be missing after stop?
- Where could startListening() fail silently?
- What flags/refs might be in wrong state after stop?
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

# Print results
print("=" * 80)
print("XF DISCOVERY: Stop Breaks Voice Bug")
print("=" * 80)
print()
for boundary_name, boundary in result.boundaries.items():
    print(f"### {boundary_name}")
    print(f"Question: {boundary.question}")
    print(f"Elements: {len(boundary.elements)}")
    for elem in boundary.elements:
        print(f"  - {elem.name}: {elem.description}")
    print()

print(f"Iterations: {result.metadata.total_iterations}")
print(f"MECE Validation: {result.validation.passed}")
print(f"Discovery ID: {result.metadata.discovery_id}")
