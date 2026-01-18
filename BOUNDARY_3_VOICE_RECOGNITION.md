# Boundary 3: Voice Recognition Ambiguity - Deep Analysis
**Date:** 2026-01-17
**Method:** XF Sequential Discovery
**Status:** Complete

---

## Discovery Question

**Where can speech be misinterpreted in StockerAI voice commands?**

---

## Voice Recognition Flow

```
User speaks → Browser Web Speech API → Text transcript
                                             ↓
                                    AI prompt (GPT-4o-mini)
                                             ↓
                                    Intent classification
                                             ↓
                                    Tool call or text response
```

---

## Discovered Failure Modes (MECE)

### 1. SIMILAR-SOUNDING COMMANDS
**Trigger:** Phonetically similar words

**Scenarios:**

#### 1A. "next" vs "text" ✅ KNOWN ISSUE
- **Likelihood:** Medium (3/5) - Homophone
- **Impact:** High (4/5) - No action taken when "next" intended
- **Symptom:** User says "next", AI hears "text", responds "I don't understand"
- **Mitigation:** AI prompt has command list, but speech API decides transcript
- **Priority:** 12
- **Fix:** Add fuzzy matching for common mishearings

#### 1B. "skip" vs "skipped" vs "skip it"
- **Trigger:** Similar sounds, different intents
- **Analysis:**
  - "skip" alone → Too easy to mishear (AI prompt says don't trigger on this)
  - "skip machine" / "skip this machine" → Triggers skip intent ✓
  - "skipped" (past tense) → Might be user saying "I already skipped that"
- **Likelihood:** Low (2/5) - AI prompt guards against "skip" alone
- **Impact:** High (4/5) - Accidental machine skip
- **Priority:** 8

#### 1C. "done" vs "go" vs "phone"
- **Context:** "done" confirms item, triggers `get_next_item`
- **Misheard as "go":** Might still work ("go" → "next"?)
- **Misheard as "phone":** Would be rejected
- **Likelihood:** Low (2/5)
- **Impact:** Medium (3/5) - Confirmation fails
- **Priority:** 6

---

### 2. NUMBERS vs COMMANDS
**Trigger:** Ambiguous number context

**Scenarios:**

#### 2A. User confirms quantity "five" but AI thinks it's item/slot/route number ✅ FIXED
- **Location:** `useStockerAI.ts:489`
- **Mitigation (NEW):**
  ```typescript
  - If input sounds like a number but doesn't match expected item quantity, clarify:
    "Did you say [number]? Say next when ready for the next item."
  ```
- **Status:** ✅ Prompt guards against this
- **Likelihood:** Low (2/5) - Prompt clarifies
- **Impact:** Medium (3/5) - Wrong action
- **Priority:** 6

#### 2B. User says "Route 5" but which route is #5?
- **Trigger:** Multiple routes, user references by number
- **Question:** Are routes numbered in UI? Can user say "route 1" reliably?
- **Likelihood:** Medium (3/5) - Natural to reference by number
- **Impact:** Medium (3/5) - Wrong route selected
- **Priority:** 9
- **Investigation:** Does UI show route numbers?

#### 2C. "Zero" vs "O" (letter) in slots
- **Trigger:** Slot "010" spoken as "zero one zero" vs "oh one oh"
- **Question:** Does this matter? How are slots spoken?
- **Analysis:** Frontend converts to `slot_spoken` field
- **Likelihood:** Low (1/5) - Frontend handles this
- **Impact:** Low (1/5) - Display only
- **Priority:** 1

---

### 3. ROUTE NAME AMBIGUITY
**Trigger:** Similar route names

**Scenarios:**

#### 3A. "North" vs "New North" vs "North Campus"
- **Location:** `useStockerAI.ts:304-322` (Fuzzy route matching)
- **Prompt logic:**
  ```
  1. Match with semantic understanding (abbreviations, numbers, casual phrasing)
  2. If >80% confident → call set_route_sequence
  3. If <80% confident → ask for clarification
  ```
- **Example:** User says "North", routes are ["North Campus", "New North District"]
  - AI should ask: "I see North Campus and New North District. Which one?"
- **Likelihood:** Medium (3/5) - Depends on route names
- **Impact:** High (4/5) - Wrong route selected
- **Priority:** 12
- **Status:** Prompt has logic, but is threshold tuned correctly?

#### 3B. Partial name matches
- **Example:** User says "downtown", routes are ["Downtown Express", "Downtown Local"]
- **Expected:** AI asks which one
- **Likelihood:** Medium (3/5)
- **Impact:** Medium (3/5)
- **Priority:** 9
- **Status:** Prompt handles this ✓

#### 3C. Speech errors in route names
- **Example:** "Costco Run" heard as "Cost go run" or "Costco Ron"
- **Likelihood:** Medium (3/5) - Proper nouns hard for speech API
- **Impact:** High (4/5) - Route not found
- **Priority:** 12
- **Mitigation:** Fuzzy matching helps, but limited

---

### 4. CONTEXT-DEPENDENT MEANING
**Trigger:** Same word, different intent based on context

**Scenarios:**

#### 4A. "done" - item done vs machine done vs route done
- **Contexts:**
  1. After picking item → "done" = next item ✓
  2. While on machine → "done" = skip machine? or next item?
  3. After last machine → "done" = route complete ✓
- **Location:** `useStockerAI.ts:357-362`
- **Prompt:**
  ```
  When user says "done", "got it", "yes" → ALWAYS call get_next_item tool first
  ```
- **Analysis:** "done" always means "next item" per prompt ✓
- **Likelihood:** Low (2/5) - Prompt is clear
- **Impact:** Low (2/5) - Consistent behavior
- **Priority:** 4

#### 4B. "skip" without context
- **Trigger:** User says just "skip" mid-conversation
- **Location:** `useStockerAI.ts:446-456`
- **Prompt:**
  ```
  SKIP INTENT:
  - Explicit: "skip machine", "skip this machine"
  - Navigation: "go to next machine", "move to next machine"
  - DO NOT skip for just "skip" alone (too easy to mishear from "next")
  ```
- **Status:** ✓ Guarded
- **Likelihood:** Low (2/5)
- **Impact:** High (4/5) if triggered
- **Priority:** 8

#### 4C. "yes" - confirming what?
- **Trigger:** AI asks question, user says "yes"
- **Contexts:**
  1. "Skip this machine? Say yes to confirm" → yes = skip
  2. "Did you mean Route A?" → yes = select route
  3. Generic "yes" without question → ambiguous
- **Likelihood:** Low (2/5) - AI asks before acting
- **Impact:** Medium (3/5) - Wrong action
- **Priority:** 6

---

### 5. BACKGROUND NOISE INTERFERENCE
**Trigger:** Environmental sounds misinterpreted

**Scenarios:**

#### 5A. Machine beeps/alerts trigger command
- **Example:** Vending machine beeps, sounds like "next" or "skip"
- **Likelihood:** Low (2/5) - Speech API filters non-speech
- **Impact:** High (4/5) - Accidental action
- **Priority:** 8
- **Mitigation:** Require wake word? Or ignore short sounds?

#### 5B. Other workers' voices
- **Trigger:** Multiple people in area, wrong person's voice picked up
- **Likelihood:** Medium (3/5) - Warehouse environment
- **Impact:** High (4/5) - Commands executed unintentionally
- **Priority:** 12
- **Investigation:** Is push-to-talk available? Or continuous listening?

#### 5C. User says "not" but AI doesn't hear it
- **Example:** "Don't skip" heard as "skip"
- **Likelihood:** Medium (3/5) - Negations easy to miss
- **Impact:** High (4/5) - Opposite action
- **Priority:** 12
- **Mitigation:** Confirmation prompts help

---

### 6. MULTI-WORD COMMAND PARSING
**Trigger:** Command broken into separate words

**Scenarios:**

#### 6A. "Skip this machine" heard as three separate words
- **Question:** Does AI interpret each word separately or as phrase?
- **Analysis:** OpenAI gets full transcript, understands phrases ✓
- **Likelihood:** Low (1/5) - AI handles this
- **Impact:** Low (2/5)
- **Priority:** 2

#### 6B. "Go back" vs "Go" + "Back"
- **Trigger:** Pause between words breaks command
- **Likelihood:** Low (2/5) - AI should still understand
- **Impact:** Low (2/5)
- **Priority:** 4

---

### 7. WAKE WORD / ACTIVATION
**Trigger:** How does listening activate?

**Scenarios:**

#### 7A. Always-on listening drains battery
- **Question:** Is it push-to-talk or continuous?
- **Investigation:** Check voice.status states
- **Likelihood:** N/A - Design choice
- **Impact:** 3/5 (UX issue)
- **Priority:** N/A

#### 7B. No wake word → accidental activation
- **If continuous listening:** Random sounds trigger actions
- **Likelihood:** Medium (3/5)
- **Impact:** High (4/5)
- **Priority:** 12
- **Investigation:** Is there a wake word or push-to-talk?

---

## Risk Assessment Summary

| Failure Mode | Likelihood | Impact | Priority | Action |
|--------------|------------|--------|----------|--------|
| 1A. "next" vs "text" | 3 | 4 | 12 | **Add fuzzy matching** |
| 1B. "skip" variations | 2 | 4 | 8 | Document (guarded) |
| 1C. "done" homophones | 2 | 3 | 6 | Monitor |
| 2A. Number as quantity vs command | 2 | 3 | 6 | ✅ Guarded |
| 2B. "Route 5" ambiguity | 3 | 3 | 9 | **Check UI numbering** |
| 2C. "Zero" vs "O" | 1 | 1 | 1 | Ignore |
| 3A. Similar route names | 3 | 4 | 12 | **Tune matching threshold** |
| 3B. Partial route names | 3 | 3 | 9 | ✅ Handled |
| 3C. Speech errors in names | 3 | 4 | 12 | **Improve fuzzy matching** |
| 4A. "done" context | 2 | 2 | 4 | ✅ Consistent |
| 4B. "skip" without context | 2 | 4 | 8 | ✅ Guarded |
| 4C. "yes" ambiguity | 2 | 3 | 6 | Monitor |
| 5A. Background beeps | 2 | 4 | 8 | **Consider wake word** |
| 5B. Other workers' voices | 3 | 4 | 12 | **Check listening mode** |
| 5C. Negation missed | 3 | 4 | 12 | **Add confirmation** |
| 6A. Multi-word parsing | 1 | 2 | 2 | Ignore |
| 6B. Word pause breaks | 2 | 2 | 4 | Monitor |
| 7B. No wake word | 3 | 4 | 12 | **Investigate activation** |

---

## High Priority Items (12+)

### Voice Recognition Core Issues (Priority: 12 each)
1. **"next" vs "text" mishearing** - Add fuzzy matching
2. **Similar route names** - Tune confidence threshold
3. **Speech errors in route names** - Better fuzzy logic
4. **Background noise (other voices)** - Check if push-to-talk exists
5. **Negation missed ("don't skip")** - Add more confirmation prompts
6. **Wake word activation** - Investigate current activation method

---

## Code Locations to Inspect

1. `useStockerAI.ts:304-322` - Route name fuzzy matching logic
2. `useStockerAI.ts:357-362` - Confirmation command handling
3. `useStockerAI.ts:446-456` - Skip command guarding
4. Frontend voice activation - Check listening mode (continuous vs push-to-talk)

---

## Evidence Collection

**Questions for Davy:**
1. Ever say "next" but nothing happens?
2. Ever accidentally skip a machine from mishearing?
3. Have trouble selecting routes with similar names?
4. Does background noise trigger accidental commands?
5. Is it push-to-talk or always listening?
6. Ever say "don't do X" but system does X anyway?

---

## Next Boundary

**Boundary 4: Workflow Execution Failures**

---

**Status:** Boundary 3 complete - 17 failure modes discovered, 6 high-priority voice recognition issues identified
