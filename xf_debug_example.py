#!/usr/bin/env python3
"""
XF Debug Example - How to use Xpansion Framework from StockerAI

USAGE:
    xf-run xf_debug_example.py

OR:
    xf-run -c "from adapters import SystemAdapter; result = SystemAdapter().discover(problem_text='your problem'); print(result)"

This demonstrates autonomous XF discovery - NO human input needed.
"""

import sys
sys.path.insert(0, '/home/visionairy/Xpansion/tools')

from adapters import SystemAdapter

# Define your problem
problem = """
StockerAI workflow error analysis:

SYMPTOMS:
- Error message: "undefined complete. Next is undefined at undefined"
- Triggered when: user changes item_pick to 2
- Behavior: Workflow returns undefined values instead of item data
- Impact: User sees broken AI responses

CONTEXT:
- System: StockerAI warehouse voice assistant
- Component: Route picking workflow
- User action: Voice command or item selection
- Expected: AI says "[item] complete. Next is [next_item] at [machine]"
- Actual: "undefined complete. Next is undefined at undefined"

QUESTIONS TO ANSWER:
1. What data flows through this workflow? (DATA boundary)
2. What components/nodes are involved? (NODES boundary)
3. How does data flow between components? (FLOW boundary)
4. What failure modes exist? (ERRORS boundary)
"""

print("\n" + "="*70)
print("XF AUTONOMOUS DISCOVERY - StockerAI Workflow Analysis")
print("="*70)
print("\nRunning BBRD discovery...")
print("- Discovers: DATA, NODES, FLOW, ERRORS boundaries")
print("- Validates: MECE (mutually exclusive, collectively exhaustive)")
print("- Enforces: 3-15 iterations minimum (code-enforced)")
print("- Tracks: Full provenance (every element cites source)")
print("="*70 + "\n")

# Run autonomous discovery
adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

print("\n" + "="*70)
print("DISCOVERY COMPLETE")
print("="*70)
print(result)
print("\n" + "="*70)
print("HOW TO INTERPRET RESULTS:")
print("="*70)
print("""
1. DATA boundary: All data elements that flow through system
2. NODES boundary: All components/services involved
3. FLOW boundary: How data moves between components
4. ERRORS boundary: All failure modes and error conditions

Each element includes:
- Description: What it is
- Provenance: Question that discovered it + answer source
- MECE validation: Overlap scores, coverage analysis

Use this to:
- Find root cause (which boundary has the issue?)
- Identify missing error handling
- Map complete system architecture
- Verify no edge cases missed
""")
