# User Testing Questions for Davy
**Date:** 2026-01-17
**Purpose:** Validate theoretical bugs from XF discovery with real-world evidence
**Status:** Ready for user testing

---

## Instructions

Davy, please answer these questions based on your actual experience using the Stocker AI app. Your answers will help us prioritize which bugs to fix first.

**For each question:**
- Answer **YES** if you've experienced this issue
- Answer **NO** if you've never seen this happen
- Add **NOTES** with any details (how often, when, what happened)

---

## STATE SYNCHRONIZATION (Boundary 1)

### 1. Have you ever marked items as done, then the app crashed or closed, and when you reopened it your progress was lost?
- [ ] YES
- [ ] NO
- **NOTES:** ____________________________________________

### 2. Have you ever seen items you already completed reappear as "not done" after refreshing or reopening the app?
- [ ] YES
- [ ] NO
- **NOTES:** ____________________________________________

### 3. Have you ever double-tapped "next" quickly and noticed it skipped an item?
- [ ] YES
- [ ] NO
- **NOTES:** ____________________________________________

### 4. Have you ever seen the item counter show the wrong number (like "58 of 59" when there are more items)?
- [ ] YES - ⚠️ **This bug is now FIXED - please test to confirm**
- [ ] NO
- **NOTES:** ____________________________________________

---

## VOICE RECOGNITION (Boundary 3)

### 5. Have you ever said "next" but nothing happened (app didn't respond)?
- [ ] YES
- [ ] NO
- **How often:** ____________________________________________
- **NOTES:** ____________________________________________

### 6. Have you ever said one thing but the app understood something completely different?
- [ ] YES
- [ ] NO
- **Example of what you said vs what it heard:** ____________________________________________

### 7. When selecting a route by voice, have you ever had trouble because two routes have similar names?
- [ ] YES
- [ ] NO
- **Example route names:** ____________________________________________

### 8. Does background noise from other workers or warehouse sounds ever trigger commands you didn't say?
- [ ] YES
- [ ] NO
- **How often:** ____________________________________________
- **NOTES:** ____________________________________________

### 9. How do you activate voice commands?
- [ ] I say "ok stocker" or "hey stocker" before every command
- [ ] I just say commands directly without a wake word
- [ ] I'm not sure
- **NOTES:** ____________________________________________

### 10. Have you ever said "don't skip" or "don't do X" and the app did the opposite (heard "skip" or "do X")?
- [ ] YES
- [ ] NO
- **NOTES:** ____________________________________________

---

## SEQUENCE & INDEX (Boundary 2)

### 11. When using two-item mode (showing 2 items at once), have you ever seen it skip items or show the same item twice?
- [ ] YES
- [ ] NO
- **NOTES:** ____________________________________________

### 12. Have you ever used the "undo last item" feature in reverse mode?
- [ ] YES - it worked fine
- [ ] YES - it had problems
- [ ] NO - I don't use reverse mode
- [ ] NO - I didn't know undo existed
- **If problems, describe:** ____________________________________________

### 13. Have you ever skipped individual items (not entire machines), and if so, did it cause any weirdness with the item numbers?
- [ ] YES - I've skipped items and it worked fine
- [ ] YES - I've skipped items and it caused problems
- [ ] NO - I don't skip individual items, only machines
- **If problems, describe:** ____________________________________________

---

## MACHINE STATE (Boundary 5)

### 14. Have you ever completed some items on a machine, then skipped the machine? What happened to the items you already completed?
- [ ] YES - they stayed marked as done ✓
- [ ] YES - they reverted to not done ✗
- [ ] NO - I've never skipped a machine after starting it
- **NOTES:** ____________________________________________

### 15. Have you ever returned to a skipped machine later in the route?
- [ ] YES - ⚠️ **This scenario is now FIXED - please test to confirm**
- [ ] NO
- **If YES, did it show the correct items:** ____________________________________________

---

## WORKFLOW FAILURES (Boundary 4)

