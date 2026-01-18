#!/usr/bin/env python3
"""
XF Discovery: Bug 1 - Progress Not Saving When App Closes
User Report: "The system does not seem to be saving the progress when the app closes, prematurely or otherwise"
"""
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
Bug Report: User completes items in StockerAI app, app closes (crash or normal), progress is lost when reopened.

SYSTEM ARCHITECTURE:
- React frontend (StockerApp.tsx)
- useSessionPersistence hook (dual storage: IndexedDB + Supabase)
- saveSessionState() function called on route state changes
- Session data includes: routeState, completedItems, conversationHistory

USER BEHAVIOR:
- User picks items (updates completedItems array)
- App may close unexpectedly (crash, browser close, tab close)
- User reopens app
- Progress is gone

ANALYZE FOR:
- Where does session state get saved?
- What triggers the save?
- Where can saves fail silently?
- What happens when app closes before save completes?
- What's the recovery mechanism on reopen?
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

# Print results
print("=" * 80)
print("XF DISCOVERY: Progress Not Saving Bug")
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
