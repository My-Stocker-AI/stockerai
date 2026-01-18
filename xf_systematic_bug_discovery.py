#!/usr/bin/env python3
"""
XF Systematic Bug Discovery - StockerAI
Phase 1: Discover all potential bug boundaries

Goal: Identify WHERE bugs could exist, not just known bugs
Then assess risk before implementing fixes
"""

import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
StockerAI Platform - Systematic Bug Discovery (2026-01-17)

System Overview:
- Voice-controlled warehouse stocker assistant
- Pick items from vending machines across multiple routes
- Supports forward/reverse picking, 2-item mode, skip machines
- Frontend (React/Vite) + n8n workflows + Supabase + OpenAI

Known Issues (already identified):
1. Reverse mode premature termination (FIXED, awaiting test)
2. Item number vs slot confusion (FIXED, awaiting test)
3. Skipped machine return logic (FIXED, awaiting test)

DISCOVER:
- What are ALL the boundaries where bugs could exist?
- NOT just "what bugs do we know about" - discover potential failure points
- State management boundaries
- Data flow boundaries
- User interaction boundaries
- Edge case boundaries
- Integration boundaries

Think about:
- Where does data transform between systems?
- Where does state synchronize?
- Where do timing issues occur?
- Where do edge cases live?
- Where can data diverge from truth?
- Where are assumptions made?
- Where can user intent be misunderstood?
- Where can race conditions happen?

ANALYZE FOR:
What are the MECE boundaries for potential bugs in this system?
"""

print("=" * 80)
print("XF PHASE 1: BUG BOUNDARY DISCOVERY")
print("=" * 80)
print()

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

print()
print("BUG BOUNDARIES DISCOVERED:")
print("=" * 80)
print()

# Collect all boundaries for Phase 2
boundaries_found = []

for boundary_name, boundary in result.boundaries.items():
    print(f"### {boundary_name}")
    print(f"Question: {boundary.question}")
    print(f"Elements: {len(boundary.elements)}")
    for elem in boundary.elements:
        print(f"  - {elem.name}: {elem.description}")
    print()
    boundaries_found.append(boundary_name)

print(f"Total boundaries: {len(result.boundaries)}")
print(f"MECE validation: {result.validation.passed}")
print(f"Iterations: {result.metadata.get('total_iterations', 'N/A')}")
print(f"Discovery ID: {result.metadata.get('discovery_id', 'N/A')}")
print()
print("=" * 80)
print("PHASE 1 COMPLETE")
print("=" * 80)
print()
print("Next Steps:")
print("1. Review boundaries above")
print("2. For each boundary, run deep discovery to find specific bugs")
print("3. Build risk assessment matrix")
print()
print(f"Boundaries to analyze in Phase 2: {', '.join(boundaries_found)}")
print()
