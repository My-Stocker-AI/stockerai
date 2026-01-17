#!/usr/bin/env python3
"""
XF Discovery: Item Number Bug Analysis

User Report: "When Davy asks for item number, it always says 58 and 59"

Expected: Should show current item's sequence/position
Actual: Always shows 58 and 59 regardless of actual item

Use XF System Discovery to find where item number diverges from truth.
"""

import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
StockerAI "item number" display bug (2026-01-17)

User workflow:
1. User is picking items from a machine
2. User asks "what item number is this?"
3. System ALWAYS responds "58 and 59" regardless of actual item
4. Expected: Should show the current item's sequence or position

Context:
- Items have `sequence` field (1-39 in database)
- Session has `current_item_index` (tracks position)
- n8n workflow calculates item data from these values
- Frontend displays the response
- Pick direction can be "forward" or "reverse"

ANALYZE FOR:
- What does "item number" mean in each component? (sequence, index, slot, display text)
- Where is 58/59 coming from? (hardcoded, wrong field, off-by-one error)
- What transformations happen from database → user display?
- Where can item number diverge from actual current item?
- What are ALL the places item number is calculated or displayed?
- What edge cases exist? (reverse mode, skipped items, count=2)
"""

print("=" * 80)
print("XF DISCOVERY: Item Number Bug Analysis")
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
print(f"Iterations: {result.metadata.get('total_iterations', 'N/A')}")
print(f"Discovery ID: {result.metadata.get('discovery_id', 'N/A')}")
print()
print("=" * 80)
print("NEXT: Analyze each boundary to find where 58/59 is introduced")
print("=" * 80)
