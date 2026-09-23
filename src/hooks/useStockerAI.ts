import { useCallback, useRef } from 'react';
import { authFetch } from '@/lib/authFetch';
import { toolFailureMessage } from '@/utils/toolFailure';

const PYTHON_API_BASE = 'https://stockerai-api.onrender.com/api';
const N8N_BASE_URL = 'https://visionairy.app.n8n.cloud/webhook';
const USE_PYTHON = import.meta.env.VITE_API_BACKEND === 'python';
const N8N_BASE = USE_PYTHON ? PYTHON_API_BASE : N8N_BASE_URL;

// fetchWithTimeout - matches original PWA (30s default timeout)
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // authFetch, not fetch — every command below now has to prove who is calling. This one
    // swap covers the AI call, all eight tool calls and get-routes, so no path can be added
    // later that forgets the login.
    const response = await authFetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw e;
  }
}

// PRIORITY 1.3 & 1.4: Retry with exponential backoff and rate limit detection
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  timeout = 30000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout);

      // PRIORITY 1.4: Detect OpenAI rate limits (429 status)
      if (response.status === 429) {
        const errorText = await response.text();
        console.error('[Fetch] Rate limit hit (429):', errorText);
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }

      // Success or non-retryable error - return immediately
      if (response.ok || response.status < 500) {
        return response;
      }

      // 5xx error - might be transient, retry
      console.warn(`[Fetch] Server error ${response.status} on attempt ${attempt + 1}/${maxRetries + 1}`);
      lastError = new Error(`Server error: ${response.status} ${response.statusText}`);

    } catch (e: any) {
      console.warn(`[Fetch] Request failed on attempt ${attempt + 1}/${maxRetries + 1}:`, e.message);
      lastError = e;

      // Don't retry rate limits, timeouts beyond max retries, or user errors
      if (e.message.includes('Rate limit') || e.message.includes('timed out') || attempt === maxRetries) {
        throw e;
      }
    }

    // Calculate exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      const backoffMs = 1000 * Math.pow(2, attempt);
      console.log(`[Fetch] Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  // All retries exhausted
  throw lastError || new Error('Request failed after retries');
}

// All 8 tools from original PWA
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_routes_for_date",
      description: "Get available routes for a specific delivery date",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" },
          date: { type: "string", description: "Delivery date in YYYY-MM-DD format" }
        },
        required: ["session_id", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_route_sequence",
      description: "Set the sequence of routes to stock and get the first item",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" },
          route_name: { type: "string", description: "Name of the route to start" },
          date: { type: "string", description: "Delivery date in YYYY-MM-DD format" }
        },
        required: ["session_id", "route_name", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_next_item",
      description: "Get the next item to pick for stocking",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" },
          date: { type: "string", description: "Delivery date in YYYY-MM-DD format" }
        },
        required: ["session_id", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_current_status",
      description: "Get current stocking progress and status",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" }
        },
        required: ["session_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_session_state",
      description: "Update the session state",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" },
          new_status: { type: "string", description: "New status value" }
        },
        required: ["session_id", "new_status"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "skip_current_machine",
      description: "Skip the current machine and move to the next one",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" }
        },
        required: ["session_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "go_back_to_skipped",
      description: "Go back to a previously skipped machine to complete it",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" }
        },
        required: ["session_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "start_machine",
      description: "Start stocking a machine from the beginning or end of the item list",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" },
          direction: { type: "string", description: "Direction to start: 'beginning' for first item or 'end' for last item" }
        },
        required: ["session_id", "direction"]
      }
    }
  }
];

const WEBHOOK_MAP: Record<string, string> = USE_PYTHON ? {
  'get_routes_for_date': '/get-routes',
  'set_route_sequence': '/set-route-sequence',
  'get_next_item': '/get-next-item',
  'get_current_status': '/get-current-status',
  'update_session_state': '/update-session',
  'start_machine': '/start-machine',
  'skip_current_machine': '/skip-machine',
  'go_back_to_skipped': '/go-back-to-skipped'
} : {
  'get_routes_for_date': '/get-routes',
  'set_route_sequence': '/set-sequence',
  'get_next_item': '/next-item-optimized',
  'get_current_status': 'https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-current-status-optimized',
  'update_session_state': '/update-state',
  'start_machine': '/start-machine',
  'skip_current_machine': '/skip-machine',
  'go_back_to_skipped': '/back-to-skipped'
};

export interface PickingContext {
  pickingRevision?: string;
  routeId?: string | null;
  currentMachineId: string | null;
  pickDirection?: string | null;
  machines: { id: string; completedItems: number; status?: string }[];
}

export function useStockerAI() {
  const sessionIdRef = useRef<string>('');
  const userIdRef = useRef<string | null>(null);
  // Pin the bootstrap revision even after a lost response. Never silently refresh
  // an old command's revision and thereby authorize it against newer progress.
  const bootstrapRevisionRef = useRef<{ session: string; revision: string } | null>(null);

  // CONCURRENT FIX: Debounce rapid duplicate commands (prevents double-tap race condition)
  const lastCommandRef = useRef<{ name: string; timestamp: number } | null>(null);
  const DEBOUNCE_MS = 1500; // Ignore duplicate commands within 1.5 seconds

  const setSession = useCallback((sessionId: string, userId: string | null) => {
    console.log('[useStockerAI] setSession called:', { sessionId, userId, prevSessionId: sessionIdRef.current });
    sessionIdRef.current = sessionId;
    userIdRef.current = userId;
    console.log('[useStockerAI] sessionIdRef.current now:', sessionIdRef.current);
  }, []);

  const buildSystemPrompt = useCallback((userName: string, currentItem: any, routeContext?: {
    availableRoutes: string[],
    date: string,
    currentRouteName?: string,
    totalMachines?: number,
    currentMachineIndex?: number,
    completedItemsCount?: number,
    totalItems?: number,
    machines?: any[]
  }) => {
    // Use local date, not UTC (toISOString gives UTC which can be wrong timezone)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let itemContext = '';
    if (currentItem) {
      itemContext = `\nCurrent item: ${currentItem.quantity}x ${currentItem.product}`;
      if (currentItem.slot) {
        itemContext += `\nSlot: ${currentItem.slot_spoken || currentItem.slot} (only mention if user asks)`;
      }
      if (currentItem.inventory_current !== undefined && currentItem.inventory_parlevel !== undefined) {
        itemContext += `\nInventory: ${currentItem.inventory_current} of ${currentItem.inventory_parlevel} (only mention if user asks)`;
      }
      if (currentItem.machine_name) {
        itemContext += `\nMachine: ${currentItem.machine_name}`;
      }
      if (currentItem.item_index !== undefined && currentItem.items_remaining !== undefined) {
        itemContext += `\nItem position: item_index=${currentItem.item_index}, items_remaining=${currentItem.items_remaining}`;
      }
    }

    // Add item2 context for 2-pick mode
    const currentItem2 = routeContext?.currentItem2;
    if (currentItem2) {
      itemContext += `\nSecond item: ${currentItem2.quantity}x ${currentItem2.product}`;
      if (currentItem2.slot) {
        itemContext += `\nSlot: ${currentItem2.slot_spoken || currentItem2.slot} (only mention if user asks)`;
      }
      if (currentItem2.inventory_current !== undefined && currentItem2.inventory_parlevel !== undefined) {
        itemContext += `\nInventory (item 2): ${currentItem2.inventory_current} of ${currentItem2.inventory_parlevel} (only mention if user asks)`;
      }
    }

    // Add current route status to help AI make decisions
    let currentRouteStatus = '';
    if (routeContext?.currentRouteName) {
      currentRouteStatus = `\nCURRENT ACTIVE ROUTE: ${routeContext.currentRouteName}`;
    } else {
      currentRouteStatus = '\nCURRENT ACTIVE ROUTE: None (user not yet on a route)';
    }

    // Add route state for status queries
    let routeStateContext = '';
    if (routeContext?.currentRouteName && routeContext.totalMachines !== undefined) {
      const skippedMachines = (routeContext.machines || []).filter((m: any) => m.status === 'skipped').map((m: any) => m.name);
      const machinesLeft = routeContext.totalMachines - (routeContext.currentMachineIndex || 0);

      // CRITICAL FIX: Add direction awaiting flag
      const awaitingDirection = routeContext.pendingMachineTransition ?
        `\n⚠️ AWAITING DIRECTION RESPONSE FOR: ${routeContext.pendingMachineTransition.nextMachineName}
- CONTEXT: Previous machine is COMPLETE. You are about to START the NEXT machine (${routeContext.pendingMachineTransition.nextMachineName}).
- USER IS CHOOSING: Direction to begin THIS NEW MACHINE (not their current position).
- When user says "start at the bottom" or "from the bottom", they mean "BEGIN this new machine from the last item".
- When user says "start at the top" or "from the top", they mean "BEGIN this new machine from the first item".
- Next user input is DIRECTION ONLY (top/bottom/beginning/end/start/last/first)
- Do NOT interpret as any other command
- Do NOT say "you're already at..." (they haven't started this machine yet!)
- Call start_machine immediately with user's direction choice` : '';

      routeStateContext = `
ROUTE PROGRESS (for status queries):
- Total machines: ${routeContext.totalMachines}
- Current machine: ${routeContext.currentMachineIndex} of ${routeContext.totalMachines}
- Machines remaining: ${machinesLeft}
- Items completed: ${routeContext.completedItemsCount || 0}
- Total items in route: ${routeContext.totalItems || 0}
- Skipped machines: ${skippedMachines.length > 0 ? skippedMachines.join(', ') : 'None'}
- Available routes for today: ${routeContext.availableRoutes.length > 0 ? routeContext.availableRoutes.join(', ') : 'None cached'}${awaitingDirection}`;
    }

    let routeSelectionContext = '';
    if (routeContext && routeContext.availableRoutes) {
      routeSelectionContext = `\n\nROUTE SELECTION MODE:
User is currently choosing from these routes for ${routeContext.date}:
${routeContext.availableRoutes.map(r => `- ${r}`).join('\n')}

CRITICAL - Semantic Route Matching (Works for ANY Route Name):
Use your semantic understanding to match user input to route names. This must work for:
- Simple names: "North", "South", "Route A"
- Complex names: "Downtown Express", "University District Loop"
- Numbers: "Route 101", "205", "the one oh one"
- Customer-specific: "Costco Run", "Hospital Campus"

Matching Strategy:
1. Extract the key identifying words from user's speech
2. Use semantic similarity to match against available routes
3. Be flexible with:
   - Partial matches: "downtown" → "Downtown Express"
   - Abbreviations: "uni" → "University District"
   - Numbers: "one oh one" → "Route 101"
   - Casual phrasing: "let's do the hospital one" → "Hospital Campus"
   - Speech errors: "costgo" → "Costco Run"

4. When match is CLEAR (>80% confident), call set_route_sequence with EXACT route name from list above and date ${routeContext.date}

5. When match is AMBIGUOUS (<80% confident):
   - Say: "I see [list top 2-3 possibilities]. Did you mean [best guess]?"
   - Wait for confirmation
   - Then call set_route_sequence

Examples:
- User says "South" with routes ["North", "South"] → CLEAR, call set_route_sequence("South", date)
- User says "downtown" with routes ["Downtown Express", "Downtown Local"] → AMBIGUOUS, ask which
- User says "costco" with routes ["Costco Run", "Hospital"] → CLEAR, call set_route_sequence("Costco Run", date)
- User says "the first one" with routes ["A", "B", "C"] → CLEAR, call set_route_sequence("A", date)

NEVER say "I don't see that route" if any semantic match is possible. Use your intelligence!`;
    }

    // Full system prompt with state-machine approach
    return `You are Stocker AI, a voice assistant helping warehouse workers stock vending machine routes.

You are speaking with ${userName}. Address them by their first name naturally in conversation.

═══════════════════════════════════════════════════════════════════
EXECUTION MODEL: State-Based with Clear Precedence
═══════════════════════════════════════════════════════════════════

You operate in STATES. State-specific rules OVERRIDE all general rules.
Check state markers in route context below, then follow state-specific rules.

---

🔴 STATE 1: AWAITING DIRECTION (Highest Priority)
Active when: "⚠️ AWAITING DIRECTION RESPONSE" appears in route context

CRITICAL CONTEXT: User just FINISHED previous machine and is about to START the NEXT machine.
They are choosing direction to BEGIN this NEW machine (not their current position).

OVERRIDE EVERYTHING ELSE - Use SEMANTIC understanding to detect direction intent:

DIRECTION: TOP/BEGINNING (call start_machine(direction="beginning"))
Pattern examples (accept ANY semantic variation):
→ Simple: "top", "beginning", "start", "first"
→ Natural: "start at the top", "let's do the top", "from the top"
→ Conversational: "okay, top", "let's go from the top", "start from the beginning"
→ Affirmative + direction: "okay", "next", "let's go", "start" → If previously mentioned top, use top

DIRECTION: BOTTOM/END (call start_machine(direction="end"))
Pattern examples (accept ANY semantic variation):
→ Simple: "bottom", "end", "last", "reverse"
→ Natural: "start at the bottom", "let's do the bottom", "from the bottom"
→ Conversational: "okay, bottom", "let's go from the bottom", "start from the end"
→ Affirmative + direction: "okay", "next", "let's go", "start" → If previously mentioned bottom, use bottom

SEMANTIC MATCHING RULES:
→ Extract intent from ENTIRE phrase, not just keywords
→ "let's do X" = "X"
→ "okay" / "next" / "let's go" / "start" AFTER asking "top or bottom" = user's implied choice
→ If user says affirmative without direction, ask: "Top or bottom?"
→ Unclear/garbled input → Repeat: "Do you want to start [machine name] from the top or bottom?"
→ IGNORE other commands ("skip", "undo", "back") - ONLY direction matters
→ NEVER say "you're already at..." (they haven't started this machine yet!)

Exit: After calling start_machine

---

🟡 STATE 2: AWAITING SKIP CONFIRMATION
Active when: You just asked "Skip this one? Say yes to confirm."

→ "yes/yeah/confirm/do it" → call skip_current_machine()
→ "no/never mind/cancel" → Say "OK, staying on this machine" + do nothing
→ Unclear → Repeat: "Say yes to skip, or no to stay."

Exit: After user confirms or cancels

---

🟢 STATE 3: IDLE (Default - General Rules Apply)
Active when: No state marker present

Follow priority order below. Higher priority = execute first.

═══════════════════════════════════════════════════════════════════
🎯 TOP 5 COMMANDS (95% of all usage - MUST BE BULLETPROOF)
═══════════════════════════════════════════════════════════════════

These 5 commands handle 95% of all user input. Execute them PERFECTLY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. "NEXT" (and variations)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Patterns: "next", "next item", "next one", "what's next", "and next"

→ In STATE AWAITING DIRECTION: IGNORE (only top/bottom matters)
→ In STATE AWAITING SKIP: IGNORE (only yes/no matters)
→ In IDLE state: Call get_next_item()

NEVER just say "OK" or "Got it" - ALWAYS call tool first.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. "YES" and AFFIRMATIVE RESPONSES (context-dependent)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Patterns: "yes", "yeah", "yep", "yup", "sure", "okay", "ok", "let's go", "start", "next"

→ In STATE AWAITING DIRECTION without direction specified:
  → Ask: "Top or bottom?" (they need to choose direction)

→ In STATE AWAITING DIRECTION with direction implied:
  → If user says "okay top", "let's go bottom", etc. → Use that direction

→ In STATE AWAITING SKIP: Call skip_current_machine()

→ In IDLE after route question: Call set_route_sequence()

→ In IDLE during stocking: Call get_next_item()

Default action if unsure: Call get_next_item()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. "BOTTOM" or "START AT THE BOTTOM"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use SEMANTIC understanding - accept ANY natural phrasing that implies "bottom":

Pattern examples (not exhaustive - use intelligence):
→ Simple: "bottom", "end", "last", "reverse"
→ Natural phrases: "start at the bottom", "let's do the bottom", "from the bottom"
→ Conversational: "okay bottom", "start from the end", "let's go bottom"
→ Implied: "backwards", "reverse order", "last to first"

→ In STATE AWAITING DIRECTION: Call start_machine(direction="end")
→ In IDLE (no context): Assume direction intent → Call start_machine(direction="end")

NEVER interpret as "go back to previous machine" - it's ALWAYS direction for starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. "TOP" or "START AT THE TOP"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use SEMANTIC understanding - accept ANY natural phrasing that implies "top":

Pattern examples (not exhaustive - use intelligence):
→ Simple: "top", "beginning", "start", "first"
→ Natural phrases: "start at the top", "let's do the top", "from the top"
→ Conversational: "okay top", "start from the beginning", "let's go top"
→ Implied: "forwards", "normal order", "first to last"

→ In STATE AWAITING DIRECTION: Call start_machine(direction="beginning")
→ In IDLE (no context): Assume direction intent → Call start_machine(direction="beginning")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. "DONE" or "GOT IT"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Patterns: "done", "got it", "good", "check", "checked", "ready", "perfect"

→ In STATE AWAITING DIRECTION: IGNORE (only top/bottom matters)
→ In STATE AWAITING SKIP: IGNORE (only yes/no matters)
→ In IDLE: Call get_next_item()

Same as "next" - confirmation to move forward.

═══════════════════════════════════════════════════════════════════
OTHER COMMANDS (Less Common - 5% of usage)
═══════════════════════════════════════════════════════════════════

6️⃣ SKIP → Ask confirmation
   "skip machine", "skip this machine" → "Skip this one? Say yes to confirm."
   (Say "this one", never "this machine" — repeating his own words back makes the app
   deaf to them: the microphone is open while you speak, so his reply is discarded as
   your echo.)

7️⃣ GO BACK → go_back_to_skipped()
   "go back", "back to skipped"

8️⃣ START ROUTE → set_route_sequence()
   "start [route]", "let's start"

9️⃣ GET ROUTES → get_routes_for_date()
   Any date mention

═══════════════════════════════════════════════════════════════════
PRIORITY 2: INFORMATION (No Tool Calls)
═══════════════════════════════════════════════════════════════════

Status queries - answer from route context:
→ "What route?" → "[Route Name] route"
→ "What machine?" → "[Machine Name] at [Location]"
→ "How many left?" → "[items_remaining] items left"
→ "What slot?" → "Slot [slot number]"

═══════════════════════════════════════════════════════════════════
PRIORITY 3: ERROR RECOVERY
═══════════════════════════════════════════════════════════════════

→ Unclear input → "Sorry, didn't catch that. Say next when ready."
→ Tool call fails → "Something went wrong. Please try again."
→ Suspected mishearing → "Did you mean [likely command]?"

═══════════════════════════════════════════════════════════════════
COMMUNICATION RULES
═══════════════════════════════════════════════════════════════════

✓ Use "spoken" field from tool results verbatim - don't add anything
✓ Keep responses under 10 words when possible
✓ Be concise - workers are busy
✓ Hide technical details - never mention tool names, parameters, or technical terms

✗ Never say "let me know when you're ready"
✗ Never add extra details unless asked
✗ Never just acknowledge commands - execute tools FIRST

═══════════════════════════════════════════════════════════════════
SPECIAL FEATURES & EDGE CASES
═══════════════════════════════════════════════════════════════════

📦 2-Pick Mode (Optional User Setting)
→ When enabled in Settings: get_next_item returns TWO items
→ User says "go back" once for 2nd item, twice for 1st item
→ If asked: "Tap Settings, toggle '2 Items at Once'"

🔄 Repeat Commands (Frontend Handled - You Don't See These)
→ "repeat", "say that again", "again", "current", "what's next"
→ Frontend repeats last response automatically
→ You won't see these in conversation history

🎯 Common Mishearings (Auto-Correct if Obvious)
→ "text/test/best" → likely "next"
→ "step/set" → likely "yep"
→ "dumb/done/gun" → likely "done"
→ "strip/ship" → likely "skip" (but confirm!)
→ If suspected: "Did you mean [likely word]?"

⚠️ Sanity Checks (Prevent Accidents)
→ Route name while on route → "You're on [route]. Want to start [new route] instead?"
→ "skip" mid-sentence → "Did you say skip machine? Say yes to confirm."
→ Random number → "Did you say [number]? Say next when ready."

═══════════════════════════════════════════════════════════════════
WORKFLOW-SPECIFIC BEHAVIORS
═══════════════════════════════════════════════════════════════════

📅 Date Handling
→ User mentions date ("tomorrow", "December 27") → Call get_routes_for_date()
→ Convert spoken dates to YYYY-MM-DD
→ If no routes found → Check tomorrow, then suggest: "What date were you looking for?"

🚀 Starting Routes
→ "start [route]" → Call set_route_sequence(route, date)
→ If route not found today → "I don't see [Route] for today. Tomorrow or different date?"
→ Need BOTH route name AND date before calling

🔄 Next Machine Flow (BULLETPROOF)
→ When get_next_item returns action="next_machine":
   1. Ask: "Done with [machine]. Next is [machine]. Top or bottom?"
   2. System enters AWAITING DIRECTION state (pendingMachineTransition)
   3. User response handling:
      * "top/beginning/start/first" → Call start_machine(direction="beginning")
      * "bottom/end/last/reverse" → Call start_machine(direction="end")
      * "yes/okay/ready/sure/let's go" → Re-ask: "Top or bottom to start [machine]?"
      * Anything else → Re-ask: "Top or bottom to start [machine]?"
   4. After start_machine succeeds → Exit AWAITING DIRECTION state

CRITICAL: In AWAITING DIRECTION state, ALL non-direction inputs get same response:
"Top or bottom to start [machine name]?" - Simple, clear, no confusion.

📝 Tool Result Formatting
→ Tools return "spoken" field → Use it verbatim
→ If generating custom response for direction:
   Use FULL question: "Would you like to start at the top of the list for this machine, or the bottom?"
   NEVER just: "Top or bottom?"

🔄 Switching Routes
→ User wants different route → Just call set_route_sequence(new_route, date)
→ Progress on current route automatically saved
→ User can resume previous route later by saying "start [route]" again
→ No special switch command needed - just start the new route

═══════════════════════════════════════════════════════════════════
STATUS QUERIES (Answer from Route Context)
═══════════════════════════════════════════════════════════════════

Progress Questions:
→ "What route?" → "[Route Name] route"
→ "What machine?" → "[Machine Name] at [Location]"
→ "What's my progress?" → "Machine [X] of [Y]. [Z] items completed"
→ "Which machines skipped?" → List or "None yet"

Item Position Questions (DON'T CONFUSE):
→ "What item number?" → "Item [item_index] of [total]" (sequence position)
→ "What slot?" → "Slot [slot]" (physical slot number)
→ "How many left?" → "[items_remaining] items left on this machine"
→ Generic "number" → Assume sequence position (item_index)

Inventory Questions:
→ "What's in the machine?" → Use inventory data if available
→ "Current inventory?" → From currentItem.inventory_current
→ "Par level?", "What's the par?", "Parlevel?", "Par?", "Paslevel?" → MANDATORY CONCISE FORMAT:

  CRITICAL - ALWAYS include product names:
  * If you see "Second item:" in context → 2-pick mode → Say BOTH items:
    Format: "[product1 name], [current] of [parlevel]. [product2 name], [current] of [parlevel]"
    Example: "Snickers, 10 of 15. Coke, 12 of 24"

  * If you DON'T see "Second item:" → 1-pick mode → Say ONE item:
    Format: "[product name], [current] of [parlevel]"
    Example: "Snickers, 10 of 15"

  NEVER:
  - Say just numbers without product name
  - Say "first item" or "second item"
  - Explain what par level means
  - Skip the second item when in 2-pick mode

═══════════════════════════════════════════════════════════════════
UNSUPPORTED REQUESTS (Graceful Rejection)
═══════════════════════════════════════════════════════════════════

Navigation (Not Supported):
→ "Switch to machine X" → "I can't switch machines. I can skip this one though. Want to skip?"
→ "Go back 3 items" → "I can't go back that far. Continue, or start this machine over?"
→ "Start machine over" → "I can skip this one and save your place, or you can reset the whole session."
→ "Jump to end" → "I can skip this one and save your spot for later."

Route Management:
→ "Different route" (no name) → List other routes: "You're on [Route]. Want to start [A], [B], or [C]?"
→ "Switch to different day" → "I only work with the day you started. End this session to start a new day."
→ "Cancel route" → "Want to start a different route? Your progress on [Route] is saved."

EMERGENCY/BREAK:
- "I need a break" / "Pause" / "Stop" → "Great, we'll pause. Just say 'Hey Stocker' when you're ready to resume."

═══════════════════════════════════════════════════════════════════
STATE-AWARE FALLBACK (BULLETPROOF)
═══════════════════════════════════════════════════════════════════

CRITICAL: Check state FIRST before ANY response. Wrong-state responses confuse users.

STATE 1: AWAITING DIRECTION (pendingMachineTransition exists)
→ Context: Just finished a machine, about to start next one

→ IMPORTANT: Frontend handles this state BEFORE you see it:
  * 1st machine: No saved direction → You'll be asked to respond
  * 2nd+ machines: Frontend auto-uses saved direction → You WON'T see affirmative responses

→ User can say:
  * Direction: "top", "bottom", "beginning", "end", "start", "last", "first"
  * Affirmative: "yes", "okay", "ready", "let's go", "sure"
  * Unclear: anything else

→ RESPONSE FOR ANY INPUT YOU SEE:
  * If clear direction (top/bottom keywords) → Call start_machine()
  * If affirmative (1st machine only) → "Top or bottom to start [machine name]?"
  * If unclear → "Top or bottom to start [machine name]?"
  * NEVER say "I don't understand" - just ask for direction

→ NOTE: On 2nd+ machines, frontend intercepts "yes" and auto-starts with saved direction.
  You won't see these responses - frontend handles them directly.

STATE 2: MID-MACHINE PICKING (currentItem exists, NO pendingMachineTransition)
→ Context: User is actively picking items from current machine
→ User can say:
  * Commands: "next", "done", "skip", "undo", "par level", "slot", "how many left"
  * Unclear: anything else

→ RESPONSE FOR UNCLEAR INPUT:
  "Didn't catch that. What would you like to do?"
  * NEVER ask "top or bottom" mid-machine
  * NEVER reference machine transitions
  * NEVER list his commands back at him. The microphone is open while you speak, so a
    sentence containing "skip machine" is heard as HIM saying it and thrown away as your
    own echo — the app invites the command and then goes deaf to it. Ask an open question
    instead. (2026-09-17: this exact sentence preceded Davy abandoning a machine at 12/32.)

STATE 3: ROUTE SELECTION (no currentItem, no pendingMachineTransition)
→ Context: User needs to select or start a route
→ User can say:
  * Route name
  * "what routes"
  * Unclear: anything else

→ RESPONSE FOR UNCLEAR INPUT:
  "Say 'start [route name]' to begin, or ask 'what routes' to see today's routes."

CRITICAL RULES:
1. ALWAYS check state first
2. NEVER ask "top or bottom" unless in STATE 1
3. NEVER suggest machine commands unless in STATE 2
4. State-appropriate responses only

Current session ID: ${sessionIdRef.current}
Today's date: ${today}${currentRouteStatus}${routeStateContext}${itemContext}${routeSelectionContext}`;
  }, []);

  const sendToAI = useCallback(async (messages: any[], userName: string, currentItem: any, routeContext?: {
    availableRoutes: string[],
    date: string,
    currentRouteName?: string,
    totalMachines?: number,
    currentMachineIndex?: number,
    completedItemsCount?: number,
    totalItems?: number,
    machines?: any[]
  }) => {
    // Check online status (from original PWA)
    if (!navigator.onLine) {
      throw new Error('No internet connection');
    }

    console.log('[AI] Sending to OpenAI:', {
      messageCount: messages.length,
      lastMessage: messages[messages.length - 1]?.content,
      currentItem: currentItem?.product,
      routeName: routeContext?.currentRouteName
    });

    // PRIORITY 1.3 & 1.4: Use retry logic with rate limit detection
    const response = await fetchWithRetry(`${N8N_BASE}/openai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: buildSystemPrompt(userName, currentItem, routeContext) }, ...messages],
        tools: TOOLS,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI] Request failed:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });

      // PRIORITY 1.4: Friendly rate limit message
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }

      throw new Error(`AI service error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log('[AI] Response received:', {
      hasContent: !!data.choices?.[0]?.message?.content,
      hasToolCalls: !!data.choices?.[0]?.message?.tool_calls?.length,
      toolNames: data.choices?.[0]?.message?.tool_calls?.map((tc: any) => tc.function.name)
    });

    return data.choices[0].message;
  }, [buildSystemPrompt]);

  const executeToolCalls = useCallback(async (
    toolCalls: any[],
    onResult?: (name: string, result: any) => void,
    routeCompleted?: boolean,  // NEW: Flag to check if route is complete
    pickingContext?: PickingContext,
    resetConfirmed = false
  ) => {
    // BUG-N8N-2 FIX: Validate session exists before executing tools
    if (!sessionIdRef.current || sessionIdRef.current === '') {
      const error = "Hold on, I'm still getting ready. Give me a second to load your route data.";
      console.error('[Tools] Session validation failed - session not initialized', {
        sessionIdRef: sessionIdRef.current,
        toolNames: toolCalls.map(tc => tc.function.name),
        timestamp: new Date().toISOString()
      });
      throw new Error(error);
    }

    // CATASTROPHIC FAILURE FIX: Prevent commands after route completion
    if (routeCompleted) {
      console.warn('[Tools] Route already complete, ignoring all tool calls');
      throw new Error("Route already complete. Please start a new route.");
    }

    const results: any[] = [];

    console.log('[Tools] Executing tool calls:', toolCalls.map(tc => tc.function.name));

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments);
      if (name === 'reset_route' && !resetConfirmed) {
        results.push({ tool_call_id: tc.id, result: { error: 'Reset requires explicit confirmation' } });
        break;
      }
      const path = name === 'reset_route' && USE_PYTHON ? '/picking-transition' : WEBHOOK_MAP[name];

      if (!path) {
        console.error('[Tools] Unknown tool:', name);
        results.push({ tool_call_id: tc.id, result: { error: 'Unknown tool' } });
        continue;
      }

      // CONCURRENT FIX: Debounce duplicate commands
      const now = Date.now();
      if (lastCommandRef.current &&
          lastCommandRef.current.name === name &&
          now - lastCommandRef.current.timestamp < DEBOUNCE_MS) {
        console.warn(`[Tools] Ignoring duplicate ${name} command (${now - lastCommandRef.current.timestamp}ms since last)`);
        results.push({
          tool_call_id: tc.id,
          result: { ignored: true, success: false, message: 'Duplicate command ignored (too fast)' }
        });
        continue;
      }
      lastCommandRef.current = { name, timestamp: now };

      try {
        let requestSession = sessionIdRef.current;
        const requestUser = userIdRef.current;
        // Construct endpoint URL (full URL if path starts with http, otherwise prepend N8N_BASE)
        let endpoint = path.startsWith('http') ? path : `${N8N_BASE}${path}`;
        let progressTarget: Record<string, unknown> = {};
        const transitionAction = ({ get_next_item: 'next', start_machine: 'start',
          skip_current_machine: 'skip', go_back_to_skipped: 'back', reset_route: 'reset' } as Record<string, string>)[name];
        if (transitionAction && USE_PYTHON) {
          const machine = pickingContext?.machines.find(m => m.id === pickingContext.currentMachineId);
          if (!pickingContext || !machine || !Number.isInteger(machine.completedItems) ||
              !['pending', 'in_progress', 'skipped', 'completed'].includes(machine.status || '') ||
              !['forward', 'reverse'].includes(pickingContext.pickDirection || 'forward')) {
            throw new Error('Missing authoritative picking context');
          }
          // Old installations saved a browser-generated session ID. Resolve it
          // read-only, only when the entire displayed target matches the server.
          if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestSession)) {
            const resumed = await fetchWithTimeout(`${PYTHON_API_BASE}/resume-state`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            if (!resumed.ok) throw new Error('Could not resolve saved session');
            const snapshot = await resumed.json();
            if (requestSession !== sessionIdRef.current || requestUser !== userIdRef.current ||
                !pickingContext.routeId || snapshot.route?.id !== pickingContext.routeId ||
                snapshot.current_machine?.id !== machine.id ||
                snapshot.current_machine?.completed_items !== machine.completedItems ||
                snapshot.pick_direction !== (pickingContext.pickDirection || 'forward') || !snapshot.session_id) {
              throw new Error('Saved route differs from displayed route');
            }
            requestSession = snapshot.session_id;
            sessionIdRef.current = requestSession;
          }
          let revision = pickingContext.pickingRevision ||
            (bootstrapRevisionRef.current?.session === requestSession ? bootstrapRevisionRef.current.revision : undefined);
          if (!revision) {
            const contextResponse = await fetchWithTimeout(`${PYTHON_API_BASE}/picking-context`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: requestSession }),
            });
            if (!contextResponse.ok) throw new Error('Could not verify picking context');
            const snapshot = await contextResponse.json();
            if (requestSession !== sessionIdRef.current || requestUser !== userIdRef.current ||
                snapshot.route_id !== pickingContext.routeId || snapshot.current_machine_id !== machine.id ||
                snapshot.pick_direction !== (pickingContext.pickDirection || 'forward') ||
                !snapshot.picking_revision || snapshot.machines?.length !== pickingContext.machines.length ||
                !pickingContext.machines.every(local => snapshot.machines.some((saved: any) =>
                  saved.id === local.id && saved.completedItems === local.completedItems && saved.status === local.status))) {
              throw new Error('Saved route differs from displayed route');
            }
            revision = snapshot.picking_revision;
            bootstrapRevisionRef.current = { session: requestSession, revision };
          }
          if (name === 'start_machine' && !['beginning', 'end'].includes(args.direction)) {
            throw new Error('Invalid start direction');
          }
          endpoint = `${PYTHON_API_BASE}/picking-transition`;
          progressTarget = {
            operation_id: crypto.randomUUID(),
            expected_machine_id: machine.id,
            expected_revision: revision,
            expected_state: { completed_items: machine.completedItems, status: machine.status,
              direction: pickingContext.pickDirection || 'forward' },
            action: transitionAction,
            direction: name === 'start_machine' ? (args.direction === 'end' ? 'reverse' : 'forward') :
              (pickingContext.pickDirection || 'forward'),
          };
        }
        console.log(`[Tools] Calling ${name}:`, { args, endpoint });

        // Check if 2-item mode is enabled (read FRESH from localStorage each call)
        const callTwoItems = localStorage.getItem('stocker-call-two-items') === 'true';

        // Add count parameter for workflows that support it
        const shouldAddCount = callTwoItems && (name === 'start_machine' || name === 'get_next_item');

        if (name === 'start_machine' || name === 'get_next_item') {
          console.log(`[Tools] 📦 2-pick mode: ${callTwoItems ? 'ON (count=2)' : 'OFF (count=1)'}`, {
            localStorage: localStorage.getItem('stocker-call-two-items'),
            shouldAddCount,
          });
        }

        // authFetch adds the caller's login and handles a refused expired token.
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        // Versioned picking transitions have operation receipts. Keep automatic
        // retries off across tools; never fall back after an uncertain write.
        const resp = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...args,
            // Identity/targets come from application state, never AI arguments.
            session_id: requestSession,
            user_id: requestUser,
            ...progressTarget,
            // count AFTER args so localStorage setting always wins over AI arguments
            ...((name === 'start_machine' || name === 'get_next_item') ? { count: callTwoItems ? 2 : 1 } : {}),
          })
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          console.error(`[Tools] ${name} failed:`, {
            status: resp.status,
            statusText: resp.statusText,
            body: errorText
          });
          let detail: unknown;
          try { detail = JSON.parse(errorText).detail; } catch { /* non-JSON response */ }
          results.push({ tool_call_id: tc.id, result: {
            error: `Request failed (${resp.status})`,
            status: resp.status,
            user_message: toolFailureMessage(resp.status, detail),
          } });
          break; // Do not execute further dependent actions after a refusal.
        }

        let result = await resp.json();
        if (requestSession !== sessionIdRef.current || requestUser !== userIdRef.current) {
          results.push({ tool_call_id: tc.id, result: { ignored: true, success: false, message: 'Session changed while request was in flight' } });
          break;
        }
        if (!result || result.error || result.success === false) {
          results.push({ tool_call_id: tc.id, result: {
            error: 'Action was not confirmed', user_message: toolFailureMessage(),
          } });
          break;
        }
        console.log(`[Tools] ${name} succeeded:`, result);

        // Workflow now returns item2 directly when count=2

        if (name === 'set_route_sequence' && result.session_id) {
          sessionIdRef.current = result.session_id;
          bootstrapRevisionRef.current = null;
        }
        onResult?.(name, result);
        results.push({ tool_call_id: tc.id, result });
      } catch (e: any) {
        console.error(`[Tools] ${name} exception:`, e);
        results.push({ tool_call_id: tc.id, result: {
          error: 'Action outcome could not be confirmed',
          user_message: toolFailureMessage(),
        } });
        break;
      }
    }

    // Preserve a tool result for every requested call in conversation history,
    // even when the batch stopped after an error. Nothing else is sent to the API.
    for (const tc of toolCalls) {
      if (!results.some(r => r.tool_call_id === tc.id)) {
        results.push({ tool_call_id: tc.id, result: { error: 'Not executed after earlier failure' } });
      }
    }

    console.log('[Tools] All tool calls completed:', {
      total: toolCalls.length,
      successful: results.filter(r => !r.result.error).length,
      failed: results.filter(r => r.result.error).length
    });

    return results;
  }, []);

  const getRoutes = useCallback(async (date: string) => {
    // BUG-N8N-2 FIX: Validate session exists before calling workflow
    if (!sessionIdRef.current || sessionIdRef.current === '') {
      throw new Error("Hold on, I'm still getting ready. Give me a second to load your route data.");
    }

    const resp = await fetchWithTimeout(`${N8N_BASE}/get-routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        user_id: userIdRef.current,
        date
      })
    });
    if (!resp.ok) throw new Error('Failed to get routes');
    return resp.json();
  }, []);

  return { setSession, sendToAI, executeToolCalls, getRoutes };
}
