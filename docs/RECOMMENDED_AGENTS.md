# Recommended Agent Architecture for Stocker AI
**Created:** 2026-01-12 (Session 35)
**Based On:** 2+ weeks of development patterns and pain points

---

## Currently Available Agents

### ✅ Agents I Have Access To (Built-In)

| Agent | Current Use | Effectiveness | Notes |
|-------|-------------|---------------|-------|
| **Bash** | Command execution, git operations | ⭐⭐⭐⭐⭐ | Core tool, used constantly |
| **general-purpose** | Testing, validation, multi-step tasks | ⭐⭐⭐⭐ | Good but generic, lacks specialization |
| **Explore** | Fast codebase exploration | ⭐⭐⭐ | Underutilized - I often use Grep/Glob directly instead |
| **Plan** | Software architecture planning | ⭐⭐ | Should use more, especially for complex features |
| **claude-code-guide** | Help with Claude Code features | ⭐ | Rarely needed |
| **statusline-setup** | Configure status line | N/A | Not relevant to our work |

---

## Agents We NEED (Based on Recurring Patterns)

### 🔴 CRITICAL PRIORITY (High Frequency, High Impact)

#### 1. **n8n-workflow-specialist**
**Why:** We work with n8n workflows constantly - 15+ workflows, frequent debugging, deployment

**Current Pain Points:**
- Creating workflows requires manual JSON construction
- Validation is ad-hoc, often miss issues
- Debugging requires checking execution logs manually
- No systematic testing before deployment

**What This Agent Would Do:**
- Create workflows from high-level descriptions
- Validate workflow structure, connections, code syntax
- Check n8n executions for errors automatically
- Generate workflow documentation
- Compare workflow versions (before/after changes)
- Test workflows in isolation before deployment
- Detect breaking changes when updating nodes

**Tools It Would Have:**
- All n8n MCP tools (create, get, update, validate, executions, health check)
- Workflow comparison logic
- Execution log analysis
- Schema validation

**Usage Example:**
```
User: "Create a workflow that fetches item data from 3 tables and merges them"
Agent: [Analyzes requirement, creates workflow JSON, validates, tests, returns ID]
```

**Impact:** Would have saved 3-4 hours in Session 35 alone (Edge Function creation, validation, deployment)

---

#### 2. **bug-validator**
**Why:** Found 5 critical bugs in one session - need systematic boundary analysis

**Current Pain Points:**
- Bugs span multiple boundaries (DB → n8n → frontend → AI)
- Hard to predict downstream impacts of fixes
- Testing is manual and incomplete
- Easy to fix symptom instead of root cause

**What This Agent Would Do:**
- Systematic boundary analysis (10 MECE boundaries from CLAUDE.md)
- Generate comprehensive test cases for each fix
- Cross-boundary impact analysis
- Validate fixes don't introduce regressions
- Create before/after test reports
- Identify root causes vs symptoms

**Tools It Would Have:**
- Database query tools (check cascades, RLS policies)
- n8n execution checker
- Frontend code analyzer
- Test case generator

**Usage Example:**
```
User: "I changed the threshold logic in environmental detection"
Agent: [Analyzes change, identifies all affected boundaries, generates test cases,
        validates no side effects in VAD settings, mic gain, or session state]
```

**Impact:** Would have caught the threshold normalization bug BEFORE deployment

---

#### 3. **documentation-syncer**
**Why:** Documentation drift is a recurring problem (happened 3x in one session)

**Current Pain Points:**
- Code changes don't trigger doc updates
- MEMORY.md gets out of sync with reality
- Workflow IDs not documented
- Session summaries incomplete or missing sections

