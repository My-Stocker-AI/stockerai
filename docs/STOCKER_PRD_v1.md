# Stocker: Voice-Guided Pre-Kitting System
## Product Requirements Document v1.0
### Generated: December 21, 2025
### Discovery Status: Complete - All Branches Terminated

---

## EXECUTIVE SUMMARY

**Product Name:** Stocker
**Purpose:** Voice-guided warehouse pre-kitting system for vending machine route preparation
**Target User:** Solo vending machine operator preparing daily route bins at 4AM
**Core Value:** Complete hands-free stocking process - zero screen interaction required

**Success Criteria:**
- Complete entire day's stocking without touching phone
- <2 second response latency
- 99% speech recognition accuracy
- Zero lost items or quantities
- Recovery from any interruption

---

## PRODUCT OVERVIEW

### What Stocker Does

Stocker is a conversational voice assistant that reads stocking lists to warehouse operators item-by-item, allowing completely hands-free bin preparation for vending machine routes. It replaces the current process of either having someone read lists aloud or constantly referring to laptop/phone screens.

### Core User Journey

1. **Morning Setup:** User opens app, specifies delivery date
2. **Route Loading:** System auto-loads PDFs from iCloud, user sets stocking order
3. **Hands-Free Stocking:** System reads products one-by-one, user confirms with voice
4. **Adaptive Control:** User can pause, reorder routes, skip machines, ask questions - all conversationally
5. **Automatic Recovery:** System saves state continuously, recovers from any interruption
6. **Session Completion:** User completes all routes, closes app, bins ready for delivery

---

## USER WORKFLOW REQUIREMENTS

### 1. SESSION INITIALIZATION

#### 1.1 App Launch & Date Selection

**User Action:** Opens Stocker app on iPhone

**System Behavior:**
```
System: "Good morning. What delivery date are you stocking for?"
```

**User Input Examples:**
- "December 21st"
- "12-21"
- "Today"
- "Tomorrow"

**System Response:**
```
System: "Loading routes for December 21st, 2025..."
[Scans iCloud folder for PDFs with matching date in filename]
System: "I've loaded 5 routes: South, North, East, West, and Central.
         What order would you like to stock these?"
```

**Requirements:**
- Extract delivery date from user's natural language input
- Parse all PDFs in monitored iCloud folder
- Filter PDFs by date in filename format: `[RouteName]_MMDDYYYY.pdf`
- If no PDFs match date: "No routes found for [date]. Please check iCloud folder."
- Extract route names from PDF headers
- Present routes in alphabetical order for initial sequencing

#### 1.2 Route Sequencing

**User Input Examples:**
- "Start with South, then North, then East, skip West for now, then Central"
- "South first, then the rest in order"
- "Do them alphabetically"

**System Response:**
```
System: "Confirmed. South route first, then North, then East, then Central.
         West route on hold. Ready to start South route?"
```

**Requirements:**
- Semantic understanding of sequencing commands (no rigid syntax)
- Track "active queue" vs "on hold" routes separately
- If user doesn't specify full sequence, assume remaining routes follow alphabetical order
- Confirm understood sequence before proceeding

#### 1.3 Route Start

**User Input:** "Yes" / "Ready" / "Let's go" / any affirmative

**System Response:**
```
System: "South route contains 2 locations: Salem Health Hospital and Oak Street Market.
         Starting Salem Health Hospital.
         Machine 27, SH-B5 Dual. Starting from bottom.
         First item: Aquafina Water Bottle 20 ounce, quantity 4"
```

