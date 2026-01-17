#!/usr/bin/env python3
"""
XF Discovery: Premature Machine/Route Termination Issue

Problem:
- User started route, picked items, skipped machine
- System didn't understand response
- User said "next", system incorrectly marked machine as done
- Premature termination of machines and possibly routes

Use XF SystemAdapter to discover problem boundaries.
"""

import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
StockerAI workflow premature termination issue (2026-01-16)

User flow that failed:
1. Started a route
2. Picked a handful of items from first machine
3. Attempted to skip the machine
4. System did not understand the response
5. User said "next"
6. System incorrectly responded "machine is done"
7. Result: Premature termination (machine not actually complete)

Context:
- n8n workflow handles SMS commands (next, skip, done, etc.)
- Workflow manages state for routes and machines
- Issue appears to be in response parsing or state management
- May also affect route termination (user said "perhaps routes")

ANALYZE FOR:
- What are the system boundaries involved in this failure?
- Where is the logic that determines "machine is done"?
- What response parsing is happening?
- What state management could cause premature termination?
- What edge cases are not being handled?
"""

print("=" * 80)
print("XF DISCOVERY: Premature Termination Diagnosis")
print("=" * 80)
print()

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

print()
print("BOUNDARIES DISCOVERED:")
print("=" * 80)
print()

for boundary_name, boundary in result.boundaries.items():
    print(f"### {boundary_name}")
    print(f"Question: {boundary.question}")
    print(f"Elements: {len(boundary.elements)}")
    for elem in boundary.elements:
        print(f"  - {elem.name}: {elem.description}")
    print()

print(f"Total boundaries: {len(result.boundaries)}")
print(f"MECE validation: {result.validation.passed}")
print(f"Discovery ID: {result.metadata.get('discovery_id', 'N/A')}")
print()
print("=" * 80)
print("NEXT: Analyze workflow logic in each boundary")
print("=" * 80)
