#!/usr/bin/env python3
"""
XF Debug Example - FIXED VERSION

This demonstrates the CORRECT way to use Xpansion Framework from StockerAI.

USAGE:
    xf-run xf_debug_example_FIXED.py

Changes from broken version:
    - Uses simple_xf wrapper (hides async complexity)
    - Actually works when executed
    - Provides clearer output

OLD (BROKEN):
    adapter = SystemAdapter()
    result = adapter.discover(problem_text=problem)  # NO SUCH METHOD!

NEW (WORKS):
    from simple_xf import analyze_system
    result = analyze_system(problem)
"""

import sys
sys.path.insert(0, '/home/visionairy/Xpansion/tools')

from simple_xf import analyze_system
import json

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

# Run autonomous discovery (SIMPLIFIED API)
print("⏳ Calling XF... (this takes 30-90 seconds)")
result = analyze_system(problem, verbose=True)

print("\n" + "="*70)
print("DISCOVERY COMPLETE")
print("="*70)

# Show boundaries discovered
boundaries = result.get('boundaries', {})
print(f"\n✅ Boundaries discovered: {len(boundaries)}")
for name, data in boundaries.items():
    elements = data.get('elements', [])
    print(f"  - {name}: {len(elements)} elements")

# Show MECE validation
validation = result.get('validation', {})
print(f"\n✅ MECE Validation:")
print(f"  - Passed: {validation.get('passed', False)}")
print(f"  - Score: {validation.get('mece_score', 0):.2f}")

# Show metadata
metadata = result.get('metadata', {})
print(f"\n✅ Discovery Metadata:")
print(f"  - Iterations: {metadata.get('total_iterations', 0)}")
print(f"  - Model: {metadata.get('model_used', 'unknown')}")
print(f"  - Provenance complete: {metadata.get('provenance_complete', False)}")

# Save full results
output_file = 'xf_analysis_result.json'
with open(output_file, 'w') as f:
    json.dump(result, f, indent=2)

print(f"\n💾 Full results saved to: {output_file}")

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

Open {output_file} to see complete provenance trail.
""".format(output_file=output_file))
