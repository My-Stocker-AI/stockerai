#!/usr/bin/env python3
"""
XF Autonomous Discovery v2 - Refined Problem Statement
Addressing MECE violations from first attempt
"""
import asyncio
import sys
import json
from pathlib import Path

sys.path.insert(0, '/home/visionairy/Xpansion/tools')

from adapters import SystemAdapter
from core.enhanced_discovery import EnhancedDiscoveryEngine
from llm.service import ClaudeLLMService
from llm.enhanced_service import EnhancedLLMService
from llm.autonomous_callback import AutonomousDiscoveryCallback

async def main():
    # More focused problem statement to avoid boundary overlaps
    problem = """
CORE BUG: When user changes count setting from 1→2 mid-session in reverse mode,
the system marks machine complete prematurely.

REPRODUCTION STEPS:
1. User starts machine with "bottom" (reverse mode)
2. System shows items 36, 35 (first pick with count=1)
3. User changes count setting to 2 via settings panel
4. User says "next"
5. System incorrectly responds "machine complete, moving to next machine"

EXECUTION DATA (n8n execution 27467):
- session.current_item_index: 1 (CORRUPTED - should be 35 or 34)
- pick_direction: reverse
- count parameter: 2
- Workflow decided: action = "next_machine" (WRONG)

SYSTEM COMPONENTS:
1. React Frontend: useStockerSession.ts manages count setting
2. n8n Workflows:
   - start_machine: Sets initial index based on direction + count
   - get_next_item: Advances index based on direction + count
3. Database: sessions table stores current_item_index, pick_direction
4. Edge Function: get-next-item-data queries session state

KNOWN WORKING CASES:
- Forward + count=1: ✅
- Forward + count=2: ✅
- Reverse + count=1: ✅
- Reverse + count=2 (NO mid-session change): ✅

BROKEN CASE:
- Reverse + count=1→2 mid-session change: ❌

ANALYZE:
What are the distinct data flow boundaries where count setting changes
could corrupt the current_item_index in reverse mode?

Focus on: state initialization, state updates, index arithmetic,
workflow parameter passing, and session persistence.
"""

    print("=" * 80)
    print("XF AUTONOMOUS DISCOVERY v2: Reverse + Count Change Bug")
    print("=" * 80)
    print()

    # Setup
    base_llm = ClaudeLLMService()
    enhanced_llm = EnhancedLLMService(base_llm)

    callback = AutonomousDiscoveryCallback(
        llm_service=base_llm,
        problem_context=problem
    )

    engine = EnhancedDiscoveryEngine(
        enhanced_llm_service=enhanced_llm,
        min_iterations=5,
        max_iterations=15,
        strict_provenance=True,
        user_callback=callback.answer
    )

    print("Running discovery... (30-90 seconds)")
    print()

    session = await engine.discover(
        intent=problem,
        domain='system'
    )

    result = session.to_dict()

    # Save
    output_file = Path("/home/visionairy/StockerAI/xf_reverse_count2_v2_results.json")
    with open(output_file, 'w') as f:
        json.dump(result, f, indent=2)

    print("=" * 80)
    print("XF DISCOVERY COMPLETE")
    print("=" * 80)
    print()

    boundaries = result['boundaries']
    print(f"Boundaries discovered: {len(boundaries)}")
    print(f"Total iterations: {result.get('metadata', {}).get('total_iterations', 0)}")
    print(f"MECE validation: {'✅ PASSED' if result['validation'].get('passed') else '❌ FAILED'}")
    print()

    for name, data in boundaries.items():
        elements = data.get('elements', [])
        question = data.get('question', 'No question')
        print(f"### {name}")
        print(f"Question: {question}")
        print(f"Elements: {len(elements)}")
        for elem in elements[:3]:
            print(f"  - {elem.get('name', 'unnamed')}: {elem.get('description', '')[:60]}...")
        if len(elements) > 3:
            print(f"  ... and {len(elements) - 3} more")
        print()

    print(f"💾 Results: {output_file}")
    print()

if __name__ == "__main__":
    asyncio.run(main())
