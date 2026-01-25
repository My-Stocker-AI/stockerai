# StockerAI Documentation Index
**Last Updated:** 2026-01-25
**Documentation Cleanup:** 177 files → 70 files (60% reduction)

---

## Quick Navigation

**For Claude Code:**
- Start here: `/CLAUDE.md` - Operational directives (PRIMARY)
- Session state: `/MEMORY.md` - Current session tracking
- System contracts: `/docs/DATA_CONTRACTS.md` - CRITICAL data contracts

**For Developers:**
- Product requirements: `STOCKER_PRD_v1.md`
- User guide: `USER_GUIDE.md` or `QUICKSTART_USER_GUIDE.md`
- Testing: `/docs/testing/`
- Workflows: `/docs/workflows/`

**For Reference:**
- Historical analysis: `/docs/archive/`
- Recent audits: `/docs/audits/`

---

## Root Level Files (4)

```
/StockerAI/
├── README.md                          # Project overview (public)
├── CLAUDE.md                          # Operational directives (PRIMARY)
├── MEMORY.md                          # Session state tracking
└── DOCUMENTATION_AUDIT_2026-01-25.md  # Cleanup documentation
```

**Rule:** Only operational files at root. Everything else goes in /docs.

---

## Active Documentation (6 files)

**Location:** `/docs/`

### Critical Contracts
- **DATA_CONTRACTS.md** ⚠️ CRITICAL - System-wide data contracts
  - Immutable vs mutable data separation
  - Route/Machine/Item/Session contracts
  - Workflow input/output contracts
  - Boundary validation requirements
  - Current violation analysis
  - Fix checklist (5 phases)

### Product & User Docs
- **STOCKER_PRD_v1.md** - Product requirements document
- **USER_GUIDE.md** - Complete user documentation
- **QUICKSTART_USER_GUIDE.md** - Getting started guide

### Reference
- **RECOMMENDED_AGENTS.md** - Agent configuration reference
- **CRITICAL_RLS_ISSUE.md** - Security warning (RLS disabled on 2 tables)

---

## Testing Documentation (7 files)

**Location:** `/docs/testing/`

- `ANALYSIS_SUMMARY.md` - Test analysis summary
- `CODE_REFERENCE.md` - Code reference for tests
- `README.md` - Testing overview
- `TEST_RESULTS_SUMMARY.md` - Test results compilation
- `environmental_detection_validation.md` - Environment validation
- `two_item_mode_debug_guide.md` - Debugging 2-item mode
- `two_item_mode_ui_validation.md` - UI validation for 2-item mode

---

## Workflow Documentation (3 files)

**Location:** `/docs/workflows/`

- `RESET_ROUTE.md` - Reset route implementation
- `TESTING_CHECKLIST.md` - Workflow testing checklist
- `get_next_item_optimization_summary.md` - Optimization notes

---

## Recent Audits (12 files)

**Location:** `/docs/audits/`
**Retention:** Last 30 days only

### January 2026 Audits
- `AUDIT_2026-01-18_account_id_validation.md`
- `AUDIT_2026-01-18_email_failure_rollback.md`
- `AUDIT_2026-01-18_permission_bypass.md`
- `AUDIT_2026-01-18_seat_limit_race_condition.md`
- `AUDIT_2026-01-18_tiered_billing.md`
- `AUDIT_2026-01-18_tiered_billing_FINAL.md`
- `AUDIT_2026-01-20_reverse_count2_premature_machine_complete.md`
- `AUDIT_20260120_REVERSE_COUNT2_INDEX_FIX.md`
- `AUDIT_20260122_COUNT_MACHINE_ROUTE_SYSTEMIC_FAILURES.md`
- `ALL_BUGS_COMPLETE_SUMMARY.md` - Comprehensive bug summary
- `CATASTROPHIC_FAILURE_CHAIN_20260122.md` - Critical failure analysis
- `XF_SYSTEMIC_FIX_20260120.md` - XF systematic fix

---

## Archive (38 files)

**Location:** `/docs/archive/`
**Purpose:** Reference material, learning, historical analysis

### Bug Analysis (7 files)
**Location:** `/docs/archive/bug_analysis/`

- `MACHINE_TRANSITION_BUG_COMPLETE_HISTORY.md` - Complete bug history
- `BUGFIX_20260122_2ITEM_CALLOUT.md`
- `BUGFIX_20260122_COUNT2_SYSTEMIC.md`
- `CRITICAL_BUGS_20260121_ANALYSIS.md`
- `CODE_LOGIC_ANALYSIS_20260122.md`
- `PRODUCTION_BUG_FIX_20260121.md`
- `FIX_IMPLEMENTATION_20260121.md`

### BBRD Analysis (8 files)
**Location:** `/docs/archive/bbrd/`

