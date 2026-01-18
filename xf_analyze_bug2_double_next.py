#!/usr/bin/env python3
"""
XF Discovery: Bug 2 - Double "Next" Command Completes Route Prematurely
User Report: User says "next", thinks it didn't hear, says "next" again, route ends prematurely
"""
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.adapters import SystemAdapter

problem = """
Bug Report: User says "next" command, doesn't see/hear feedback, says "next" again. Route completes prematurely.

SYSTEM ARCHITECTURE:
- Voice recognition → OpenAI GPT-4o-mini → Tool execution
- n8n workflow: get_next_item handles "next" command
- Workflow updates: current_item_index, checks for route completion
- Frontend receives: new item OR "route complete" message

USER BEHAVIOR:
1. User says "next"
2. System processing (user doesn't know it heard)
3. User says "next" again (thinking it missed the first one)
4. System says "route complete" (unexpected)

TIMING:
- Voice → AI → Workflow → DB → Response = ~2-3 seconds
- User impatience threshold = ~1-2 seconds
- Two "next" commands sent ~1-2 seconds apart

ANALYZE FOR:
- How are concurrent commands handled?
- What determines "route complete"?
- Where's the race condition between two "next" calls?
- What state gets updated and when?
- Is there debouncing or request deduplication?
"""

adapter = SystemAdapter()
result = adapter.discover(problem_text=problem)

# Print results
print("=" * 80)
print("XF DISCOVERY: Double Next Command Bug")
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
