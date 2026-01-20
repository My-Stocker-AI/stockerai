#!/usr/bin/env python3
"""
Interactive Hierarchical Discovery v2 - THE CORRECT MODEL

EXECUTION PATTERN:
- LLM discovers boundaries/branches (uses knowledge base + past patterns)
- Human validates ("MECE? Complete? Missing anything?")
- Code enforces hierarchical structure, MECE loop, recursion to terminal
- Database logs gaps (what LLM missed) and successes (what was complete)
- System learns - the more it's used, the better it gets

This is THE model for Xpansion Framework discovery.
"""

import sys
import json
from datetime import datetime

sys.path.insert(0, '/home/visionairy/Xpansion')
from tools.adapters import IntentAdapter
from tools.evidence import get_evidence_collector

# ============================================================================
# DISCOVERY STATE
# ============================================================================

discovery_tree = {}
learning_log = {
    "gaps": [],      # What LLM missed that human added
    "successes": [], # What LLM got right (human confirmed MECE)
    "terminal_confirmations": []  # What human confirmed as terminal
}

def present_and_validate(items, context, llm_source):
    """
    Present LLM discoveries to human for validation.

    Args:
        items: List of boundaries/branches discovered by LLM
        context: What level we're at (for logging)
        llm_source: Where these came from (for provenance)

    Returns:
        Validated list of items (may include human additions)
    """
    print()
    print("=" * 80)
    print(f"LLM DISCOVERED {len(items)} items for: {context}")
    print("-" * 80)
    for i, item in enumerate(items, 1):
        print(f"  {i}. {item}")
    print("=" * 80)

    while True:
        validation = input("\nAre these MECE (complete and non-overlapping)? (yes/add/replace): ").strip().lower()

        if validation in ['yes', 'y']:
            # Log success - LLM got it right
            learning_log["successes"].append({
                "context": context,
                "llm_proposed": items.copy(),
                "human_confirmed": True,
                "timestamp": datetime.now().isoformat()
            })
            print("✅ MECE validated")
            return items

        elif validation in ['add', 'a']:
            # Human needs to add missing items
            print("\nWhat's missing? (comma-separated)")
            additions = input("ADD: ").strip()
            if additions:
                new_items = [item.strip() for item in additions.split(',') if item.strip()]

                # Log gap - LLM missed these
                learning_log["gaps"].append({
                    "context": context,
                    "llm_proposed": items.copy(),
                    "human_added": new_items,
                    "gap_type": "missing_items",
                    "timestamp": datetime.now().isoformat()
                })

                items.extend(new_items)
                print(f"\nUpdated list ({len(items)} items):")
                for i, item in enumerate(items, 1):
                    print(f"  {i}. {item}")

        elif validation in ['replace', 'r']:
            # Human wants to completely replace
            print("\nProvide complete list (comma-separated)")
            replacement = input("REPLACE WITH: ").strip()
            if replacement:
                new_items = [item.strip() for item in replacement.split(',') if item.strip()]

                # Log gap - LLM got it wrong
                learning_log["gaps"].append({
                    "context": context,
                    "llm_proposed": items.copy(),
                    "human_replaced_with": new_items,
                    "gap_type": "wrong_items",
                    "timestamp": datetime.now().isoformat()
                })

                items = new_items
                print(f"\nReplaced list ({len(items)} items):")
                for i, item in enumerate(items, 1):
                    print(f"  {i}. {item}")

def ask_if_terminal(item, parent_context, depth):
    """
    Ask human if item is terminal.

    Args:
        item: Item to check
        parent_context: Parent path
        depth: Current depth

    Returns:
        True if terminal, False if has sub-branches
    """
    if depth >= 4:
        print(f"  [Depth {depth}] Auto-terminal: {item}")
        return True

    is_terminal = input(f"  Is '{item}' TERMINAL (implementable/atomic)? (yes/no): ").strip().lower()
    terminal = is_terminal in ['yes', 'y']

    # Log terminal confirmation
    learning_log["terminal_confirmations"].append({
        "item": item,
        "parent_context": parent_context,
        "depth": depth,
        "is_terminal": terminal,
        "timestamp": datetime.now().isoformat()
    })

    return terminal

# ============================================================================
# LEVEL 0: USE CASE
# ============================================================================

print("=" * 80)
print("INTERACTIVE HIERARCHICAL DISCOVERY v2")
print("LLM Discovers → Human Validates → Code Enforces → System Learns")
print("=" * 80)
print()

use_case = input("What is the use case? (One sentence describing intent)\nYOUR ANSWER: ").strip()
print(f"\n✓ Use Case: {use_case}")

# ============================================================================
# LEVEL 1: LLM DISCOVERS MECE BOUNDARIES
# ============================================================================

print()
print("=" * 80)
print("LEVEL 1: LLM discovering MECE boundaries...")
print("=" * 80)

adapter = IntentAdapter()

