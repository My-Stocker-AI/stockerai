#!/usr/bin/env python3
"""
XF Analysis: Reverse Mode + Count=2 Bug
Run systematic BBRD discovery on the workflow issue
"""

import sys
import os

# Add Xpansion to path
sys.path.insert(0, '/home/visionairy/Xpansion')
sys.path.insert(0, '/home/visionairy/Xpansion/tools')

from tools.ralph_mece_discovery import MECEVerifier, ADAPTER_CONFIGS
from tools.llm.service import ClaudeLLMService

# Initialize
llm = ClaudeLLMService()

problem = """
STOCKER AI BUG: Route completes prematurely when toggling to 2-item mode

CONTEXT:
- Voice-guided warehouse stocking system
- Items picked in REVERSE mode (sequence 36 → 35 → ... → 2 → 1)
- First machine of 6 machines
- 36 total items on this machine

USER ACTIONS:
1. Started picking in 1-item mode
2. Got FIRST item (sequence 36 in reverse mode)
3. Toggled to 2-item mode in Settings
4. Said "next"
5. System responded "route completed" instead of giving next items

WORKFLOW: get_next_item (ID: iykbFj7f9222PF7r)

KEY STATE TRANSITIONS:
- currentItemIndex starts at 36 (reverse mode)
- After first item: currentItemIndex = 35 (items 35,34,33... remaining)
- Toggle changes localStorage: 'stocker-call-two-items' = 'true'
- Next webhook call sends count=2 parameter

WORKFLOW LOGIC (Determine Next State node):
```javascript
var currentItemIndex = session.current_item_index || 0;
var pickDirection = session.pick_direction || 'forward';
var count = input.count || 1;

// Find nextItem
if (pickDirection === 'reverse') {
  // Look for item at sequence = currentItemIndex - 1
}

if (nextItem) {
  var newIndex = pickDirection === 'reverse' ? currentItemIndex - 1 : currentItemIndex + 1;

  if (count === 2) {
    var item2Index = pickDirection === 'reverse' ? newIndex - 1 : newIndex + 1;
    // Look for item2
    if (item2) {
      newIndex = item2Index;
    }
  }

  var remaining = pickDirection === 'reverse' ? newIndex - 1 : items.length - newIndex;
}

// If nextItem === null -> falls through to next_machine -> route_complete
```

DISCOVER ALL BOUNDARIES:

DATA: What data values are involved?
- currentItemIndex progression
- pickDirection state
- count parameter
- items array and sequences
- remaining calculation

NODES: What components process this?
- Frontend toggle
- Webhook input
- Determine Next State logic
- Session update
- Frontend state update

FLOW: How does data transform?
- Item index calculations in reverse mode
- count=2 affects which calculation?
- When does nextItem become null?
- What triggers route_complete?

ERRORS: Where does interpretation fail?
- Off-by-one errors?
- Reverse logic inversion?
- count=2 affecting wrong index?
- Premature null detection?

FIND THE BUG.
"""

print("="*80)
print("RUNNING XF SYSTEMATIC DISCOVERY")
print("="*80)
print()
print("Problem:", problem[:200], "...")
print()
print("Discovering boundaries...")
print()

# Run discovery
try:
    result = llm.analyze(problem, system_context="You are analyzing a software bug using BBRD methodology.")
    print(result)
except Exception as e:
    print(f"Error: {e}")
    print("\nFalling back to direct analysis request...")

    # Direct analysis
    response = llm.chat([
        {"role": "user", "content": problem}
    ])
    print(response)
