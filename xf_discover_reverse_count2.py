#!/usr/bin/env python3
"""
XF Autonomous Discovery: Reverse Mode + Count=2 Bug
Using SystemAdapter with autonomous callback (NO human input needed)
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
    problem = """
SYMPTOM: Reverse picking mode + count=2 setting causes machine to complete prematurely after first pick

USER REPORT:
"I started at the bottom, picked 2 items, then it said the machine was complete and started on the next"

SYSTEM STATE:
- User starts machine with "bottom" (reverse mode)
- Settings panel shows count=2 (show 2 items at once)
- First pick: Shows items 36, 35 (correct)
- User says "next"
- EXPECTED: Show items 34, 33
- ACTUAL: Says "machine complete, moving to next machine"

EXECUTION DATA (n8n execution 27467):
- session.current_item_index: 1 (WRONG - should be 35 or 34)
- pick_direction: reverse
- count parameter: 2
- Workflow decided: action = "next_machine" (premature)

KNOWN WORKING:
- Forward mode + count=1: ✅ Works
- Forward mode + count=2: ✅ Works
- Reverse mode + count=1: ✅ Works
- Reverse mode + count=2: ❌ BROKEN

USER BEHAVIOR:
- User started route
- Picked one item (count=1 setting initially)
- THEN switched count setting from 1 to 2 via settings panel (mid-session)
- Said "next"
- System broke

SYSTEM ARCHITECTURE:
1. Frontend: React (useStockerSession.ts handles count setting)
2. n8n Workflows:
   - start_machine (JbKdJuKgGbyvzlF0): Sets initial index based on direction + count
   - get_next_item (iykbFj7f9222PF7r): Advances index based on direction + count
3. Database: sessions table (current_item_index, pick_direction)
4. Edge Function: get-next-item-data (queries session state)

RECENT CHANGES (Session 44 - 2026-01-19):
- Added Reset Route button with session deletion
- Added Progress Bar with new database fields
- Changed session lifecycle (DELETE instead of UPDATE on reset)

ANALYZE FOR:
- Where does count=2 logic break in reverse mode?
- How does current_item_index get corrupted to value "1"?
- What's the data flow when user changes count mid-session?
- Are there index arithmetic errors in reverse + count=2?
- Does machine transition logic use wrong assumptions?
- How do recent changes impact session state management?
- Why does changing count mid-session cause failure?
"""

    print("=" * 80)
    print("XF AUTONOMOUS DISCOVERY: Reverse + Count=2 Bug")
    print("=" * 80)
    print()

    # Setup LLM and discovery engine
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

    print("Running discovery... (this will take 30-90 seconds)")
    print()

    session = await engine.discover(
        intent=problem,
        domain='system'
    )

    result = session.to_dict()

    # Save results
    output_file = Path("/home/visionairy/StockerAI/xf_reverse_count2_results.json")
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
        for elem in elements[:5]:  # Show first 5
            print(f"  - {elem.get('name', 'unnamed')}: {elem.get('description', '')[:80]}")
        if len(elements) > 5:
            print(f"  ... and {len(elements) - 5} more elements")
        print()

    print(f"💾 Full results saved to: {output_file}")
    print()

if __name__ == "__main__":
    asyncio.run(main())
