#!/bin/bash
# Documentation Sync Validation Script
# Auto-detects code vs docs drift and prompts for updates

set -e

PROJECT_ROOT="/home/visionairy/StockerAI"
CONFIG_FILE="$PROJECT_ROOT/.claude/doc-sync.config.json"
REPORT_FILE="$PROJECT_ROOT/.claude/doc-validation-report.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================"
echo "Documentation Sync Validator"
echo "================================"
echo ""

# Function to check if a feature exists in code
check_feature_in_code() {
    local feature_name="$1"
    local file_pattern="$2"

    if grep -r "$feature_name" $PROJECT_ROOT/$file_pattern >/dev/null 2>&1; then
        return 0 # Found
    else
        return 1 # Not found
    fi
}

# Function to check if feature is documented
check_feature_in_docs() {
    local feature_name="$1"
    local doc_file="$2"

    if grep -i "$feature_name" "$PROJECT_ROOT/$doc_file" >/dev/null 2>&1; then
        return 0 # Found
    else
        return 1 # Not found
    fi
}

# Function to extract status from docs
get_doc_status() {
    local feature_name="$1"
    local doc_file="$2"

    # Look for status keywords near the feature name
    grep -i "$feature_name" "$PROJECT_ROOT/$doc_file" -A 3 -B 3 | \
        grep -oE "(DONE|BUILT|DEPLOYED|ACTIVE|INACTIVE|SKIPPED|NOT BUILT|CANCELLED)" | \
        head -1
}

# Initialize report
echo "Validation Report - $(date)" > "$REPORT_FILE"
echo "======================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

DRIFT_FOUND=0

# Check Performance Optimizations
echo "Checking Performance Optimizations..."
echo "## Performance Optimizations" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Priority 4: Deepgram Endpointing
if grep -q "endpointing=100" "$PROJECT_ROOT/src/hooks/useVoice.ts"; then
    DOC_STATUS=$(get_doc_status "Priority 4" "docs/PERFORMANCE_OPTIMIZATION_ANALYSIS.md")
    if [[ "$DOC_STATUS" != "DONE" && "$DOC_STATUS" != "DEPLOYED" ]]; then
        echo -e "${RED}✗${NC} Priority 4 (Deepgram) is in code but docs say: $DOC_STATUS"
        echo "DRIFT: Priority 4 implemented in code (useVoice.ts:575) but docs say: $DOC_STATUS" >> "$REPORT_FILE"
        DRIFT_FOUND=1
    else
        echo -e "${GREEN}✓${NC} Priority 4 (Deepgram) - Code and docs match"
    fi
else
    echo -e "${YELLOW}!${NC} Priority 4 (Deepgram) not found in code"
fi

# Priority 5: TTS Prefetch
if grep -q "prefetchTTS" "$PROJECT_ROOT/src/pages/StockerApp.tsx"; then
    DOC_STATUS=$(get_doc_status "Priority 5" "docs/PERFORMANCE_OPTIMIZATION_ANALYSIS.md")
    if [[ "$DOC_STATUS" != "DONE" && "$DOC_STATUS" != "DEPLOYED" ]]; then
        echo -e "${RED}✗${NC} Priority 5 (TTS Prefetch) is in code but docs say: $DOC_STATUS"
        echo "DRIFT: Priority 5 implemented in code (StockerApp.tsx) but docs say: $DOC_STATUS" >> "$REPORT_FILE"
        DRIFT_FOUND=1
    else
        echo -e "${GREEN}✓${NC} Priority 5 (TTS Prefetch) - Code and docs match"
    fi
else
    echo -e "${YELLOW}!${NC} Priority 5 (TTS Prefetch) not found in code"
fi

echo "" >> "$REPORT_FILE"

# Check Workflow IDs
echo ""
echo "Checking Workflow Documentation..."
echo "## Workflow IDs" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Get all workflow files
if [ -d "$PROJECT_ROOT/workflows" ]; then
    for workflow_file in "$PROJECT_ROOT/workflows"/*.json; do
        if [ -f "$workflow_file" ]; then
            filename=$(basename "$workflow_file")
            # Extract ID from JSON (simplified - assumes id is in root)
            workflow_id=$(grep -oP '"id":\s*"\K[^"]+' "$workflow_file" | head -1)

            if [ -n "$workflow_id" ]; then
                if grep -q "$workflow_id" "$PROJECT_ROOT/MEMORY.md"; then
                    echo -e "${GREEN}✓${NC} Workflow $filename ($workflow_id) documented in MEMORY.md"
                else
                    echo -e "${RED}✗${NC} Workflow $filename ($workflow_id) NOT in MEMORY.md"
                    echo "DRIFT: Workflow $workflow_id exists but not documented in MEMORY.md" >> "$REPORT_FILE"
                    DRIFT_FOUND=1
                fi
            fi
        fi
    done
fi

echo "" >> "$REPORT_FILE"

# Check Session Completeness in MEMORY.md
echo ""
echo "Checking Recent Session Documentation..."
echo "## Session Documentation" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Get most recent session number from MEMORY.md
LATEST_SESSION=$(grep -oP "SESSION \K[0-9]+" "$PROJECT_ROOT/MEMORY.md" | sort -n | tail -1)

if [ -n "$LATEST_SESSION" ]; then
    echo "Latest documented session: $LATEST_SESSION"

    # Check if session has all required sections
    SESSION_CONTENT=$(sed -n "/## .*SESSION $LATEST_SESSION/,/## .*SESSION $((LATEST_SESSION-1))/p" "$PROJECT_ROOT/MEMORY.md")

    REQUIRED_SECTIONS=("Session Summary" "What Changed" "Files Modified" "Git Commit")

    for section in "${REQUIRED_SECTIONS[@]}"; do
        if echo "$SESSION_CONTENT" | grep -q "$section"; then
            echo -e "${GREEN}✓${NC} Session $LATEST_SESSION has '$section'"
        else
            echo -e "${YELLOW}!${NC} Session $LATEST_SESSION missing '$section'"
            echo "WARNING: Session $LATEST_SESSION missing section: $section" >> "$REPORT_FILE"
        fi
    done
else
    echo -e "${YELLOW}!${NC} No sessions found in MEMORY.md"
fi

echo "" >> "$REPORT_FILE"

# Summary
echo ""
echo "======================================" >> "$REPORT_FILE"
echo ""
if [ $DRIFT_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ No documentation drift detected${NC}"
    echo "RESULT: No drift detected" >> "$REPORT_FILE"
else
    echo -e "${RED}✗ Documentation drift found - see $REPORT_FILE${NC}"
    echo "RESULT: DRIFT DETECTED - Update required" >> "$REPORT_FILE"
fi

echo ""
echo "Full report: $REPORT_FILE"
echo ""

exit $DRIFT_FOUND
