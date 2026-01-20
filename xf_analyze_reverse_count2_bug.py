#!/usr/bin/env python3
"""
XF Discovery: Reverse Mode + Count=2 Machine Premature Completion Bug

KNOWN STATE:
- Working: Forward mode, all counts
- Working: Reverse mode, count=1
- BROKEN: Reverse mode, count=2 (machine completes after first pick)

RECENT CHANGES:
- Added Reset Route button (session clearing, IndexedDB, Supabase sessions)
- Added Progress Bar (new database fields: currentMachineTotalItems)
- Changed Reset Route to DELETE sessions instead of UPDATE status

USER REPORT:
"I started at the bottom, picked 2 items, then it said the machine was complete and started on the next"

SYSTEM ARCHITECTURE:
1. Frontend: React (StockerApp.tsx, useStockerSession.ts, useSessionPersistence.ts)
2. n8n Workflows:
   - get_next_item (iykbFj7f9222PF7r) - Determines next item/machine
   - start_machine (JbKdJuKgGbyvzlF0) - Initializes machine picking
3. Database: Supabase sessions table (current_item_index, pick_direction)
4. Edge Function: get-next-item-data (returns session, items, machines)

ANALYZE FOR:
- Where does session.current_item_index get set/updated?
- How does count=2 affect index advancement in reverse mode?
- What are the boundaries between components?
- Where can index mismatch occur?
- What's the complete data flow from "next" command to machine transition?
- How do recent changes (reset button, progress bar) affect this flow?
"""
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
SYMPTOM: Reverse mode + count=2 causes machine to complete prematurely after first pick

CONTEXT:
- User starts machine at bottom (reverse mode)
- User has count=2 setting enabled
- start_machine returns items 36,35 with index set to 35
- User says "next"
- get_next_item should show items 34,33 with index 33
- INSTEAD: get_next_item says "machine complete" and moves to next machine
- Next machine gets index=36 (from previous machine's item count)

DATA FLOW BOUNDARIES:
1. Frontend → start_machine workflow (direction, count, user_id)
2. start_machine → Database UPDATE (sets current_item_index)
3. Frontend → get_next_item workflow (count, user_id)
4. Edge Function → get_next_item (session data including current_item_index)
5. get_next_item logic → Determines next state
6. get_next_item → Database UPDATE (new current_item_index)
7. get_next_item → Frontend response

RECENT CHANGES (potential contamination):
- Reset Route: Added clearServer() that DELETES sessions
- Progress Bar: Added currentMachineTotalItems field to session state
- Session persistence: Auto-save every few seconds

ANALYZE:
1. What are ALL the places current_item_index gets read/written?
2. How does count=2 change index arithmetic in reverse mode?
3. Where can index value become inconsistent between components?
4. What happens when session is deleted then recreated?
5. Are there race conditions between auto-save and manual updates?
6. Does the Edge Function cache affect this?
7. How does pick_direction affect "next item" vs "next machine" logic?
8. What's the difference between start_machine index setting vs get_next_item index setting?
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

# Print results
print("=" * 80)
print("XF DISCOVERY: Reverse Mode + Count=2 Bug")
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
print()
print("=" * 80)
print("NEXT STEPS:")
print("1. Review each boundary for potential index corruption")
print("2. Trace exact sequence of index updates for reverse+count=2")
print("3. Check if Reset Route changes affected session state management")
print("4. Verify edge function query matches workflow expectations")
print("=" * 80)