- `BBRD_ANALYSIS_SUMMARY.md`
- `BBRD_AS_HUMAN_AI_OS.md`
- `BBRD_ENFORCEMENT_PROTOCOL.md`
- `BBRD_TROUBLESHOOTING_PROTOCOL.md`
- `BOUNDARY_BRANCH_DISCOVERY_UX.md`
- `BOUNDARY_DIRECTORY_IMPACT_ANALYSIS.md`
- `BOUNDARY_OS_ONE_PAGER.md`
- `BOUNDARY_OS_WEDGE_STRATEGY.md`
- `FLON8_BBRD_INTEGRATION_IMPACT.md`

### Feature Specs (8 files)
**Location:** `/docs/archive/feature_specs/`

- `DEMO_FEATURE_SPEC.md`
- `LOVABLE_IMPLEMENTATION_SPEC.md`
- `UI_IMPLEMENTATION_SPEC.md`
- `ROUTE_MACHINE_VISIBILITY_SPEC.md`
- `VOICE_BIOMETRIC_IMPLEMENTATION.md` (future)
- `IMPLEMENTATION_ITEM_DISPLAY_ORDER_B.md`
- `ITEM_DISPLAY_ORDER_CHANGE_ANALYSIS.md`
- `LOCATION_HIERARCHY_ANALYSIS.md`

### XF Analysis (2 files)
**Location:** `/docs/archive/xf_analysis/`

- `XF_COMPLETE_ANALYSIS_20260122.md`
- `XF_COMPLETE_PLATFORM_ANALYSIS.md`
- `LOCATION_NAVIGATION_XF_ANALYSIS.md`

### Team Management (6 files)
**Location:** `/docs/archive/team_mgmt/`

- `TEAM_INVITE_SYSTEM_XF_ANALYSIS.md`
- `TEAM_INVITE_TESTING_PLAN.md`
- `TEAM_MGMT_ARCHITECTURE_DECISION.md`
- `TEAM_MGMT_DEPLOYMENT_GUIDE.md`
- `TEAMS_FEATURE_ANALYSIS.md`

### Performance Analysis (3 files)
**Location:** `/docs/archive/performance/`

- `PERFORMANCE_OPTIMIZATION_ANALYSIS.md`
- `ENVIRONMENTAL_ROBUSTNESS_ANALYSIS.md`
- `COMMAND_VOCABULARY_ANALYSIS.md`

### Marketing (2 files)
**Location:** `/docs/archive/marketing/`

- `FEATURES_AND_BENEFITS.md`
- `MARKETING_FRONTEND_DISCOVERY.md`

---

## File Retention Policy

### DELETE Immediately
- Deployment instruction files (obsolete after deployment)
- Status files (outdated)
- Session summaries (historical)
- Temporary analysis files (resolved)
- Fix instructions (resolved)
- One-time investigations
- Duplicate files

### KEEP (Active Use)
- CLAUDE.md (operational directives)
- MEMORY.md (session tracking)
- DATA_CONTRACTS.md (system contracts)
- PRD, user guides
- Recent audits (last 30 days)
- Testing documentation
- Current workflow docs

### ARCHIVE (Reference)
- BBRD analysis
- Critical bug histories (for learning)
- Implemented feature specs
- XF platform analysis
- Team management docs
- Performance analysis

### Automatic Cleanup
- Audits older than 30 days → Move to archive or delete
- Resolved bug analysis → Keep in archive for learning
- Completed feature specs → Keep in archive for reference

---

## Usage Guidelines

### For Claude Code
1. **Always check CLAUDE.md first** - Contains operational protocols
2. **Check DATA_CONTRACTS.md** - Before making any data/workflow changes
3. **Check MEMORY.md** - For current session state
4. **Reference archive/** - For historical context when debugging similar issues

### For Developers
1. **Start with PRD** - Understand product vision
2. **Read USER_GUIDE** - Understand user workflows
3. **Check testing/** - Before deploying changes
4. **Review recent audits/** - Learn from recent issues

### For Troubleshooting
1. Check CLAUDE.md for known issues
2. Check DATA_CONTRACTS.md for contract violations
3. Check archive/bug_analysis/ for similar historical issues
4. Check audits/ for recent systemic analysis

---

## Backup Information

**Full backup created:** `~/StockerAI_docs_backup_2026-01-25.tar.gz` (581KB)

**Restore command:**
```bash
cd /home/visionairy/StockerAI
tar -xzf ~/StockerAI_docs_backup_2026-01-25.tar.gz
```

---

## Statistics

**Before Cleanup (2026-01-25):**
- Total files: 177
- Root level: 66 files (CHAOS)
- Obsolete: ~60%
- Average age: 2-3 weeks old

**After Cleanup:**
- Total files: ~70 (60% reduction)
- Root level: 4 files only
- Active docs: 16
- Archived: 38
- Specialized: 22

**Result:** Documentation is now usable - can find anything in <30 seconds.

---

## Next Steps

1. ✅ Cleanup complete
2. ✅ New structure in place
3. ✅ Files organized by purpose
4. 🔄 Ready for Phase 1: Contract validation implementation
5. 🔄 Update CLAUDE.md references to new structure

---

**END OF INDEX**
