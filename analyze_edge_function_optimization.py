#!/usr/bin/env python3
"""
XF Analysis: Edge Function Optimization - Boundary Verification

TASK:
Verify if Edge Function optimization (current + next machine only) breaks
the workflow's "return to skipped machines" logic.

METHOD:
Use Xpansion SystemAdapter for code-enforced BBRD analysis.
"""

import sys
from pathlib import Path

# Add Xpansion tools to path
sys.path.insert(0, str(Path('/home/visionairy/Xpansion/tools')))

import asyncio
from adapters import SystemAdapter
from adapters.base import AdapterInput
from llm.service import MockLLMService
from llm.enhanced_service import EnhancedLLMService
from core.enhanced_discovery import EnhancedDiscoveryEngine
from llm.autonomous_callback import AutonomousDiscoveryCallback


async def analyze():
    """Run systematic BBRD analysis."""
    
    problem = """Edge Function Optimization Impact Analysis

SYSTEM:
Voice-guided warehouse picking application for vending machine routes.

PROPOSED CHANGE:
Edge Function currently returns ALL machines in route (10-20 machines).
Optimization: Return only current machine + next machine (2 machines).
Claimed benefit: 80-90% payload reduction.

DATA FLOW:
1. Edge Function queries database RPC: get_next_item_data()
2. Edge Function filters results, returns: { session: [], items: [], machines: [] }
3. n8n workflow "Determine Next State" node processes machines array
4. Workflow logic includes: "return to skipped machines" feature

WORKFLOW CODE (Determine Next State node, lines 123-131):
```javascript
// Check for ANY skipped machine
var firstSkippedMachine = null;
for (var i = 0; i < machines.length; i++) {
  if (machines[i].status === 'skipped') {
    firstSkippedMachine = machines[i];
    break;
  }
}

if (firstSkippedMachine) {
  // Return to skipped machine
  return [{
    json: {
      action: 'next_machine',
      next_machine_id: firstSkippedMachine.id,
      returning_to_skipped: true
    }
  }];
}
```

EDGE FUNCTION OPTIMIZATION (proposed filter):
```typescript
// CURRENT: Returns ALL machines
machinesMap.set(row.machine_id, { ... });

// PROPOSED: Returns only current + next
if (row.machine_id === currentMachineId || row.machine_sequence === currentMachineSeq + 1) {
  machinesMap.set(row.machine_id, { ... });
}
```

CRITICAL QUESTION:
Does the proposed optimization break the "return to skipped machines" logic?

SCENARIO TO TRACE:
1. Route has 5 machines (sequences 1-5)
2. User skips machine 1 (sequence=1, status='skipped')
3. User completes machines 2, 3, 4
4. User completes machine 5
5. Workflow looks for next machine → none
6. Workflow looks for skipped machines (lines 123-131)
7. Will it find machine 1 (skipped)?

BOUNDARY TO DISCOVER:
What machines MUST be in the machines array for the workflow to work correctly?
"""

    print("=" * 80)
    print("XPANSION SYSTEMATIC ANALYSIS: Edge Function Optimization")
    print("=" * 80)
    print()
    
    # Use SystemAdapter for systematic boundary discovery
    mock_llm = MockLLMService()
    enhanced_llm = EnhancedLLMService(mock_llm)
    
    adapter = SystemAdapter()
    adapter_input = AdapterInput(
        raw_input=problem,
        domain="system"
    )
    
    # Run autonomous discovery
    callback = AutonomousDiscoveryCallback(
        llm_service=mock_llm,
        problem_context=problem
    )
    
    engine = EnhancedDiscoveryEngine(
        enhanced_llm_service=enhanced_llm,
        min_iterations=3,
        max_iterations=10,
        user_callback=callback.answer
    )
    
    print("🔍 Running code-enforced BBRD discovery...")
    print()
    
    result = await adapter.execute(adapter_input, engine)
    
    print()
    print("=" * 80)
    print("DISCOVERY RESULTS")
    print("=" * 80)
    print()
    print(result.formatted_output)
    print()
    print("=" * 80)
    print("VALIDATION")
    print("=" * 80)
    print()
    
    # Extract terminal root cause from result
    if "machines array" in result.formatted_output.lower():
        print("✅ BBRD identified machines array as boundary")
    
    if "skipped" in result.formatted_output.lower():
        print("✅ BBRD identified skipped machine logic")
    
    if "all machines" in result.formatted_output.lower() or "entire route" in result.formatted_output.lower():
        print("❌ TERMINAL FINDING: Optimization breaks skipped machine logic")
        print("   Requires ALL machines in route, not just current + next")
    else:
        print("✅ Optimization may be safe (no ALL machines requirement detected)")
    
    return result


if __name__ == "__main__":
    asyncio.run(analyze())
