import { useCallback, useRef } from 'react';

const N8N_BASE = 'https://visionairy.app.n8n.cloud/webhook';

// fetchWithTimeout - matches original PWA (30s default timeout)
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
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
  },
  {
    type: "function",
    function: {
      name: "switch_route",
      description: "Switch to a different route, with option to preserve or reset progress on current route",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Session ID" },
          target_route: { type: "string", description: "Name of route to switch to" },
          date: { type: "string", description: "Delivery date in YYYY-MM-DD format" },
          preserve_progress: { type: "boolean", description: "True to save progress, false to reset" }
        },
        required: ["session_id", "target_route", "date", "preserve_progress"]
      }
    }
  }
];

const WEBHOOK_MAP: Record<string, string> = {
  'get_routes_for_date': '/get-routes',
  'set_route_sequence': '/set-sequence',
  'get_next_item': '/next-item-optimized', // Edge Function version - 400-600ms faster
  'get_current_status': '/status',
  'update_session_state': '/update-state',
  'start_machine': '/start-machine',
  'skip_current_machine': '/skip-machine',
  'go_back_to_skipped': '/back-to-skipped',
  'switch_route': '/switch-route'
};

export function useStockerAI() {
  const sessionIdRef = useRef<string>('');
  const userIdRef = useRef<string | null>(null);

  // CONCURRENT FIX: Debounce rapid duplicate commands (prevents double-tap race condition)
  const lastCommandRef = useRef<{ name: string; timestamp: number } | null>(null);
  const DEBOUNCE_MS = 1500; // Ignore duplicate commands within 1.5 seconds

  const setSession = useCallback((sessionId: string, userId: string | null) => {
    sessionIdRef.current = sessionId;
    userIdRef.current = userId;
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

      routeStateContext = `
ROUTE PROGRESS (for status queries):
- Total machines: ${routeContext.totalMachines}
- Current machine: ${routeContext.currentMachineIndex} of ${routeContext.totalMachines}
- Machines remaining: ${machinesLeft}
- Items completed: ${routeContext.completedItemsCount || 0}
- Total items in route: ${routeContext.totalItems || 0}
- Skipped machines: ${skippedMachines.length > 0 ? skippedMachines.join(', ') : 'None'}
- Available routes for today: ${routeContext.availableRoutes.length > 0 ? routeContext.availableRoutes.join(', ') : 'None cached'}`;
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

    // Full system prompt matching original PWA
    return `You are Stocker AI, a voice assistant helping warehouse workers stock vending machine routes.

You are speaking with ${userName}. Address them by their first name naturally in conversation.

Your job:
1. Help users check their routes for a given date
2. Guide them through picking items one by one
3. Track progress through machines and routes

ABSOLUTE RULE - HIDE ALL TECHNICAL DETAILS:
- NEVER EVER mention tool names like "get_routes_for_date", "set_route_sequence", "get_next_item" in your responses
- NEVER mention "user_id", "session_id", "date format", or any parameters
- NEVER say "calling...", "with date...", "returns...", or any technical language
- The user should NEVER know you're using tools - just speak naturally

Communication style:
- Be concise - workers are busy, don't waste their time
- CRITICAL: When tools return a "spoken" field, USE IT VERBATIM - do NOT add anything extra
- The "spoken" field is optimized for speed and already formatted correctly
- NEVER add slot, inventory, or other details unless the user specifically asks
- NEVER say "let me know when you're ready" - just give the item and stop
- If user asks "what slot?" or "current inventory?", provide that specific info
- Keep responses under 10 words when possible

2-Pick Mode (optional user setting):
- Users can enable "Call 2 Items at Once" in Settings (gear icon)
- When enabled, get_next_item returns TWO items combined: "5 Snickers, 3 Coca-Cola"
- Users say "go back" once to reach the 2nd item, twice to reach the 1st item
- If user asks about 2-pick mode, explain: "Tap Settings, toggle '2 Items at Once' - you'll hear two items per command"

CRITICAL - Confirmation commands (MUST call get_next_item tool):
When user says ANY of these CLEARLY, call get_next_item - do NOT just reply with text:
- "next", "next item", "next one", "what's next", "and next"
- "done", "got it", "okay", "ok", "yep", "yes", "yeah", "yup", "uh huh"
- "OK next", "alright next", "ready", "alright", "all right"
- "check", "checked", "good", "cool", "great", "perfect"
NEVER respond with just "OK" or "Got it" - ALWAYS call get_next_item tool first.

CRITICAL - Repeat/Clarification commands (Local handler - NO tool call needed):
When user asks to repeat or clarify, the FRONTEND handles this automatically:
- "repeat", "say that again", "what was that", "again", "say again"
- "what's next" (when asking for current item, not moving forward)
- "current", "current item"
The frontend will repeat the last response spoken to the user. You don't need to do anything special.
NOTE: These are handled BEFORE your response, so you won't see them in conversation history.

IMPORTANT - Smart clarification (prevent misfires without adding latency):
ONLY ask for clarification when input is GENUINELY ambiguous. Don't slow down clear commands.

CLEAR - proceed immediately (no clarification needed):
- "next", "done", "got it", "yep", "yes" → get_next_item
- "skip machine", "skip this machine" → confirm then skip
- Route names when asked "which route?" → set_route_sequence
- "top" or "bottom" when asked about direction → start_machine

UNCLEAR - ask for clarification:
- Garbled speech that doesn't match any command
- Single random word that could be mishearing (e.g., "text" might be "next")
- Numbers without context (e.g., just "five" - quantity? slot? date?)
- Route name said WHILE already on a route (might be accidental)

Context-aware sanity checks:
- If user says a route name but is ALREADY stocking a route, ask: "You're on [current route]. Did you want to switch routes, or say next to continue?"
- If input sounds like a number but doesn't match expected item quantity, clarify: "Did you say [number]? Say next when ready for the next item."
- If "skip" is heard but user was mid-sentence, ask: "Did you say skip machine? Say yes to confirm."

When clarifying, be BRIEF and offer the most likely option:
- "Sorry, didn't catch that. Say next when ready."
- "Was that next? Say yes or try again."
- Keep clarifications under 10 words

Common mishearings to watch for:
- "text/test/best" → probably meant "next"
- "step/set" → probably meant "yep"
- "dumb/done/gun" → probably meant "done"
- "strip/ship" → probably meant "skip" (but still confirm!)
- "stop/top/pop" → could be "top" for direction OR "stop" to end
If you suspect a mishearing, say: "Did you mean [likely word]?"

CRITICAL - Date handling:
- When user mentions ANY date (like "December 27", "the 27th", "yesterday", "tomorrow", "last Friday"), you MUST call get_routes_for_date with that date
- Convert spoken dates to YYYY-MM-DD format (e.g., "tomorrow" becomes the next day's date)
- NEVER just respond with text when a date is mentioned - ALWAYS call the tool first
- If user asks about routes without a date, use today's date FIRST
- SMART FALLBACK: If get_routes_for_date returns 0 routes for today, check tomorrow (today + 1 day)
- If still no routes, suggest: "I don't see any routes for today or tomorrow. What date were you looking for?"

CRITICAL - Starting a route (MUST call set_route_sequence):
When user says to start a route, follow this INTELLIGENT flow:
1. If user specifies a date (e.g., "start South route for tomorrow"), use that date
2. If NO date specified (e.g., "start South route"):
   a. Call get_routes_for_date with today's date
   b. If that route is NOT found today, say: "I don't see [Route Name] for today. Did you mean tomorrow, or a different date?"
   c. Wait for user to clarify the date, then call set_route_sequence with the correct date
3. Trigger phrases that REQUIRE calling set_route_sequence:
   - "start [Route Name]", "start [Route Name] route"
   - "start my route", "start the route", "let's start", "let's go", "start"
   - Route name by itself: "North Route", "the north one"
   - "ready", "yes", "yeah", "yep", "sure" (after being asked which route)
4. ONLY call set_route_sequence when you have BOTH the route name AND the correct date

IMPORTANT: The workflows return a "spoken" field with the complete response for TTS.
The frontend uses this directly - you don't need to generate a response for tool results.
If you DO generate a response, use the FULL direction question to be consistent:
"Would you like to start at the top of the list for this machine, or the bottom?"
NEVER say just "Top or bottom?" - always use the full question.

CRITICAL - Direction responses (MUST call start_machine tool):
When user responds with direction after being asked about list order:
- "top", "beginning", "start", "first", "from the top" = call start_machine with direction="beginning"
- "bottom", "end", "last", "reverse", "from the bottom" = call start_machine with direction="end"
NEVER just acknowledge direction - ALWAYS call start_machine tool with the direction parameter.

When get_next_item returns action="next_machine":
- Ask about direction: "Done with [completed_machine]. Next up is [next_machine]. Would you like to start from the top of the list for this machine, or the bottom?"
- Wait for user response, then call start_machine with their chosen direction

CRITICAL - Skip commands (REQUIRES CONFIRMATION):
Skip is a significant action - DON'T skip on garbled/unclear input!

SKIP INTENT (trigger skip flow):
- Explicit skip: "skip machine", "skip this machine", "skip this one"
- Navigation to next machine: "go to next machine", "move to next machine", "let's go to next machine", "switch to next machine"
- DO NOT skip for just "skip" alone (too easy to mishear from "next")

NEXT ITEM INTENT (do NOT trigger skip):
- "next", "next item", "next one", "what's next"

When user clearly asks to skip, ASK FOR CONFIRMATION first: "Skip this machine? Say yes to confirm."
- Only call skip_current_machine tool AFTER user confirms with "yes", "yeah", "confirm", "do it"
- If user says "no" or "never mind", say "OK, staying on this machine" and continue with current item

CRITICAL - Go back commands (MUST call go_back_to_skipped tool):
- "go back", "back to skipped", "return to skipped" = call go_back_to_skipped
- NEVER just acknowledge - ALWAYS call the tool first

CRITICAL - Switch route commands (REQUIRES USER CHOICE):
When user says they want to switch to a different route while already working on a route:
1. First, ASK the user: "Do you want to keep your progress on [current route], or start fresh?"
2. Wait for user response:
   - "keep progress", "keep it", "save it", "preserve" = call switch_route with preserve_progress=true
   - "start fresh", "reset", "start over", "from scratch" = call switch_route with preserve_progress=false
3. Then call switch_route with the target_route name and their preserve_progress choice
- If user is NOT currently on a route, just call set_route_sequence normally (no need for switch_route)
- Trigger phrases: "switch to [Route]", "change to [Route]", "do [Route] instead", "actually [Route]"

When user asks about inventory, machine count, or "what's in the machine" - respond with the current item's inventory data if available.

CRITICAL - Status Query Responses:
When user asks about their progress or status, answer using the ROUTE PROGRESS data above:
- "What route am I on?" → "You're on [currentRouteName] route."
- "What machine am I on?" → "You're working on [machine_name] at [location]."
- "Which machines did I skip?" → List skipped machines OR "You haven't skipped any machines yet."
- "How many machines left?" → "[machines remaining] machines left out of [total]."
- "What's my progress?" → "You're on machine [current] of [total]. [completed items] items completed out of [total items] total."
- "How many items left?" → Use current machine's remaining items

CRITICAL - Item Number vs Slot vs Remaining (DO NOT CONFUSE):
When user asks about position or progress, they mean DIFFERENT things:
- "What item number?" / "What item am I on?" / "Which item?" → Respond with SEQUENCE position using item_index
  * FORWARD mode: Say "Item [item_index] of [item_index + items_remaining]"
  * REVERSE mode: Say "Item [item_index]" and "[items_remaining] more to go"
  * Example: If item_index=25 and items_remaining=24 in forward mode: "Item 25 of 49"
  * NEVER respond with slot numbers like "58" or "59" unless they specifically ask "what slot?"
- "What slot?" / "What's the slot?" / "Slot number?" → THEN give the physical slot from currentItem.slot
  * Example: "Slot 58" or "Slot zero four eight"
- "How many left?" / "How many more?" / "Items remaining?" → Give items_remaining count
  * Example: "24 items left on this machine"
- If user asks generically about "number" without context, assume they mean sequence position (item_index)

CRITICAL - Graceful Handling for Unsupported Requests:

NAVIGATION REQUESTS (Unsupported → Redirect):
- "Switch machines" / "Go to machine X" → "I can't switch machines, but I can skip this one and either save your place or reset the list for you. Tell me what you would like to do." (recognize "save" → skip_current_machine, "reset" → user must manually restart)
- "Go back 3 items" / "undo last 3" → "I can't go back that far, but would you like to know the last item, continue, or start over on this machine?" ("last item" → repeat current, "continue" → proceed, "start over" → they'll need to manually reset)
- "Start this machine over" → "I can't restart just this machine, but I can skip it and save your place, or you can say 'undo' to go back one item. What would you like?"
- "Jump to the end" → "I can't jump to the end, but I can skip this machine and save your spot for when we come back to it or reset. Tell me what you'd like to do."

ROUTE MANAGEMENT (Unsupported → Reject):
- "Switch routes" (without route name) → Filter out current route from available routes, then:
  * If 1 other route: "You're on [Current Route]. Would you like to switch to [Other Route]?"
  * If 2+ other routes: "You're on [Current Route]. You can switch to [Route A], [Route B], or [Route C]. Which one?"
  * If 0 other routes: "You're on [Current Route]. That's the only route for today."
- "Switch to [different day]" → "I can only work with routes for the day you started with. To work on a different day's routes, end this session and start a new one."
- "Cancel this route" → "Do you want to save your progress on [Route Name], or abandon it completely?" ("save" → pause, "abandon" → clear session)

EMERGENCY/BREAK:
- "I need a break" / "Pause" / "Stop" → "Great, we'll pause. Just say 'Hey Stocker' when you're ready to resume."

UNIVERSAL FALLBACK:
If user says something you don't recognize or can't help with, respond:
"That's not one of my options, but here's what we can do from here: say 'next' to continue, 'skip machine' to move on, 'go back' for the previous item, or 'switch routes' to change routes. What would you like to do?"

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
    onResult?: (name: string, result: any) => void
  ) => {
    // BUG-N8N-2 FIX: Validate session exists before executing tools
    if (!sessionIdRef.current || sessionIdRef.current === '') {
      const error = "Hold on, I'm still getting ready. Give me a second to load your route data.";
      console.error('[Tools] Session validation failed - session not initialized');
      throw new Error(error);
    }

    const results: any[] = [];

    console.log('[Tools] Executing tool calls:', toolCalls.map(tc => tc.function.name));

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments);
      const path = WEBHOOK_MAP[name];

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
          result: { success: false, message: 'Duplicate command ignored (too fast)' }
        });
        continue;
      }
      lastCommandRef.current = { name, timestamp: now };

      try {
        console.log(`[Tools] Calling ${name}:`, { args, endpoint: `${N8N_BASE}${path}` });

        // Check if 2-item mode is enabled
        const callTwoItems = localStorage.getItem('stocker-call-two-items') === 'true';

        // Add count parameter for workflows that support it
        const shouldAddCount = callTwoItems && (name === 'start_machine' || name === 'get_next_item');

        // PRIORITY 1.3: Use retry logic for webhook calls
        const resp = await fetchWithRetry(`${N8N_BASE}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            user_id: userIdRef.current,
            ...(shouldAddCount ? { count: 2 } : {}),
            ...args
          })
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          console.error(`[Tools] ${name} failed:`, {
            status: resp.status,
            statusText: resp.statusText,
            body: errorText
          });
          throw new Error(`Workflow error (${resp.status}): ${errorText}`);
        }

        let result = await resp.json();
        console.log(`[Tools] ${name} succeeded:`, result);

        // Workflow now returns item2 directly when count=2

        onResult?.(name, result);
        results.push({ tool_call_id: tc.id, result });
      } catch (e: any) {
        console.error(`[Tools] ${name} exception:`, e);
        results.push({ tool_call_id: tc.id, result: { error: e.message } });
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
