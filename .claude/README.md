# Automated Documentation Sync System

**Created:** 2026-01-12 (Session 35)
**Purpose:** Prevent documentation drift between code and docs

---

## Problem Statement

Documentation was repeatedly out of sync with code reality:
- Priority 4 (Deepgram) implemented in code but docs said "NOT DONE"
- Priority 5 (TTS Prefetch) implemented in code but docs said "NOT INTEGRATED"
- Workflow IDs created but not documented in MEMORY.md
- Session summaries missing required sections

**Root Cause:** Manual documentation updates, no automation

---

## Solution Components

### 1. Configuration (`doc-sync.config.json`)
Defines what to watch and validate:
- **Watch Patterns:** Files that trigger doc update requirements
- **Required Docs:** Which docs must be updated for each file type
- **Validation Rules:** How to check code vs docs consistency

### 2. Validation Script (`validate-docs.sh`)
Automatically detects drift:
```bash
./claude/validate-docs.sh
```

**Checks:**
- ✓ Performance optimizations (Priorities 1-5) match code reality
- ✓ Workflow IDs are documented in MEMORY.md
- ✓ Recent sessions have all required sections
- ✓ Feature status keywords match implementation

**Output:**
- Console: Color-coded pass/fail for each check
- Report: `.claude/doc-validation-report.txt` with details

### 3. Session Template Generator (`generate-session-template.sh`)
Creates standardized session documentation:
```bash
./.claude/generate-session-template.sh
```

**Generates:**
- Auto-incremented session number
- Current date
- Required sections: Summary, Changes, Testing, Commits, Next Steps

### 4. Git Post-Commit Hook (`post-commit-doc-prompt.sh`)
Prompts after committing performance/workflow files:
```bash
# Runs automatically after every commit
# Detects if you changed:
#   - src/hooks/useVoice.ts
#   - src/hooks/useStockerAI.ts
#   - supabase/functions/*
#   - workflows/*.json
# Then reminds you to update docs
```

---

## Usage

### For Claude Code

**After making code changes:**
1. Commit your code changes normally
2. Post-commit hook will remind you if docs need updating
3. Run validation: `./claude/validate-docs.sh`
4. If drift found, update docs
5. Commit doc updates

**Starting a new session:**
1. Run: `./.claude/generate-session-template.sh`
2. Copy template to top of MEMORY.md
3. Fill in as you work
4. Validate before ending session

**Before ending a session:**
1. Run: `./claude/validate-docs.sh`
2. Fix any drift found
3. Commit final doc updates

### For User

**Weekly validation:**
```bash
cd /home/visionairy/StockerAI
./claude/validate-docs.sh
```

If drift found, check `.claude/doc-validation-report.txt` for details.

---

## Automated Checks

### Performance Optimizations
- [x] Priority 1 status matches code (Remove Get Routes)
- [x] Priority 2 status matches code (Edge Function)
- [x] Priority 3 status matches code (Item Prefetch - should be SKIPPED)
- [x] Priority 4 status matches code (Deepgram endpointing=100)
- [x] Priority 5 status matches code (prefetchTTS calls)

### Workflows
- [x] All workflow JSON files have IDs documented in MEMORY.md
- [x] Workflow status (ACTIVE/INACTIVE) matches reality

### Session Quality
- [x] Latest session has "Session Summary"
- [x] Latest session has "What Changed"
- [x] Latest session has "Files Modified"
- [x] Latest session has "Git Commit"

---

## Installation (Git Hooks)

### Option 1: Manual Install
```bash
cp .claude/post-commit-doc-prompt.sh .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

### Option 2: Automatic (add to project setup)
```bash
# In package.json or setup script
{
  "scripts": {
    "postinstall": "cp .claude/post-commit-doc-prompt.sh .git/hooks/post-commit && chmod +x .git/hooks/post-commit"
  }
}
```

---

## Extending to New Directories

When adding a new project directory (e.g., `/home/visionairy/NewProject`):

1. **Copy the system:**
   ```bash
   cp -r /home/visionairy/StockerAI/.claude /home/visionairy/NewProject/
   ```

2. **Update `doc-sync.config.json`:**
   - Add new file patterns to watch
   - Define which docs are required
   - Add validation rules

3. **Create MEMORY.md** in new project
4. **Run validation:** `./claude/validate-docs.sh`

---

## Future Enhancements

### Planned (Not Yet Implemented)
1. **Auto-generation of session summaries** from git commit messages
2. **Slack/Discord notifications** when drift detected in CI/CD
3. **GitHub Actions integration** - block merges if docs not updated
4. **AI-assisted doc updates** - suggest MEMORY.md changes based on code diffs
5. **Cross-project validation** - ensure StockerAI main docs sync with subdirectories

---

## Maintenance

### Adding New Validation Rules

Edit `.claude/doc-sync.config.json`:
```json
{
  "watch_patterns": {
    "your_feature": {
      "files": ["src/your/file.ts"],
      "required_docs": ["MEMORY.md"],
      "validation_rules": [
        {
          "name": "Your feature is documented",
          "check": "feature_exists",
          "doc_pattern": "Your Feature: .* (DONE|PENDING)"
        }
      ]
    }
  }
}
```

Then update `validate-docs.sh` to check that rule.

---

## Troubleshooting

**Problem:** Validation script doesn't detect my change
**Solution:** Check if your file is in `watch_patterns` in config

**Problem:** Too many false positives
**Solution:** Refine `doc_pattern` regex in validation rules

**Problem:** Post-commit hook not running
**Solution:** Check `.git/hooks/post-commit` exists and is executable

---

## Files in This System

```
.claude/
├── README.md                       # This file
├── doc-sync.config.json            # Configuration
├── validate-docs.sh                # Drift detection script ✅
├── generate-session-template.sh   # Session template generator ✅
├── post-commit-doc-prompt.sh       # Git hook reminder ✅
└── doc-validation-report.txt       # Latest validation report (auto-generated)
```

---

## Success Metrics

**Goal:** Zero documentation drift

**Tracking:**
- Run validation weekly
- Track drift incidents before/after automation
- Measure time saved (estimate: 30-60 min per session)

**Target:**
- <1 drift incident per month
- 100% session completeness
- All workflows documented within 24 hours

---

**Status:** ✅ SYSTEM ACTIVE
**Last Updated:** 2026-01-12
**Next Review:** 2026-02-12 (monthly check-in)