**Requirements:**
- Parse PDF to identify all locations in route
- Announce total locations in route
- Announce first location name
- Announce first machine name/designation
- Indicate "starting from bottom" (reads slots in reverse order)
- Read first item immediately (don't wait for additional confirmation)

---

### 2. CORE STOCKING LOOP

#### 2.1 Item Announcement

**System Behavior:**
```
System: "[Product Name], quantity [Number]"
```

**Product Name Format:**
- Full descriptive name from PDF
- Remove internal codes like "(36X45G)"
- Include size designations: "20 ounce", "1.5 ounce"
- Include packaging: "Bottle", "Can"
- Example: "Coke Bottle 20 ounce Bottle, quantity 6"

**Quantity Handling:**
- If same product appears in multiple slots in same machine, aggregate
- Example: Slot 050 has "Coke Bottle 20 oz" qty 4, Slot 051 has "Coke Bottle 20 oz" qty 6
- System says: "Coke Bottle 20 ounce Bottle, total quantity 10"

**Requirements:**
- Read product name clearly at conversational pace
- Do NOT read slot numbers
- Do NOT read parlevel/inventory ratios
- Do NOT read prices
- Aggregate identical products within same machine only
- After announcing, wait for user confirmation

#### 2.2 User Confirmation

**User Input Examples:**
- "Next"
- "Ready"
- "Got it"
- "Done"
- "Okay"
- "Continue"

**System Response:**
```
System: "Next item: [Product Name], quantity [Number]"
```

**Requirements:**
- Semantic understanding of confirmation triggers (not keyword matching)
- NO automatic progression - always wait for explicit user confirmation
- Latency requirement: <2 seconds from end of user speech to next item announcement
- Do NOT repeat previous item quantity unless explicitly requested

#### 2.3 Machine Completion

**After Last Item Confirmed:**

**System Behavior:**
```
System: "That was the final item for Machine 27, SH-B5 Dual."
[Waits for user response]
```

**If 1 Minute Passes With No Response:**
```
System: "Confirming Machine 27, SH-B5 Dual complete. Ready for next machine?"
```

**User Input:** "Yes" / "Ready" / any affirmative

**System Response:**
```
System: "Machine 55, SH-A7 Dual Zone. Starting from bottom.
         First item: [Product Name], quantity [Number]"
```

**Requirements:**
- Announce machine completion explicitly
- Wait 1 minute before prompting for confirmation
- Require explicit confirmation before proceeding to next machine
- Track machine as "complete" only after confirmation received

#### 2.4 Location Completion

**After Last Machine in Location:**

**System Behavior:**
```
System: "Machine 70 complete. Salem Health Hospital fully stocked.
         Next location: Oak Street Market. Ready to start?"
```

**If Machines Were Skipped:**
```
System: "Machine 70 complete. You have 2 skipped machines at Salem Health Hospital:
         Machine 55, SH-A7 Dual Zone and Machine 61, SH-A6 Dual Zone.
         Would you like to stock these now or move to next location?"
```

**User Response Options:**
- "Stock them now" → Return to first skipped machine
- "Move to next location" / "Skip them" → Proceed to Oak Street Market
- "Stock Machine 55 only" → Stock specific skipped machine, leave others skipped

**Requirements:**
- Announce location completion
- List all skipped machines (if any) with machine names
- Allow user to choose: complete skipped machines now or proceed
- Track skipped machines throughout session

#### 2.5 Route Completion

**After Last Location in Route:**

**System Behavior:**
```
System: "Oak Street Market complete. South route finished.
         Next route: North route. Ready to start?"
```

**If Machines Were Skipped in Route:**
```
System: "South route has 3 skipped machines:
         Machine 55 at Salem Health Hospital,
         Machine 61 at Salem Health Hospital,
         Machine 12 at Oak Street Market.
         Would you like to complete these before moving to next route?"
```

**Requirements:**
- Announce route completion
- Summarize skipped machines across all locations in route
- Allow user to choose: complete skipped machines or proceed to next route
- Track route as "complete with skipped machines" if user chooses to proceed

#### 2.6 Session Completion

**After Last Route Finished:**

**System Behavior:**
```
System: "Central route complete. All routes finished for December 21st, 2025.
         Session complete."
```

**Requirements:**
- Announce session completion
- User closes app (no further interaction required)
- Clear session state from cloud storage
- If skipped machines exist, system does NOT prompt again (user chose to skip)

---

### 3. MACHINE SKIPPING FUNCTIONALITY

#### 3.1 Skip Before Machine Starts

**Scenario:** User wants to skip upcoming machine before it begins

**System Prompt:**
```
System: "Machine 27 complete. Ready for Machine 55, SH-A7 Dual Zone?"
```

**User Input Examples:**
- "Skip that one"
- "Skip Machine 55"
- "Skip it for now"
- "Go to the next machine"

**System Response:**
```
System: "Machine 55 skipped. Moving to Machine 56, SH-M REHAB. Ready to start?"
```

**Requirements:**
- Mark Machine 55 as "skipped" in session state
- Proceed immediately to next machine in sequence
- Do NOT read any items from skipped machine
- Track skipped machine for end-of-location reminder

#### 3.2 Skip During Machine (Mid-Fill)

**Scenario:** User is partway through machine and needs to abandon it

**System State:** Currently reading items for Machine 55

**System Prompt:**
```
System: "Next item: Red Bull Sugar Free Can 8.4 ounce, quantity 5"
```

**User Input Examples:**
- "Skip this machine"
- "Go to next machine"
- "Skip the rest"
- "Move to the next one"

**System Response:**
```
System: "Machine 55 incomplete - skipped. Moving to Machine 56, SH-M REHAB.
         Ready to start?"
```

**Requirements:**
- Mark Machine 55 as "skipped" (not "complete")
- Track which item was last announced (for potential return)
- Discard any partial progress on skipped machine
- Proceed to next machine only after user confirms ready

#### 3.3 Return to Skipped Machine

**Scenario:** User decides to complete previously skipped machine

**Trigger:** End of location prompt

**System Prompt:**
```
System: "Machine 70 complete. You have 1 skipped machine at Salem Health Hospital:
         Machine 55, SH-A7 Dual Zone. Would you like to stock it now or move to next location?"
```

**User Input:** "Stock it now" / "Do it now" / "Yes"

**System Response:**
```
System: "Machine 55, SH-A7 Dual Zone. Starting from bottom.
         First item: [Product Name], quantity [Number]"
```

**Requirements:**
- Return to skipped machine starts from BEGINNING (bottom of slot list)
- If machine was partially filled before skip, restart from first item
- Reason: User may have removed items from bin or lost track
- After completing previously skipped machine, check for other skipped machines
- If multiple skipped machines, prompt after each one

#### 3.4 Permanently Skip Machine

**Scenario:** User doesn't want to complete skipped machine

**System Prompt:**
```
System: "Machine 55 skipped. Would you like to stock it now or move to next location?"
```

**User Input:** "Skip it" / "Move on" / "Next location"

**System Response:**
```
System: "Machine 55 remains skipped. Moving to Oak Street Market.
         Machine 12. Starting from bottom. First item: [Product]"
```

**Requirements:**
- Machine 55 stays marked as "skipped" permanently for this session
- Include in end-of-route summary of skipped machines
- User can choose to complete at end of route if prompted again

#### 3.5 Skip Multiple Machines

**Scenario:** User wants to skip several machines in succession

**System Behavior:** Each skip is handled individually

```
System: "Ready for Machine 55?"
User: "Skip it"
System: "Machine 55 skipped. Ready for Machine 56?"
User: "Skip that too"
System: "Machine 56 skipped. Ready for Machine 61?"
User: "Skip it"
System: "Machine 61 skipped. Ready for Machine 60?"
User: "Yes, start that one"
System: "Machine 60, SH-A4 Dual Zone. Starting from bottom. First item: [Product]"
```

**Requirements:**
- Handle consecutive skips without confusion
- Track each skipped machine individually
- Continue prompting for each subsequent machine until user confirms start

---

### 4. PAUSE & RESUME CONTROLS

#### 4.1 Short Pause (Under 2 Minutes)

**User Input Examples:**
- "Wait"
- "Hold on"
- "Pause"
- "Stop"

**System Response:**
```
[System stops speaking immediately]
[Microphone stays live, listening for resume command]
```

**Resume User Input:**
- "Continue"
- "Next"
- "Ready"
- "Go"

**System Response:**
```
System: "Continuing. Next item: [Product Name], quantity [Number]"
```

**Requirements:**
- Pause instantly on trigger word
- Maintain exact state (current item, position)
- Do NOT announce pause confirmation (just go silent)
- Resume without repeating current item (continue to next)

#### 4.2 Long Pause (Over 2 Minutes)

**Scenario:** User pauses, 2+ minutes pass with no speech

**System Behavior:**
```
[After 2 minutes of silence]
[System enters sleep mode]
[Microphone stays live but requires wake word]
```

**Resume Requires Wake Word:**

**User Input:** "Hey Stocker, continue"

**System Response:**
```
System: "Continuing. Next item: [Product Name], quantity [Number]"
```

**Requirements:**
- Track time since last speech activity
- After 120 seconds, enable wake word requirement
- Wake word: "Hey Stocker"
- After wake word detected, resume normal operation
- Do NOT announce wake word activation (just continue)

---

### 5. CONVERSATIONAL QUERIES & CLARIFICATION

#### 5.1 Quantity Recall

**User Input Examples:**
- "How many Reese's Cups was that?"
- "Wait, how many Cokes?"
- "Repeat that quantity"

**System Response:**
```
System: "7 Reese's Peanut Butter Cups"
[Waits for user to acknowledge]
```

**User Follow-Up:** "Okay" / "Got it" / "Thanks"

**System Response:**
```
System: "Ready to continue?"
```

**User:** "Yes"

**System Response:**
```
System: "Next item: [Product Name], quantity [Number]"
```

**Requirements:**
- Identify product name from query (semantic understanding)
- Look up quantity from current or recently completed items
- Provide just the quantity (don't repeat entire item announcement)
- Wait for user acknowledgment before continuing
- Maintain position in workflow

#### 5.2 Self-Correction Flow

**Scenario:** User realizes they grabbed wrong quantity

**System State:** Just announced M&M Peanut, waiting for next item

**User Input:** "Wait, I only grabbed 5 Reese's Cups. How many was I supposed to grab?"

**System Response:**
```
System: "7 Reese's Peanut Butter Cups"
```

**User:** "Okay, fixing that now" [adds 2 more to bin]

**User:** "Okay, done"

**System Response:**
```
System: "Confirmed, 7 Reese's Peanut Butter Cups. Next item: M&M Peanut, quantity 4"
```

**Requirements:**
- Pause current workflow when correction query detected
- Provide requested information
- Wait for user to indicate correction complete
- Confirm corrected item before proceeding to next item
- Then continue with previously announced item

#### 5.3 Status Check

**User Input Examples:**
- "Where are we?"
- "What's my status?"
- "What machine am I on?"

**System Response:**
```
System: "Machine 27, SH-B5 Dual at Salem Health Hospital.
         Completed 15 items.
         Current item: Reese's Peanut Butter Cups, quantity 7.
         Ready to continue?"
```

**Requirements:**
- Provide current route name
- Provide current location name
- Provide current machine name and designation
- Provide count of completed items in current machine
- Provide current pending item
- Wait for user to confirm ready before continuing

#### 5.4 Product Total Query

**User Input Examples:**
- "How many Cokes total?"
- "What's the Coke count?"
- "How many Cokes for this machine?"

**System Response:**
```
System: "Coke Bottle 20 ounce - 10 total for Machine 27"
```

**Requirements:**
- Identify product from query
- Provide aggregated total for current machine
- Include machine number in response for clarity
- If product hasn't been announced yet: "Coke Bottle 20 ounce will be coming up later in this machine"

---

### 6. ROUTE REORDERING

#### 6.1 Mid-Session Reordering

**Scenario:** User wants to change route sequence during stocking

**User Input Examples:**
- "Hey Stocker, change the route order"
- "Reorder the routes"
- "Switch the routes around"

**System Response:**
```
System: "Current queue: North, East, Central. West on hold. What change would you like?"
```

**User Input Examples:**
- "Move Central ahead of East"
- "Do Central next"
- "Central before North"

**System Response:**
```
System: "Updated. After finishing current location, I'll do Central, then North, then East.
         West still on hold. Continuing with current machine?"
```

**User:** "Yes"

**System Response:**
```
System: "Next item: [Product Name], quantity [Number]"
```

**Requirements:**
- Semantic understanding of reorder commands (no rigid syntax)
- Announce current queue state before accepting changes
- Update queue based on user's instructions
- Confirm new sequence
- Do NOT interrupt current item/machine/location
- Apply new sequence when current location completes

#### 6.2 Add Held Route Back to Queue

**Scenario:** User wants to add previously skipped route back

**User Input:** "Hey Stocker, add West route back to the queue"

**System Response:**
```
System: "Where should I add West route? After Central, or somewhere else?"
```

**User:** "After Central"

**System Response:**
```
System: "West route added after Central. Current queue: North, East, Central, West.
         Continuing with current machine?"
```

**Requirements:**
- Identify which held route to add
- Ask for placement in queue
- Update queue state
- Confirm updated sequence

---

### 7. PDF STRUCTURE & PARSING

#### 7.1 PDF Source & Storage

**Location:** iCloud Drive - specific monitored folder
**Platform:** iOS native Files app integration
**File Format:** PDF generated by Parlevel VMS

**Filename Convention:**
```
[RouteName]_MMDDYYYY.pdf

Examples:
- South_12212025.pdf
- North_12212025.pdf
- East_12212025.pdf
```

**Requirements:**
- App monitors designated iCloud folder continuously
- Auto-load new PDFs when detected
- If PDF added mid-session, prompt user: "New route detected: [Route Name]. Add to queue?"

#### 7.2 PDF Structure (Parlevel VMS)

**Header Format:**
```
Prekitting Detail | [Route Name] | [Delivery Date]
```

**Location Section Format:**
```
[Region] | [Location Name] | [Machine Designation] | [Additional Info] | ID: [ID]

Example:
South | Salem Health Hospital | SH - B5 Dual (27) | Not Specified | ID: AV790243
```

**Product Table Columns:**
- Slot: Slot number (e.g., "010", "012", "014")
- Cst ID: Internal ID
- Product: Full product name
- Product To Add: Quantity needed
- Inventory / Parlevel: Current stock / target (NOT read aloud)
- Price: Price (NOT read aloud)

**Requirements:**
- Extract route name from PDF header
- Identify location boundaries (each location has header row)
- Extract machine designation from location header
- Parse product table for each machine
- Read slots in REVERSE order (bottom to top)

#### 7.3 Product Name Extraction

**Raw PDF Text:**
```
"Fritolay Smartfood Popcorn - White Cheddar Cheese (36X45G)"
```

**Spoken Version:**
```
"Fritolay Smartfood Popcorn White Cheddar Cheese"
```

**Processing Rules:**
- Remove internal product codes in parentheses: `(36X45G)`
- Keep all descriptive text
- Keep size indicators: "1.74 oz", "20 oz", "11 oz"
- Keep packaging indicators: "Bottle", "Can"
- Remove redundant dashes if present
- Convert "oz" to "ounce" for clarity

**Examples:**
| PDF Text | Spoken Version |
|----------|----------------|
| Coke Bottle 20 oz - Bottle | Coke Bottle 20 ounce Bottle |
| M&M's Chocolate 1.74 oz | M&M's Chocolate 1.74 ounce |
| Premier Protein Shake Chocolate 11 oz | Premier Protein Shake Chocolate 11 ounce |

#### 7.4 Product Aggregation Logic

**Scenario:** Same product in multiple slots in same machine

**PDF Data:**
- Slot 050: Coke Bottle 20 oz - Bottle, Qty: 4
- Slot 051: Coke Bottle 20 oz - Bottle, Qty: 6

**System Behavior:**
```
System: "Coke Bottle 20 ounce Bottle, total quantity 10"
```

**Aggregation Rules:**
- Compare normalized product names (after processing)
- If identical product name in same machine, sum quantities
- Present as single item with "total quantity X"
- Do NOT read each slot separately
- Slots will be adjacent in most cases (but not guaranteed)

**No Aggregation Across:**
- Different machines (even if same location)
- Different locations
- Different routes

#### 7.5 Reading Order (Bottom-Up)

**Reason:** User stocks machines from top down, which corresponds to bottom-up slot reading

**PDF Slot Order:**
```
Slot 010: Doritos Cool Ranch SS - qty 2
Slot 012: Sun Chips Garden Salsa - qty 5
Slot 014: Miss Vickie's Spicy Dill - qty 5
...
Slot 057: Coke Bottle 20 oz - qty 2
Slot 058: Starbucks Mocha Frappuccino - qty 3
Slot 059: Aquafina Water - qty 4
```

**System Reading Order:**
```
1st: "Aquafina Water Bottle 20 ounce, quantity 4" (Slot 059)
2nd: "Starbucks Mocha Frappuccino Bottle 9.5 ounce, quantity 3" (Slot 058)
3rd: "Coke Bottle 20 ounce Bottle, quantity 2" (Slot 057)
...
Last: "Doritos Cool Ranch, quantity 2" (Slot 010)
```

**Requirements:**
- Reverse slot order before reading
- Do NOT announce slot numbers
- Do NOT mention "bottom-up" order during items (only at machine start)

---

### 8. ERROR HANDLING & EDGE CASES

#### 8.1 Corrupted or Unreadable PDF

**Detection:** PDF parsing fails

**System Response:**
```
System: "Unable to read [filename]. Please check the file and re-upload."
```

**Requirements:**
- Do NOT attempt partial parse of corrupted PDF
- Remove corrupted PDF from queue
- Continue with remaining routes if available
- If corrupted PDF is only route, notify user and wait

#### 8.2 Missing Data in PDF

**Scenarios:**
- Blank quantity field
- Missing product name
- Missing machine designation

**System Response:**
```
System: "Missing data in South route, Salem Health Hospital, Machine 27.
         Please review PDF and re-upload."
```

**Requirements:**
- Identify which route/location/machine has issue
- Do NOT skip over missing data (could cause errors)
- Pause route and notify user
- Remove problematic route from queue until re-uploaded

#### 8.3 Incorrect PDF Upload (Wrong Date)

**Scenario:** User uploads PDF for wrong delivery date

**System Behavior:**
- Load it anyway (no date validation)
- User may intentionally load different date

**Requirements:**
- No automatic rejection based on date
- Date filter only applies at session start
- If user manually adds PDF mid-session, load regardless of date

#### 8.4 Network Connection Loss

**WiFi & Cellular Handling:**
- WiFi: Primary connection
- Cellular: Automatic fallback

**If Both Fail:**
```
System: "Network connection lost. Attempting to reconnect..."
[System waits for reconnection]
[If reconnected within 30 seconds]
System: "Connection restored. Continuing. Next item: [Product]"
```

**If Extended Outage:**
```
System: "Still unable to connect. Please check network and I'll retry automatically."
[System continues retry attempts every 15 seconds]
```

**Requirements:**
- NO offline mode (voice processing requires cloud AI)
- Preserve state during outage
- Auto-resume when connection restored
- No data loss during outage

#### 8.5 Phone Battery Dies

**State Preservation:**
- Every item confirmation triggers cloud save (Airtable)
- Save includes: route, location, machine, last completed item

**Recovery Flow:**
```
User: [Restarts phone, opens Stocker]
System: "Welcome back. You were stocking Machine 27, SH-B5 Dual at Salem Health Hospital.
         Last completed: Snickers, quantity 7. Ready to continue with next item?"
```

**User Options:**
- "Yes" → Continue from next item
- "Restart this machine" → Start Machine 27 from beginning
- "Start a different machine" → Choose different machine/location

**Requirements:**
- Save state after every confirmation (not just machine completion)
- On restart, load most recent saved state
- Offer option to restart current machine (in case bin was lost/confused)

#### 8.6 Misheard Speech (Low Confidence)

**Detection:** STT or semantic AI confidence <80%

**System Response:**
```
System: "I didn't catch that. Could you repeat?"
```

**After 3 Failed Attempts:**
```
System: "Having trouble hearing you. Would you like to pause?"
```

**User:** "Yes" → System enters pause mode

**Requirements:**
- Track consecutive misunderstandings
- After 3 failures on same command, offer pause
- Reset failure counter after successful understanding
- In very noisy conditions, suggest user move to quieter area

---

### 9. STATE MANAGEMENT & PERSISTENCE

#### 9.1 Cloud Storage (Airtable)

**Data Structure:**

**Session State Table:**
- Session ID (unique)
- User ID
- Delivery Date
- Session Start Time
- Last Update Time
- Status (active, paused, complete)

**Route Progress Table:**
- Session ID (foreign key)
- Route Name
- Route Order (sequence number)
- Status (pending, active, complete, on-hold)

**Location Progress Table:**
- Session ID
- Route Name
- Location Name
- Location Order
- Status (pending, active, complete)

**Machine Progress Table:**
- Session ID
- Route Name
- Location Name
- Machine Name/Designation
- Machine Order
- Status (pending, active, complete, skipped)
- Items Completed Count
- Last Item Completed (product name, quantity)

**Update Frequency:**
- After every item confirmation ("next" command)
- After machine status change (complete, skipped)
- After route reorder
- After pause/resume

**Data Retention:**
- Keep current session only
- Clear all data at end of day (session completion)
- Optional: Save session log if user requests

#### 9.2 Recovery Scenarios

**Scenario 1: Phone Dies Mid-Item**

**State Saved:** Last confirmed item was "Snickers, quantity 7"

**Recovery:**
```
System: "Welcome back. You were stocking Machine 27, SH-B5 Dual at Salem Health Hospital.
         Last completed: Snickers, quantity 7. Ready to continue with next item?"
User: "Yes"
System: "Next item: [next product after Snickers]"
```

**Scenario 2: App Crashes Mid-Machine**

**State Saved:** Machine 27, 15 of 59 items completed

**Recovery:**
```
System: "Welcome back. You were stocking Machine 27, SH-B5 Dual.
         Completed 15 items. Last item: Welch's Fruit Snacks, quantity 6.
         Continue from next item or restart this machine?"
User: "Continue" → Resume from item 16
User: "Restart" → Start Machine 27 from beginning
```

**Scenario 3: Multi-Hour Session Interruption**

**State Saved:** Completed South and North routes, currently on East route

**Recovery:**
```
System: "Welcome back. You completed South and North routes.
         You were stocking East route at Willamette Valley Medical, Machine 8.
         Last completed: M&M Peanut, quantity 4.
         Ready to continue?"
```

---

### 10. VOICE INTERFACE SPECIFICATIONS

#### 10.1 Speech-to-Text (STT)

**Provider Options:**
- iOS native Speech framework (preferred for latency)
- Deepgram (cloud fallback)
- AssemblyAI (cloud fallback)

**Configuration:**
- Streaming mode (real-time transcription)
- US English language model
- Optimized for single speaker
- Noise reduction enabled

**Performance Requirements:**
- Latency: <500ms from speech end to transcription
- Accuracy: 99% for common product names and commands
- Continuous listening (no push-to-talk)

#### 10.2 Semantic Understanding (AI)

**Provider:** Anthropic Claude (Haiku 4.5)

**Use Cases:**
- Parse user confirmation commands ("next", "ready", "got it")
- Interpret pause/resume commands
- Understand route reordering instructions
- Handle clarification queries
- Detect skip machine requests

**Configuration:**
- Streaming response (not required, but reduces latency)
- Temperature: 0.3 (deterministic, not creative)
- Max tokens: 200 (short responses only)

**Latency Target:** <1000ms total processing time

**Fallback:** If AI unavailable, use keyword matching for common commands

#### 10.3 Text-to-Speech (TTS)

**Provider Options:**
- iOS native AVSpeechSynthesizer (preferred for latency)
- ElevenLabs (cloud, higher quality)
- Play.ht (cloud fallback)

**Voice Characteristics:**
- Gender: User preference (default: neutral/female)
- Speaking rate: 0.9x (slightly slower than normal for clarity)
- Pitch: Default
- Emphasis: Enabled for quantities

**Performance Requirements:**
- Latency: <500ms from text input to audio start
- Quality: Natural, conversational tone
- Clarity: Product names must be clearly enunciated

#### 10.4 Audio Hardware

**Microphone Input:**
- Bluetooth headset (primary)
- iPhone built-in mic (backup)
- Maximum distance: 10 feet (speaker mode)

**Audio Output:**
- Bluetooth headset (primary)
- iPhone speaker (backup)

**Requirements:**
- Automatic device switching (headset to speaker)
- Echo cancellation enabled
- Background noise suppression

---

### 11. WAKE WORD SYSTEM

#### 11.1 Wake Word Configuration

**Wake Phrase:** "Hey Stocker"

**Activation Conditions:**
- After 2 minutes of continuous silence
- System enters sleep mode but mic stays live
- Requires wake phrase to re-engage

**Detection Method:**
- On-device wake word detection (iOS/Android native)
- OR cloud-based STT continuous listening
- Optimized for low power consumption

**Response:**
```
User: "Hey Stocker, continue"
System: "Continuing. Next item: [Product Name], quantity [Number]"
```

**Requirements:**
- No confirmation announcement (don't say "I'm awake")
- Just continue with workflow immediately
- Reset sleep timer after wake word detected

#### 11.2 False Positive Handling

**Scenario:** Background conversation includes "stocker" or similar word

**System Behavior:**
- Activate and wait for command
- If no command within 10 seconds: "Did you need something?"
- If still no response within 10 more seconds, return to sleep mode

**Prevention:**
- Require full phrase "Hey Stocker" (not just "Stocker")
- Confidence threshold: 90% match required

---

### 12. MOBILE UI SPECIFICATIONS

#### 12.1 Screen Layout (Voice-First Design)

**Primary Display (Always Visible):**
```
┌─────────────────────────────────┐
│  STOCKER                        │
│                                 │
│  Route: South (2 of 5)          │
│  Location: Salem Health Hospital│
│  Machine: 27, SH-B5 Dual        │
│                                 │
│  ┌──────────────────────────┐  │
│  │  Aquafina Water Bottle   │  │
│  │  20 oz - Qty 4           │  │
│  └──────────────────────────┘  │
│                                 │
│  Progress: Route 2/5 | Loc 1/2  │
│            Machine 3/7 | Item 42/59│
│                                 │
│  ┌─────────────────────┐        │
│  │   [listening...]    │ 🎤     │
│  └─────────────────────┘        │
│                                 │
│  ┌─────────────────────┐        │
│  │   PAUSE / RESUME    │        │
│  └─────────────────────┘        │
└─────────────────────────────────┘
```

**Requirements:**
- Large, readable text (user rarely looks at screen)
- Current context always visible (route, location, machine)
- Current item displayed (in case user glances)
- Progress indicators for orientation
- Listening indicator (visual feedback)
- Single large pause button (emergency use only)

#### 12.2 Interaction Model

**Voice-Only:**
- User does NOT tap screen during normal operation
- Screen is status display only
- Exception: Emergency pause button if voice fails

**No Touch Controls For:**
- "Next" item
- "Pause" / "Resume"
- Route reordering
- Machine skipping
- All handled by voice

**Touch Controls (Emergency Only):**
- Pause button (if voice pause fails)
- Resume button (if voice resume fails)
- Force quit (if system stuck)

---

### 13. PERFORMANCE REQUIREMENTS

#### 13.1 Latency Budget (Hard Requirement)

**Total End-to-End: <2000ms**

**Breakdown:**
- User stops speaking → STT completes: <500ms
- STT text → Semantic AI response: <1000ms
- AI response → TTS starts: <100ms
- TTS generation → Audio playback: <400ms
- **Total: <2000ms**

**Acceptable Variance:**
- 90% of responses: <2000ms
- 95% of responses: <2500ms
- 99% of responses: <3000ms
- Above 3 seconds is deal-breaker

**Simple Confirmations Optimization:**
- For "next", "ready", "got it" (high-frequency commands)
- Use keyword detection bypass (skip AI semantic layer)
- Target latency: <1000ms for these

#### 13.2 Accuracy Requirements

**Speech Recognition:**
- 99% accuracy on common commands (next, pause, ready)
- 95% accuracy on product name queries (more complex)
- 90% accuracy on route reordering (very complex)

**Semantic Understanding:**
- 99% correct action on simple confirmations
- 95% correct interpretation of clarification queries
- If confidence <80%, ask for clarification (don't guess)

#### 13.3 Reliability Requirements

**Uptime:**
- 99.9% during stocking hours (4AM-10AM Pacific)
- Graceful degradation if cloud services unavailable
- Local fallback for critical functions (keyword detection)

**State Persistence:**
- 100% save rate after item confirmations
- Zero data loss during crashes/interruptions
- Recovery possible from any failure point

**Audio Quality:**
- Clear, intelligible TTS in warehouse environment
- Background noise suppression functional
- Bluetooth connection stable for 6+ hour sessions

---

### 14. TECHNICAL ARCHITECTURE

#### 14.1 Platform & Device

**Primary Platform:** iOS (iPhone)
**Minimum iOS Version:** iOS 16.0
**Tested Devices:** iPhone 12 and newer
**Screen Sizes:** All iPhone sizes supported

#### 14.2 External Integrations

**PDF Storage:**
- iCloud Drive (iOS Files app integration)
- Monitored folder path: configurable by user
- Automatic sync when new files added

**Voice Services:**
- STT: iOS Speech framework (primary) + cloud fallback
- AI: Anthropic Claude Haiku 4.5 via API
- TTS: iOS AVSpeechSynthesizer (primary) + cloud fallback

**State Persistence:**
- Airtable (cloud database)
- Real-time updates via REST API
- Fallback: Local SQLite cache

**Network:**
- WiFi: Primary
- Cellular: Automatic fallback
- Minimum bandwidth: 100kbps (voice data is small)

#### 14.3 Data Security

**Sensitive Data:**
- Route information (business confidential)
- Product quantities (business confidential)
- Location names (business confidential)

**Security Measures:**
- All API calls over HTTPS
- Airtable access via API key (stored in iOS Keychain)
- No local storage of completed sessions (cleared daily)
- PDF data never sent to third parties (parsed locally)
- Voice transcriptions not retained after processing

#### 14.4 Offline Capabilities

**Not Supported:** True offline mode requires cloud AI

**Graceful Degradation:**
- If network lost mid-item, preserve state locally
- Show "Connection Lost" indicator
- Auto-retry connection every 15 seconds
- When reconnected, sync state to Airtable and continue

**Emergency Fallback:**
- If extended outage (>5 minutes), user can:
  - View current position on screen
  - Manually track progress on paper
  - Resume when connection restored

---

### 15. TESTING & VALIDATION

#### 15.1 Beta Testing Phases

**Phase 1: Single Route Validation (Day 1-3)**
- Goal: Validate core voice loop works correctly
- Test: One route, one location, one machine
- Success criteria:
  - Voice recognition 99%+ accurate
  - Latency <2 seconds per response
  - No missed items
  - Smooth pause/resume

**Phase 2: Multi-Location & Skip (Day 4-7)**
- Goal: Validate location transitions and machine skipping
- Test: One route, multiple locations, practice skipping machines
- Success criteria:
  - Correct location announcements
  - Skip functionality works as expected
  - Return to skipped machines works
  - No confusion between locations

**Phase 3: Multiple Routes & Reordering (Day 8-14)**
- Goal: Validate queue management
- Test: 3-5 routes, practice reordering mid-session
- Success criteria:
  - Route reordering works conversationally
  - Queue state maintained correctly
  - No routes lost or duplicated

**Phase 4: Full Day Simulation (Day 15-21)**
- Goal: Validate production readiness
- Test: Full typical day (6+ hours, 5-10 routes)
- Success criteria:
  - Complete session without manual intervention
  - State recovery works (test phone restart)
  - No fatigue from voice interaction
  - Faster than current process

#### 15.2 Success Metrics

**Primary Metric: Time Saved**
- Current process: ~3 hours for typical day
- Target with Stocker: <2 hours for same day
- Measurement: Total time from first route to last bin filled

**Secondary Metrics:**
- Error rate: <1% items missed or wrong quantity
- Interruption handling: 100% recovery from crashes/restarts
- User satisfaction: "Would not go back to old method"

**Deal-Breakers (Must Fix):**
- Latency >3 seconds consistently
- Speech recognition <95% accuracy
- Frequent crashes or lost state
- Voice quality too robotic/unclear

---

### 16. FUTURE ENHANCEMENTS (Out of Scope v1.0)

**Not Included in Initial Release:**

1. **Multi-User Support**
   - Currently single-user (sole operator)
   - Future: Multiple warehouse workers sharing routes

2. **Parlevel VMS Direct Integration**
   - Currently PDF-based (manual export)
   - Future: API integration to pull routes automatically

3. **Product Substitution Tracking**
   - Currently user manages separately
   - Future: Voice log of substitutions for review

4. **Route Optimization Suggestions**
   - Currently user defines sequence
   - Future: AI suggests optimal stocking order based on product locations

5. **Inventory Analytics**
   - Currently no reporting
   - Future: Track stocking patterns, identify frequently out-of-stock items

6. **Voice Customization**
   - Currently default voice settings
   - Future: Adjustable speed, pitch, gender, accent

7. **Offline Mode**
   - Currently requires internet
   - Future: Local AI model for basic functionality

8. **Multi-Language Support**
   - Currently English only
   - Future: Spanish, other languages

---

## APPENDIX A: USER JOURNEY MAP

### Typical Day Flow

**3:45 AM - Pre-Work Setup**
- User arrives at warehouse
- Puts in Bluetooth earbuds
- Opens Stocker app on iPhone

**4:00 AM - Session Start**
```
Stocker: "Good morning. What delivery date are you stocking for?"
User: "Today"
Stocker: "Loading routes for December 21st, 2025..."
Stocker: "I've loaded 5 routes: South, North, East, West, Central. What order?"
User: "South, North, East, Central, skip West"
Stocker: "Confirmed. Ready to start South route?"
User: "Yes"
```

**4:02 AM - Begin Stocking**
```
Stocker: "South route. Salem Health Hospital. Machine 27, SH-B5 Dual. Starting from bottom."
Stocker: "First item: Aquafina Water Bottle 20 ounce, quantity 4"
User: [walks to water, grabs 4] "Next"
Stocker: "Starbucks Mocha Frappuccino Bottle 9.5 ounce, quantity 3"
User: [grabs 3] "Next"
```

**4:18 AM - Phone Call Interruption**
```
Stocker: "Coke Bottle 20 ounce, total quantity 10"
User: [phone rings] "Hold on"
Stocker: [pauses]
User: [takes call for 3 minutes]
User: "Hey Stocker, continue"
Stocker: "Continuing. Next item: Diet Coke Bottle 20 ounce, total quantity 10"
```

**5:30 AM - Skip Machine**
```
Stocker: "Machine 27 complete. Ready for Machine 55, SH-A7 Dual Zone?"
User: "Skip that one"
Stocker: "Machine 55 skipped. Ready for Machine 56, SH-M REHAB?"
User: "Yes"
```

**6:45 AM - Mid-Day Route Reorder**
```
User: "Hey Stocker, change the route order"
Stocker: "Current queue: North, East, Central. What change?"
User: "Move Central before East"
Stocker: "Updated. After current location, I'll do North, then Central, then East. Continuing?"
User: "Yes"
```

**8:30 AM - Return to Skipped Machines**
```
Stocker: "Salem Health Hospital complete. You have 1 skipped machine: Machine 55. Stock it now?"
User: "Stock it now"
Stocker: "Machine 55, SH-A7 Dual Zone. Starting from bottom. First item: Smartfood..."
```

**9:45 AM - Session Complete**
```
Stocker: "Central route complete. All routes finished for December 21st, 2025. Session complete."
User: [closes app, loads truck with completed bins]
```

**Total Time:** 5 hours 45 minutes (vs. 7+ hours with old method)
**Result:** All bins filled correctly, zero missed items, hands never left products

---

## APPENDIX B: VOICE COMMAND REFERENCE

### Confirmation Commands (Move to Next Item)
- "Next"
- "Ready"
- "Got it"
- "Done"
- "Okay"
- "Continue"
- "Go"
- "Yes"
- "Yep"
- "Sure"

### Pause Commands
- "Wait"
- "Hold on"
- "Pause"
- "Stop"
- "One second"
- "Hang on"

### Resume Commands
- "Continue"
- "Next"
- "Ready"
- "Go"
- "Let's go"
- "Keep going"

### Skip Machine Commands
- "Skip this machine"
- "Skip it"
- "Go to next machine"
- "Move to next machine"
- "Skip this one"

### Clarification Commands
- "How many [product]?"
- "Repeat that"
- "What was that?"
- "Say that again"
- "How many was that?"

### Status Check Commands
- "Where are we?"
- "What's my status?"
- "What machine am I on?"
- "Current position"

### Route Reorder Commands
- "Change the route order"
- "Reorder routes"
- "Move [route] ahead of [route]"
- "Do [route] next"
- "Switch routes"

---

## APPENDIX C: SAMPLE PDF PARSING

**Input PDF Section:**
```
South | Salem Health Hospital | SH - B5 Dual (27) | Not Specified | ID: AV790243

Slot  Product                                    Product To Add  Inventory/Parlevel  Price
010   Doritos Cool Ranch SS                      2               7 / 9               1.50
012   Sun Chips Garden Salsa 1.5 oz              5               4 / 9               1.75
059   Aquafina Water Bottle 20 oz - Bottle       4               2 / 6               2.00
```

**Parsed Data Structure:**
```json
{
  "route": "South",
  "location": "Salem Health Hospital",
  "machine": "SH - B5 Dual (27)",
  "machine_number": 27,
  "items": [
    {
      "slot": "059",
      "product_raw": "Aquafina Water Bottle 20 oz - Bottle",
      "product_spoken": "Aquafina Water Bottle 20 ounce Bottle",
      "quantity": 4,
      "order": 1
    },
    {
      "slot": "012",
      "product_raw": "Sun Chips Garden Salsa 1.5 oz",
      "product_spoken": "Sun Chips Garden Salsa 1.5 ounce",
      "quantity": 5,
      "order": 2
    },
    {
      "slot": "010",
      "product_raw": "Doritos Cool Ranch SS",
      "product_spoken": "Doritos Cool Ranch",
      "quantity": 2,
      "order": 3
    }
  ]
}
```

**Voice Output (Reading Order):**
```
1st: "Aquafina Water Bottle 20 ounce Bottle, quantity 4"
2nd: "Sun Chips Garden Salsa 1.5 ounce, quantity 5"
3rd: "Doritos Cool Ranch, quantity 2"
```

---

## APPENDIX D: STATE RECOVERY EXAMPLES

### Example 1: Phone Dies During Item

**Saved State:**
```json
{
  "session_id": "20251221_001",
  "delivery_date": "2025-12-21",
  "current_route": "South",
  "current_location": "Salem Health Hospital",
  "current_machine": "SH - B5 Dual (27)",
  "last_completed_item": {
    "product": "Snickers 1.86 oz",
    "quantity": 7,
    "timestamp": "2025-12-21T05:23:14Z"
  },
  "items_completed": 15,
  "total_items": 59
}
```

**Recovery Dialog:**
```
System: "Welcome back. You were stocking Machine 27, SH-B5 Dual at Salem Health Hospital.
         Last completed: Snickers, quantity 7. Ready to continue with next item?"
User: "Yes"
System: "Next item: Welch's Fruit Snacks Mixed Fruit, quantity 6"
```

### Example 2: Network Outage During Machine

**Behavior:**
- State saved locally on device
- "Connection Lost" shown on screen
- User can continue physically stocking (without voice guidance)
- When network restored, state syncs to Airtable
- Voice guidance resumes from last saved position

---

## DOCUMENT VERSION HISTORY

**v1.0 - December 21, 2025**
- Complete discovery-based requirements
- All 35 discovery branches resolved
- Machine skipping functionality integrated
- Ready for implementation handoff to Claude Code

---

**END OF REQUIREMENTS DOCUMENT**
