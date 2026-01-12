#!/bin/bash
# Session Template Generator
# Creates standardized session documentation structure

PROJECT_ROOT="/home/visionairy/StockerAI"
MEMORY_FILE="$PROJECT_ROOT/MEMORY.md"

# Get next session number
LATEST_SESSION=$(grep -oP "SESSION \K[0-9]+" "$MEMORY_FILE" | sort -n | tail -1)
NEXT_SESSION=$((LATEST_SESSION + 1))

# Get current date
CURRENT_DATE=$(date +"%Y-%m-%d")

# Generate template
cat << EOF

---

## ✅ SESSION $NEXT_SESSION: [TITLE HERE] ($CURRENT_DATE)

### Session Summary
**User Request:** [What the user asked for]

**Critical Discovery/Decision:** [Key insights or decisions made]

### What Changed

**Files Modified:**
- \`file/path.ts\` - [Description of changes]
- \`another/file.md\` - [Description of changes]

**Key Changes:**
1. [Change 1]
2. [Change 2]
3. [Change 3]

### Implementation Details

[Technical details, code snippets, etc.]

### Testing Status

| Test | Status | Notes |
|------|--------|-------|
| [Test name] | ✅ PASS / ❌ FAIL / ⏳ PENDING | [Details] |

### Git Commits
**Commit:** \`[commit-hash]\`
**Message:** "[commit message]"
**Status:** ✅ Committed and pushed to main

### Performance Impact (if applicable)

**Before:** [metrics]
**After:** [metrics]
**Improvement:** [percentage or time saved]

### Deferred/Blocked Items (if any)

- [Item 1] - [Reason]
- [Item 2] - [Reason]

### Next Steps

1. [Step 1]
2. [Step 2]
3. [Step 3]

EOF

echo "Session $NEXT_SESSION template generated above."
echo "Copy this to the TOP of MEMORY.md (after the header, before Session $LATEST_SESSION)"