boundary_question = f"""
Use Case: {use_case}

What are the MECE (Mutually Exclusive, Collectively Exhaustive) top-level
boundaries that define this system?

Answer with 3-7 categorical boundaries only. Do NOT list sub-branches yet.
"""

print("\n[Calling LLM for boundary discovery...]")
boundaries_result = adapter.discover(problem_text=boundary_question)

# Extract boundary names from result
llm_boundaries = list(boundaries_result.boundaries.keys())

# Present to human for validation
validated_boundaries = present_and_validate(
    llm_boundaries,
    "TOP LEVEL BOUNDARIES",
    "IntentAdapter"
)

print(f"\n✅ Boundaries established: {', '.join(validated_boundaries)}")

# ============================================================================
# RECURSIVE DISCOVERY FUNCTION
# ============================================================================

def discover_recursive(node, parent_context, depth=0):
    """
    Recursively discover branches using LLM + human validation.

    Args:
        node: Current node to explore
        parent_context: Parent path
        depth: Current depth

    Returns:
        Tree structure for this node
    """
    indent = "  " * depth
    context_path = f"{parent_context}/{node}" if parent_context else node

    print()
    print(f"{indent}{'=' * (80 - len(indent))}")
    print(f"{indent}Exploring: {node}")
    print(f"{indent}Context: {context_path}")
    print(f"{indent}Depth: {depth}")
    print(f"{indent}{'=' * (80 - len(indent))}")

    # Check if terminal
    if ask_if_terminal(node, parent_context, depth):
        print(f"{indent}✓ TERMINAL")
        return {"name": node, "terminal": True, "path": context_path}

    # Not terminal - LLM discovers sub-branches
    print(f"{indent}→ Not terminal, asking LLM to discover branches...")

    branch_question = f"""
    Use Case: {use_case}
    Current Context: {context_path}

    What are the distinct branches within '{node}'?

    Answer with 3-7 MECE branches. These are siblings within {node}, not grandchildren.
    """

    print(f"{indent}[Calling LLM for branch discovery...]")
    branches_result = adapter.discover(problem_text=branch_question)

    # Extract branch names
    llm_branches = list(branches_result.boundaries.keys())

    # Present to human for validation
    validated_branches = present_and_validate(
        llm_branches,
        f"BRANCHES within {node}",
        "IntentAdapter"
    )

    # Recurse on each validated branch
    children = []
    for branch in validated_branches:
        child_tree = discover_recursive(branch, context_path, depth + 1)
        children.append(child_tree)

    return {"name": node, "terminal": False, "path": context_path, "children": children}

# ============================================================================
# EXECUTE DISCOVERY FOR EACH BOUNDARY
# ============================================================================

start_time = datetime.now()

for boundary in validated_boundaries:
    tree = discover_recursive(boundary, "", depth=0)
    discovery_tree[boundary] = tree

end_time = datetime.now()

# ============================================================================
# OUTPUT RESULTS
# ============================================================================

print()
print("=" * 80)
print("HIERARCHICAL DISCOVERY COMPLETE")
print("=" * 80)
print()
print("Use Case:", use_case)
print(f"Boundaries: {len(validated_boundaries)}")
print(f"Time: {(end_time - start_time).total_seconds():.1f} seconds")
print()
print("Learning Summary:")
print(f"  Gaps logged (LLM missed): {len(learning_log['gaps'])}")
print(f"  Successes (LLM correct): {len(learning_log['successes'])}")
print(f"  Terminal confirmations: {len(learning_log['terminal_confirmations'])}")
print()
print("Complete Structure:")
print(json.dumps(discovery_tree, indent=2))
print()

# Save to file
timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
output_file = f"discovery_{timestamp_str}.json"
with open(output_file, 'w') as f:
    json.dump({
        "use_case": use_case,
        "boundaries": validated_boundaries,
        "tree": discovery_tree,
        "learning_log": learning_log,
        "timestamp": datetime.now().isoformat()
    }, f, indent=2)

print(f"💾 Saved to: {output_file}")

# Log to shared database
collector = get_evidence_collector()
discovery_id = collector.record_discovery(
    mode='intent',
    input_text=use_case,
    result={
        "tree": discovery_tree,
        "learning": learning_log
    },
    directory=sys.path[0],
    tokens=0,  # Interactive mode
    time_seconds=(end_time - start_time).total_seconds()
)

print(f"✅ Logged to shared database: {discovery_id}")
print()
print("=" * 80)
print("LEARNING CAPTURED:")
print("=" * 80)
print()
if learning_log["gaps"]:
    print("Gaps (what LLM missed):")
    for gap in learning_log["gaps"]:
        print(f"  Context: {gap['context']}")
        if gap['gap_type'] == 'missing_items':
            print(f"  LLM proposed: {gap['llm_proposed']}")
            print(f"  Human added: {gap['human_added']}")
        print()
else:
    print("No gaps! LLM got everything right on first try.")
print()
print("This learning will improve future discoveries.")
print("=" * 80)
