#!/usr/bin/env python3
"""
Log Meta-Lesson: System Impact Assessment is a Boundary
Purpose: Share learning that system impact analysis is non-optional
"""
import sys
sys.path.insert(0, '/home/visionairy/Xpansion')

from tools.evidence import get_evidence_collector

# Use factory - auto-detects Supabase config
collector = get_evidence_collector()

print('=' * 80)
print('LOGGING META-LESSON: System Impact Assessment is a Boundary')
print('=' * 80)
print()

# Prepare discovery result
result = {
    'boundaries': {
        'BUG_UNDERSTANDING': {
            'question': 'What is broken?',
            'elements': [
                'Root Cause: Session validation missing',
                'Impact: Wrong session data sent to workflows',
                'UX: Confusing errors if voice used before init'
            ]
        },
        'FIX_LOGIC': {
            'question': 'What code changes solve it?',
            'elements': [
                'Add session validation check',
                'Make error conversational',
                'Apply to all tool callers'
            ]
        },
        'SYSTEM_IMPACT': {
            'question': 'What else does this affect?',
            'elements': [
                'Find ALL callers (5 found)',
                'Analyze timing dependencies',
                'Detect race conditions',
                'Fix in 3 locations not 1'
            ]
        },
        'TESTING': {
            'question': 'Does it actually work?',
            'elements': [
                'Positive case test',
                'Negative case test',
                'Regression test'
            ]
        },
        'DEPLOYMENT': {
            'question': 'How to ship safely?',
            'elements': [
                'User staging test',
                'Rollback plan',
                'Monitoring'
            ]
        }
    },
    'violations': [],
    'provenance': {
        'source': 'User: "are you doing system impact assessment?"'
    },
    'iterations': 3
}

input_text = '''Meta-Lesson: System Impact Assessment is a Development Boundary

Fixing BUG-N8N-2 (session validation). Initial approach:
1. Understand bug ✓
2. Write fix ✓  
3. Ship it ❌ ← WRONG

Missing: SYSTEM IMPACT ASSESSMENT
- Where called? (Found 5 call sites)
- Timing issues? (Found race condition)
- Breaks what? (Would break app startup)

Result: Fix was correct BUT would break app due to race condition.

PATTERN: 5 Required Development Boundaries (MECE)
1. BUG_UNDERSTANDING
2. FIX_LOGIC
3. SYSTEM_IMPACT ← Cannot skip!
4. TESTING
5. DEPLOYMENT

User question forced discovery of missing boundary #3.
'''

try:
    discovery_id = collector.record_discovery(
        mode='system',  # Use 'system' mode for meta-learning about dev process
        input_text=input_text,
        result=result,
        directory='/home/visionairy/StockerAI',
        tokens=5000,
        time_seconds=600.0,
        model_used='sonnet'
    )

    print(f'✅ Logged to shared database: {discovery_id}')
    print()
    print('PATTERN: Development Process = 5 Boundaries')
    print('  Skipping SYSTEM_IMPACT = shipped bugs')
    print()
    print('This learning is now shared with all Xpansion users.')
    print('=' * 80)

    collector.record_outcome(
        discovery_id=discovery_id,
        outcome='insight_gained',
        notes='System Impact Assessment is required boundary in dev process'
    )
    print('✅ Outcome recorded')

except Exception as e:
    print(f'❌ ERROR: {e}')
    import traceback
    traceback.print_exc()
