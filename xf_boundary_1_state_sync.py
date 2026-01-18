#!/usr/bin/env python3
"""
XF Sequential Bug Discovery - Boundary 1: STATE SYNCHRONIZATION
Deep dive into where state can diverge between systems
"""

import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
StockerAI State Synchronization - Deep Boundary Analysis

BOUNDARY: State Synchronization
QUESTION: Where can state diverge between systems?

System Architecture:
- Frontend (React): Local state in useStockerSession hook
- Supabase Database: stocker_sessions table (source of truth)
- n8n Workflows: Read session state, execute logic, update DB
- Edge Functions: Query DB, return data to workflows
- AI Context: Conversation history with session state
- Browser Cache: Service worker, localStorage

State Flow:
1. User says "next"
2. Frontend sends to OpenAI
3. OpenAI calls n8n webhook (get_next_item)
4. Workflow queries Supabase session table
5. Workflow calculates next item
6. Workflow updates Supabase session
7. Workflow returns response to OpenAI
8. OpenAI returns to frontend
9. Frontend updates React state
10. Frontend saves to localStorage

DISCOVER:
- Where can this flow break?
- What happens if step N fails but step N+1 succeeds?
- Where can state become inconsistent?
- What are ALL the state synchronization failure modes?
- Where is data written but not read?
- Where is data read but stale?
- Where can concurrent operations conflict?
- Where are optimistic updates that don't confirm?

ANALYZE FOR:
What are the SPECIFIC failure scenarios where state diverges?
For each scenario:
- What triggers it?
- What systems are involved?
- What's the observable symptom?
- Where is the code/workflow?
- How likely is this?
- What's the impact?
"""

print("=" * 80)
print("XF BOUNDARY 1: STATE SYNCHRONIZATION")
print("=" * 80)
print()

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

print()
print("STATE SYNC FAILURE MODES DISCOVERED:")
print("=" * 80)
print()

for boundary_name, boundary in result.boundaries.items():
    print(f"### {boundary_name}")
    print(f"Question: {boundary.question}")
    print(f"Elements: {len(boundary.elements)}")
    for elem in boundary.elements:
        print(f"  - {elem.name}: {elem.description}")
    print()

print(f"Total failure modes: {len(result.boundaries)}")
print(f"MECE validation: {result.validation.passed}")
print(f"Iterations: {result.metadata.get('total_iterations', 'N/A')}")
print(f"Discovery ID: {result.metadata.get('discovery_id', 'N/A')}")
print()
print("=" * 80)
print("NEXT: Map each failure mode to code locations and assess risk")
print("=" * 80)