**What This Agent Would Do:**
- Automatically detect code vs docs drift
- Update MEMORY.md when code changes
- Generate session summaries from git commits
- Validate all required sections present
- Cross-reference workflow IDs with n8n
- Track deployment status (what's actually live vs claimed)

**Tools It Would Have:**
- Git commit analysis
- File diff comparison
- MEMORY.md parser
- n8n workflow list
- Pattern matching for feature markers

**Usage Example:**
```
User: "Just committed a fix to useVoice.ts"
Agent: [Detects change, checks if MEMORY.md updated, finds Priority 4 not documented,
        generates MEMORY.md update, commits automatically]
```

**Impact:** Would have prevented the 3x documentation drift in Session 35

---

### 🟡 HIGH PRIORITY (Frequent Use, Moderate Impact)

#### 4. **performance-analyzer**
**Why:** Performance optimization is a core theme (5 priorities tracked)

**Current Pain Points:**
- Hard to measure actual improvements
- Before/after comparisons are manual
- Latency tracking is inconsistent
- No automated performance regression detection

**What This Agent Would Do:**
- Measure API latency automatically
- Generate before/after performance reports
- Track performance over time (trend analysis)
- Identify bottlenecks in request flow
- Validate claimed improvements match reality
- Alert on performance regressions

**Tools It Would Have:**
- Network timing analysis
- n8n execution time parser
- Frontend performance profiling
- Automated test runner with timing

**Usage Example:**
```
User: "Measure the performance improvement from Edge Function"
Agent: [Runs 100 requests on old workflow, 100 on new workflow, generates report:
        Old: 2400ms avg, New: 1800ms avg, Improvement: 600ms (25% faster)]
```

**Impact:** Would provide concrete data for all 5 performance priorities

---

#### 5. **database-migration-assistant**
**Why:** Schema changes are risky and require careful cascade analysis

**Current Pain Points:**
- Cascade effects are hard to predict
- RLS policies not always validated
- Migration scripts are manual
- Orphaned data detection is ad-hoc

**What This Agent Would Do:**
- Analyze schema change impacts
- Check cascade delete/update effects
- Validate RLS policies still work after change
- Generate safe migration scripts
- Detect orphaned data before and after
- Test migrations on copy of data first

**Tools It Would Have:**
- Database schema introspection
- Foreign key analyzer
- RLS policy checker
- Migration script generator
- Data integrity validator

**Usage Example:**
```
User: "I want to add a voiceprint column to profiles table"
Agent: [Checks FK references, generates migration SQL, validates no breaking changes,
        tests with sample data, returns safe migration script]
```

**Impact:** Would have accelerated voice biometric planning from hours to minutes

---

#### 6. **voice-recognition-tuner**
**Why:** Voice commands are core product feature, need specialized testing

**Current Pain Points:**
- Hard to test phonetic variations systematically
- Environmental adaptation is untested
- Command recognition accuracy not measured
- Cross-talk scenarios are manual to test

**What This Agent Would Do:**
- Generate phonetic variations of commands
- Test CommandRecognizer with variations
- Measure recognition accuracy (% matched)
- Simulate environmental noise profiles
- Test cross-talk scenarios (multiple voices)
- Recommend threshold adjustments

**Tools It Would Have:**
- CommandRecognizer pattern tester
- Phonetic variation generator
- Audio simulation (noise profiles)
- Accuracy metrics calculator

**Usage Example:**
```
User: "Test if 'next' command recognizes phonetic variations"
Agent: [Tests: next, nex, necks, next item, nekst, nekt → 95% accuracy,
        suggests adding "neks" to patterns for 99% coverage]
```

**Impact:** Would improve voice recognition accuracy systematically

---

### 🟢 MEDIUM PRIORITY (Occasional Use, High Value)

#### 7. **deployment-orchestrator**
**Why:** Multi-system deployments require coordination (frontend, n8n, database)

**What This Agent Would Do:**
- Coordinate deployments across systems
- Verify all components updated before activating
- Feature flag management
- Rollback planning and execution
- Deployment checklist generation
- Health check all systems after deployment

**Tools It Would Have:**
- Git push automation
- n8n workflow activation
- Database migration runner
- Feature flag toggler
- Health check validator

**Impact:** Would reduce deployment errors and streamline releases

---

#### 8. **test-report-generator**
**Why:** Testing generates lots of data, need organized reports

**What This Agent Would Do:**
- Aggregate test results from multiple sources
- Generate executive summaries
- Track test coverage over time
- Identify untested code paths
- Create test regression tracking

**Tools It Would Have:**
- Test result parser
- Markdown report generator
- Coverage analyzer
- Regression detector

**Impact:** Would have generated the 10-file test report automatically

---

#### 9. **ai-prompt-optimizer**
**Why:** System prompts evolve, need optimization for voice/TTS quality

**What This Agent Would Do:**
- Test AI prompt variations
- Measure response quality (latency, accuracy, clarity)
- A/B test prompts with real data
- Suggest prompt improvements
- Track prompt performance over time

**Tools It Would Have:**
- AI response analyzer
- Prompt variation generator
- Quality scorer
- A/B test runner

**Impact:** Would optimize voice recognition and TTS quality systematically

---

## Agent Usage Patterns (Session 35 Example)

**What Actually Happened:**
- Manual testing: 1.5 hours
- Bug discovery: Ad-hoc, found 5 bugs
- Documentation: Manual updates, 3x drift
- n8n workflow: Manual creation, manual validation
- Performance analysis: None (estimated, not measured)

**With Recommended Agents:**
```
1. n8n-workflow-specialist creates Edge Function workflow → 15 min (vs 1 hour)
2. bug-validator tests workflow → finds webhook path bug immediately → 5 min
3. documentation-syncer updates MEMORY.md automatically → 2 min (vs 20 min)
4. performance-analyzer measures improvement → 10 min (vs N/A)
5. bug-validator tests environmental detection → finds all 3 bugs → 20 min (vs 1 hour)
6. test-report-generator creates comprehensive report → 5 min (vs 30 min)

TOTAL TIME: ~60 min (vs 4-5 hours actual)
SAVINGS: 3-4 hours (66-75% faster)
QUALITY: Higher (systematic testing vs ad-hoc)
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1)
1. **n8n-workflow-specialist** - Highest frequency use
2. **bug-validator** - Highest impact on quality
3. **documentation-syncer** - Prevents recurring pain

### Phase 2: Optimization (Week 2-3)
4. **performance-analyzer** - Core product requirement
5. **database-migration-assistant** - High risk reduction
6. **voice-recognition-tuner** - Product quality improvement

### Phase 3: Advanced (Week 4+)
7. **deployment-orchestrator** - Multi-system coordination
8. **test-report-generator** - Reporting automation
9. **ai-prompt-optimizer** - Continuous improvement

---

## Agent Design Principles

### 1. Specialization Over Generalization
- Each agent has a narrow, well-defined domain
- Deep expertise in that domain
- Clear when to use which agent

### 2. Tool Access Based on Domain
- n8n-workflow-specialist gets ALL n8n MCP tools
- database-migration-assistant gets database introspection tools
- No generic "do everything" agent

### 3. Composability
- Agents can call other agents
- Example: deployment-orchestrator calls bug-validator before deploying

### 4. Observable Behavior
- All agents log what they're doing
- Generate reports for user review
- No silent failures

### 5. Safe by Default
- Agents validate before executing
- Dry-run mode available
- Rollback procedures documented

---

## Measuring Agent Effectiveness

Track these metrics for each agent:

| Metric | Target | Why |
|--------|--------|-----|
| **Time Saved** | >50% reduction | Quantify efficiency gain |
| **Quality Improvement** | Fewer bugs in production | Measure preventative value |
| **Usage Frequency** | 2+ times per session | Validate agent is useful |
| **User Satisfaction** | 8/10+ rating | Ensure agent helps, not hinders |
| **False Positive Rate** | <5% | Agent accuracy |

---

## Questions for Implementation

1. **Can agents be persistent across sessions?**
   - Current: No, ephemeral per session
   - Desired: Agent "memory" of project patterns

2. **Can agents share knowledge?**
   - Current: No, each agent isolated
   - Desired: Shared knowledge base (e.g., "this workflow failed before because X")

3. **Can agents learn from mistakes?**
   - Current: No learning
   - Desired: Improve suggestions based on what worked/didn't work

4. **Can agents be customized per project?**
   - Current: Generic agents
   - Desired: Stocker AI-specific tuning

---

## Next Steps

1. **Pilot:** Implement n8n-workflow-specialist first (highest impact)
2. **Measure:** Track time saved, bugs prevented, user satisfaction
3. **Iterate:** Refine based on actual usage
4. **Expand:** Add bug-validator and documentation-syncer
5. **Evaluate:** After 3 agents, assess if pattern is working

---

**Status:** ✅ RECOMMENDATION READY
**Next Review:** After implementing first 3 agents (Phase 1)

