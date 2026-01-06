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
  'get_next_item': '/next-item',
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
      itemContext = `\nCurrent item: ${currentItem.quantity}x ${currentItem.product}, ${currentItem.slot_spoken || currentItem.slot}`;
      if (currentItem.inventory_current !== undefined && currentItem.inventory_parlevel !== undefined) {
        itemContext += `\nInventory: ${currentItem.inventory_current} of ${currentItem.inventory_parlevel} in machine`;
      }
      if (currentItem.machine_name) {
        itemContext += `\nMachine: ${currentItem.machine_name}`;
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
- Say quantity first, then product name, then the slot_spoken field
- The slot_spoken field is pre-formatted for speech - use it directly
- NEVER say "let me know when you're ready" - just give the item and stop
- CRITICAL: VARY your responses randomly - NEVER use the same phrase twice in a row
- Pick randomly from these styles:
  * Direct: "3 Doritos, slot 58"
  * Next up: "Next up, 3 Doritos, slot 58"
  * Grab: "Grab 5 Coke cans, slot 42"
  * Acknowledged: "Got it. 2 Cheetos, slot 31"
  * Next item: "Next item, 4 Snickers, slot 27"
  * Alright: "Alright, 6 water bottles, slot 19"
  * Moving on: "Moving on, 2 Lays chips, slot 44"
- Keep it under 15 words per response
- Use the user's first name sparingly, maybe 1 in 10 responses

CRITICAL - Confirmation commands (MUST call get_next_item tool):
When user says ANY of these CLEARLY, call get_next_item - do NOT just reply with text:
- "next", "next item", "next one", "what's next", "and next"
- "done", "got it", "okay", "ok", "yep", "yes", "yeah", "yup", "uh huh"
- "OK next", "alright next", "ready", "alright", "all right"
- "check", "checked", "good", "cool", "great", "perfect"
NEVER respond with just "OK" or "Got it" - ALWAYS call get_next_item tool first.

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
- Only trigger skip flow for CLEAR phrases: "skip machine", "skip this machine", "skip this one"
- DO NOT skip for just "skip" alone (too easy to mishear from "next")
- DO NOT skip for "next machine" (user probably means next item)
- When user clearly asks to skip, ASK FOR CONFIRMATION first: "Skip this machine and come back later? Say yes to confirm."
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

    const response = await fetchWithTimeout(`${N8N_BASE}/openai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: buildSystemPrompt(userName, currentItem, routeContext) }, ...messages],
        tools: TOOLS,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) throw new Error('AI service error');
    const data = await response.json();
    return data.choices[0].message;
  }, [buildSystemPrompt]);

  const executeToolCalls = useCallback(async (
    toolCalls: any[],
    onResult?: (name: string, result: any) => void
  ) => {
    const results: any[] = [];

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments);
      const path = WEBHOOK_MAP[name];

      if (!path) {
        results.push({ tool_call_id: tc.id, result: { error: 'Unknown tool' } });
        continue;
      }

      try {
        const resp = await fetchWithTimeout(`${N8N_BASE}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            user_id: userIdRef.current,
            ...args
          })
        });

        if (!resp.ok) throw new Error('Workflow error');
        const result = await resp.json();
        onResult?.(name, result);
        results.push({ tool_call_id: tc.id, result });
      } catch (e: any) {
        results.push({ tool_call_id: tc.id, result: { error: e.message } });
      }
    }

    return results;
  }, []);

  const getRoutes = useCallback(async (date: string) => {
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
