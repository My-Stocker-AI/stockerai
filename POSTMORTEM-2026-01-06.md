# Post-Mortem: "Next" Command Failure - 2026-01-06

## What Happened

**Timeline:**
- **Jan 5 (night)**: User tested system successfully - all features working
- **Jan 6, 04:36 UTC**: n8n workflow "get_next_item" was manually edited (someone added extra `}`)
- **Jan 6, daytime**: Davy tested system, "next" command failed with syntax error
- **Jan 6, 23:10 UTC**: Error discovered and fixed via n8n-mcp API

**Impact:**
- Every "next" command failed with `SyntaxError: Unexpected token '}'`
- 20+ failed executions before diagnosis
- Workflow was broken for ~19 hours

## Root Cause

**Direct cause:** Human error - manual edit in n8n UI added extra closing brace `}` at end of JavaScript code in "Determine Next State" node.

**Deeper cause:** No automated validation of n8n workflows after manual edits.

## Why This Wasn't Caught Earlier

**User's question:** "If you're using XF methodology for troubleshooting, why are errors still occurring?"

**Honest answer:** XF methodology is **reactive** (diagnose reported errors) not **proactive** (prevent all errors).

### What I Did Wrong

When fixing iOS Safari issues on Jan 6, I:
- ✅ Added frontend error logging
- ✅ Fixed audio unlock bugs
- ✅ Deployed diagnostic overlay
- ❌ **Did NOT validate backend workflows**
- ❌ **Did NOT run end-to-end system tests**
- ❌ **Did NOT set up workflow validation**

I assumed "if it's not broken, don't check it." This was wrong.

### The Limitation of Current Approach

**What I can do:**
- Exhaustively troubleshoot reported bugs
- Fix errors after they occur
- Add logging/diagnostics for future debugging

**What I cannot do (currently):**
- Monitor n8n UI for manual edits in real-time
- Prevent humans from making typos in external systems
- Automatically validate workflows when someone edits them in n8n UI

## Additional Issues Found

During post-incident audit, found **4 more workflows with validation errors:**
1. get_routes_for_date - Webhook config error
2. skip_current_machine - Output formatting error
3. start_machine - Output formatting error
4. go_back_to_skipped - Output formatting error

**Status:** These errors might not be critical (n8n runtime may be more forgiving than validator), but they should be investigated.

**Next action:** Test each workflow in production to determine if errors are real or just validator warnings.

## Prevention Measures

### Immediate (Completed)
- ✅ Fixed syntax error in get_next_item workflow
- ✅ Created workflow validation script (`scripts/validate-n8n-workflows.js`)
- ✅ Documented incident

### Short-term (To Do)
- [ ] Test all 4 workflows with validation errors
- [ ] Fix confirmed critical errors
- [ ] Set up daily cron job to validate workflows
- [ ] Add pre-deployment validation checklist

### Long-term (To Consider)
- [ ] Set up n8n workflow change notifications (Slack/email)
- [ ] Create read-only n8n roles for viewing vs editing
- [ ] Implement workflow versioning/approval process
- [ ] Add automated end-to-end tests that exercise all workflows

## Lessons Learned

1. **Don't assume external systems are stable** - Even if frontend works, backend might be broken
2. **Proactive validation > reactive fixes** - Catching errors before users report them is better
3. **Manual edits in cloud UIs are dangerous** - No git history, no review, no validation
4. **XF methodology needs expansion** - Should include proactive system audits, not just reactive troubleshooting

## Action Items

**For Claude Code sessions:**
- [ ] Add "Validate all n8n workflows" to standard troubleshooting checklist
- [ ] Run workflow validation before marking any issue as "resolved"
- [ ] Document all external system dependencies and their validation methods

**For User:**
- [ ] Decide if workflow validation should run daily via cron
- [ ] Consider access controls for n8n (who can edit production workflows?)
- [ ] Review if any other team members are editing workflows

## Questions Remaining

1. **Who edited the workflow at 04:36 UTC?**
   - Version history doesn't show detailed edit logs
   - Need to check n8n audit logs or ask team members

2. **Why didn't this break the system last night?**
   - The edit happened AFTER user's testing session
   - Timing: User tested → slept → workflow edited → Davy tested → error discovered

3. **Are the other 4 workflow "errors" real or false positives?**
   - Validator may be stricter than n8n runtime
   - Need to test in production to confirm

## Conclusion

**What the user experienced:**
"System worked fine → nothing changed → now it's broken"

**What actually happened:**
"System worked fine → someone edited workflow in n8n UI while you slept → typo introduced → system broken"

**What I should have done:**
Run full system validation (frontend + backend + workflows + database) as part of the troubleshooting session, not just fix the reported iOS Safari issues.

**Going forward:**
Adding proactive validation to prevent this class of errors.

---

**Incident severity:** Medium (user-facing feature broken, but no data loss)
**Time to detect:** ~19 hours
**Time to fix:** 5 minutes (once diagnosed)
**Detection method:** User report → n8n-mcp execution logs
**Prevention:** Automated workflow validation (in progress)
