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
  'go_back_to_skipped': '/back-to-skipped'
};

export function useStockerAI() {
  const sessionIdRef = useRef<string>('');
  const userIdRef = useRef<string | null>(null);

  const setSession = useCallback((sessionId: string, userId: string | null) => {
    sessionIdRef.current = sessionId;
    userIdRef.current = userId;
  }, []);

  const buildSystemPrompt = useCallback((userName: string, currentItem: any) => {
    const today = new Date().toISOString().split('T')[0];
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
When user says ANY of these, you MUST call get_next_item - do NOT just reply with text:
- "next", "next item", "next one", "what's next", "and next"
- "done", "got it", "okay", "ok", "yep", "yes", "yeah", "yup", "uh huh"
- "OK next", "alright next", "ready", "alright", "all right"
- "check", "checked", "good", "cool", "great", "perfect"
- Any short confirmation phrase
NEVER respond with just "OK" or "Got it" - ALWAYS call get_next_item tool first.

CRITICAL - Date handling:
- When user mentions ANY date (like "December 27", "the 27th", "yesterday", "last Friday"), you MUST call get_routes_for_date with that date
- Convert spoken dates to YYYY-MM-DD format
- NEVER just respond with text when a date is mentioned - ALWAYS call the tool first
- If user asks about routes without a date, use today's date

CRITICAL - Starting a route:
- When user says a route name or "start my route", MUST call set_route_sequence
- It returns machine info - then ask: "Starting [machine_name] with [X] items. Start from the top of the list, or the bottom?"

CRITICAL - Direction responses (MUST call start_machine tool):
When user responds with direction after being asked about list order:
- "top", "beginning", "start", "first", "from the top" = call start_machine with direction="beginning"
- "bottom", "end", "last", "reverse", "from the bottom" = call start_machine with direction="end"
NEVER just acknowledge direction - ALWAYS call start_machine tool with the direction parameter.

When get_next_item returns action="next_machine":
- Ask about direction: "Done with [completed_machine]. Next up is [next_machine]. Start from the top of the list, or the bottom?"
- Wait for user response, then call start_machine with their chosen direction

CRITICAL - Skip commands (MUST call skip_current_machine tool):
- "skip", "skip machine", "skip this one", "next machine" = call skip_current_machine
- NEVER just say "OK skipping" - ALWAYS call the tool first

CRITICAL - Go back commands (MUST call go_back_to_skipped tool):
- "go back", "back to skipped", "return to skipped" = call go_back_to_skipped
- NEVER just acknowledge - ALWAYS call the tool first

When user asks about inventory, machine count, or "what's in the machine" - respond with the current item's inventory data if available.

Current session ID: ${sessionIdRef.current}
Today's date: ${today}${itemContext}`;
  }, []);

  const sendToAI = useCallback(async (messages: any[], userName: string, currentItem: any) => {
    // Check online status (from original PWA)
    if (!navigator.onLine) {
      throw new Error('No internet connection');
    }

    const response = await fetchWithTimeout(`${N8N_BASE}/openai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: buildSystemPrompt(userName, currentItem) }, ...messages],
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
