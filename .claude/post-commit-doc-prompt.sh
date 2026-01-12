#!/bin/bash
# Post-Commit Documentation Prompt
# Runs after every commit to check if docs need updating

PROJECT_ROOT="/home/visionairy/StockerAI"

# Get the files changed in the last commit
CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD)

# Check if any performance-critical files were changed
PERFORMANCE_FILES_CHANGED=0
WORKFLOW_FILES_CHANGED=0

while IFS= read -r file; do
    case "$file" in
        src/hooks/useVoice.ts|\
        src/hooks/useStockerAI.ts|\
        src/hooks/useItemCache.ts|\
        supabase/functions/*)
            PERFORMANCE_FILES_CHANGED=1
            ;;
        workflows/*.json)
            WORKFLOW_FILES_CHANGED=1
            ;;
    esac
done <<< "$CHANGED_FILES"

# If relevant files changed, prompt for doc update
if [ $PERFORMANCE_FILES_CHANGED -eq 1 ] || [ $WORKFLOW_FILES_CHANGED -eq 1 ]; then
    echo ""
    echo "=========================================="
    echo "📝 DOCUMENTATION UPDATE REMINDER"
    echo "=========================================="
    echo ""
    echo "You just committed changes to files that may require documentation updates:"
    echo ""
    echo "$CHANGED_FILES" | grep -E "(useVoice|useStockerAI|useItemCache|workflows|functions)"
    echo ""
    echo "Please update:"
    if [ $PERFORMANCE_FILES_CHANGED -eq 1 ]; then
        echo "  - MEMORY.md (Session summary)"
        echo "  - docs/PERFORMANCE_OPTIMIZATION_ANALYSIS.md (if performance-related)"
    fi
    if [ $WORKFLOW_FILES_CHANGED -eq 1 ]; then
        echo "  - MEMORY.md (Workflow IDs and status)"
    fi
    echo ""
    echo "Run: .claude/generate-session-template.sh to get a template"
    echo "Run: .claude/validate-docs.sh to check for drift"
    echo ""
fi
