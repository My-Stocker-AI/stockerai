import { useCallback, useRef } from 'react';

const N8N_BASE = 'https://visionairy.app.n8n.cloud/webhook';

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_routes_for_date",
      description: "Get available routes for a specific delivery date",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string" },
          date: { type: "string" }
        },
        required: ["session_id", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_route_sequence",
      description: "Set the route to stock",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string" },
          route_name: { type: "string" },
          date: { type: "string" }
        },
        required: ["session_id", "route_name", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_next_item",
      description: "Get the next item to pick",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string" },
          date: { type: "string" }
        },
        required: ["session_id", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "start_machine",
      description: "Start a machine from beginning or end",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string" },
          direction: { type: "string" }
        },
        required: ["session_id", "direction"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "skip_current_machine",
      description: "Skip current machine",
      parameters: {
        type: "object",
        properties: { session_id: { type: "string" } },
        required: ["session_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "go_back_to_skipped",
      description: "Return to skipped machine",
      parameters: {
        type: "object",
        properties: { session_id: { type: "string" } },
        required: ["session_id"]
      }
    }
  }
];

const WEBHOOK_MAP: Record<string, string> = {
  'get_routes_for_date': '/get-routes',
  'set_route_sequence': '/set-sequence',
  'get_next_item': '/next-item',
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
      if (currentItem.inventory_current !== undefined) {
        itemContext += `\nInventory: ${currentItem.inventory_current}/${currentItem.inventory_parlevel}`;
      }
    }

    return `You are Stocker, a voice assistant helping warehouse workers stock vending machine routes.
You are speaking with ${userName}. Address them by name occasionally.

Your job: Guide users through picking items one by one.

RULES:
- Be concise - under 15 words
- Say quantity first, then product, then slot
- NEVER mention tool names or technical details
- VARY your responses - never repeat the same phrase

CONFIRMATIONS (MUST call get_next_item):
When user says "next", "done", "got it", "okay", "yes" - ALWAYS call get_next_item.

DIRECTION (MUST call start_machine):
"top"/"beginning" = direction="beginning"
"bottom"/"end" = direction="end"

Session: ${sessionIdRef.current}
Date: ${today}${itemContext}`;
  }, []);

  const sendToAI = useCallback(async (messages: any[], userName: string, currentItem: any) => {
    const response = await fetch(`${N8N_BASE}/openai-chat`, {
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
        const resp = await fetch(`${N8N_BASE}${path}`, {
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
    const resp = await fetch(`${N8N_BASE}/get-routes`, {
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