### 16. Have you ever said a command (like "next", "skip machine", "start route") and nothing happened at all?
- [ ] YES
- [ ] NO
- **Which command:** ____________________________________________
- **How often:** ____________________________________________

### 17. Have you ever seen an error message from the app?
- [ ] YES
- [ ] NO
- **What did the error say (if you remember):** ____________________________________________

---

## ROUTE COMPLETION (Boundary 7)

### 18. Have you ever had a route end before you finished all the machines?
- [ ] YES - ⚠️ **This bug is now FIXED - please test to confirm**
- [ ] NO
- **NOTES:** ____________________________________________

### 19. Have you ever had a route that seemed to never end (kept going even though you finished everything)?
- [ ] YES
- [ ] NO
- **NOTES:** ____________________________________________

---

## PERMISSIONS & SECURITY (Boundary 9)

### 20. Have you ever seen routes that belong to other drivers?
- [ ] YES
- [ ] NO
- **NOTES:** ____________________________________________

### 21. If you work with multiple drivers, have you ever tested two people using the app at the same time on different routes?
- [ ] YES - it worked fine
- [ ] YES - there were issues
- [ ] NO - I'm the only user
- **If issues, describe:** ____________________________________________

---

## TWO-ITEM MODE (Boundary 6)

### 22. Do you use two-item mode (showing 2 items at once)?
- [ ] YES - frequently
- [ ] YES - occasionally
- [ ] NO - I always use single-item mode
- **If YES, any problems:** ____________________________________________

### 23. In two-item mode, when you say "skip second item" or "skip item 2", does it skip the correct item?
- [ ] YES - always correct
- [ ] NO - sometimes skips wrong item
- [ ] N/A - I don't use two-item mode
- **NOTES:** ____________________________________________

---

## GENERAL EXPERIENCE

### 24. What's the MOST ANNOYING bug you've experienced? (Even if not mentioned above)
**ANSWER:** ____________________________________________

### 25. How often do you encounter bugs or issues?
- [ ] Every route
- [ ] A few times per day
- [ ] Once a day
- [ ] Once a week
- [ ] Rarely

### 26. What feature or fix would make your job SIGNIFICANTLY easier?
**ANSWER:** ____________________________________________

---

## WAREHOUSE ENVIRONMENT

### 27. What's the noise level like in your warehouse?
- [ ] Quiet (normal conversation level)
- [ ] Moderate (some background noise)
- [ ] Loud (music, machines, other workers talking)
- [ ] Very loud (need to raise voice)

### 28. How many other people work in the warehouse during your shift?
**ANSWER:** ____________________________________________

### 29. Do you use hands-free mode (voice only) or do you also tap the screen?
- [ ] 100% voice - never touch screen
- [ ] Mostly voice, occasionally tap
- [ ] 50/50 voice and tap
- [ ] Mostly tap, occasionally voice
- **NOTES:** ____________________________________________

---

## THANK YOU!

Your feedback is invaluable. These answers will help us:
1. Confirm which theoretical bugs are actually happening
2. Prioritize fixes that matter most to your daily work
3. Avoid wasting time on bugs that don't affect real usage

**Please return this completed form to your administrator.**

---

**Analysis Guide (for developer):**

- **Questions 1-4:** State sync issues (Priority 12)
- **Questions 5-10:** Voice recognition (6 items at Priority 12)
- **Questions 11-13:** Sequence/index edge cases (Priority 9)
- **Questions 14-15:** Machine state transitions (Priority 9)
- **Questions 16-17:** Workflow failures (Priority 8-10)
- **Questions 18-19:** Route completion (already fixed)
- **Questions 20-21:** Security/permissions (Priority 10 - CRITICAL)
- **Questions 22-23:** Two-item mode (Priority 6-8)
- **Questions 24-26:** Open feedback
- **Questions 27-29:** Environmental context

**Scoring:**
- 5+ YES answers in any category → HIGH PRIORITY for that boundary
- 3-4 YES answers → MEDIUM PRIORITY
- 1-2 YES answers → LOW PRIORITY
- 0 YES answers → THEORETICAL ONLY (monitor but don't fix)
