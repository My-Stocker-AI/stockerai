# StockerAI: Complete n8n to Python Migration Specification

**Generated:** 2026-02-10
**Purpose:** Complete system documentation for migrating all n8n workflows to Python Edge Functions
**Approach:** Parallel systems with environment variable switch + instant rollback

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Layer 1: Frontend API Contracts](#2-layer-1-frontend-api-contracts)
3. [Layer 2: n8n Workflows (12 total)](#3-layer-2-n8n-workflows)
4. [Layer 3: Edge Functions](#4-layer-3-edge-functions)
5. [Layer 4: Database (Tables, RPCs, Triggers)](#5-layer-4-database)
6. [Migration Mapping](#6-migration-mapping)
7. [Critical Business Logic to Port](#7-critical-business-logic)
8. [Known Issues & Technical Debt](#8-known-issues)

---

## 1. Architecture Overview

### Current Data Flow
```
Frontend (React/TypeScript)
    │
    ├── WEBHOOK_MAP (8 tools) ──→ n8n Webhooks (7 workflows)
    │                          └─→ Supabase Edge Function (1: get_current_status)
    │
    ├── Direct Supabase calls ──→ sessions, machines, routes, items, etc.
    │
    ├── supabase.functions.invoke() ──→ 6 Edge Functions (billing, team, usage)
    │
    ├── PDF Upload ──→ n8n workflow (parse + insert)
    │
    ├── OpenAI Chat ──→ n8n proxy webhook
    │
    └── Voice ──→ Deepgram (STT) + Cloudflare Worker (TTS)
            │
            └─→ Supabase (PostgreSQL + Edge Functions)
```

### Target Architecture
```
Frontend (same)
    │
    ├── WEBHOOK_MAP ──→ Python Edge Functions (ALL 8 tools)
    │
    ├── Direct Supabase calls ──→ Same database
    │
    ├── supabase.functions.invoke() ──→ Same billing Edge Functions (no change)
    │
    ├── PDF Upload ──→ Python Edge Function (new)
    │
    ├── OpenAI Chat ──→ Python Edge Function (new)
    │
    └── Voice ──→ Same (Deepgram + Cloudflare Workers, no change)
```

### Base URLs

| Constant | Value | Used By |
|----------|-------|---------|
| `N8N_BASE` | `https://visionairy.app.n8n.cloud/webhook` | All n8n tool calls |
| `TTS_URL` | `https://solitary-base-799c.russ-731.workers.dev` | Text-to-speech |
| `DEEPGRAM_TOKEN_URL` | `https://stocker-deepgram-stt.russ-731.workers.dev/token` | STT token |
| Supabase | `https://wvtkuposrlvadyeixlke.supabase.co` | Edge Functions, DB |

---

## 2. Layer 1: Frontend API Contracts

### 2.1 WEBHOOK_MAP (Tool Name → Endpoint)

**File:** `src/hooks/useStockerAI.ts:196-205`

```typescript
const WEBHOOK_MAP: Record<string, string> = {
  'get_routes_for_date': '/get-routes',
  'set_route_sequence':  '/set-sequence',
  'get_next_item':       '/next-item-optimized',
  'get_current_status':  'https://wvtkuposrlvadyeixlke.supabase.co/functions/v1/get-current-status-optimized',
  'update_session_state': '/update-state',
  'start_machine':       '/start-machine',
  'skip_current_machine': '/skip-machine',
  'go_back_to_skipped':  '/back-to-skipped'
};
```

**Resolution:** If path starts with `http`, used as-is. Otherwise, `N8N_BASE` prepended.

### 2.2 AI Tool Definitions (OpenAI Function Calling)

**File:** `src/hooks/useStockerAI.ts:75-194`

| Tool Name | Parameters | Description |
|-----------|-----------|-------------|
| `get_routes_for_date` | `session_id` (str), `date` (str, YYYY-MM-DD) | Get available routes for date |
| `set_route_sequence` | `session_id` (str), `route_name` (str), `date` (str) | Set route and get first item |
| `get_next_item` | `session_id` (str), `date` (str) | Get next item to pick |
| `get_current_status` | `session_id` (str) | Get current progress |
| `update_session_state` | `session_id` (str), `new_status` (str) | Update session state |
| `skip_current_machine` | `session_id` (str) | Skip current machine |
| `go_back_to_skipped` | `session_id` (str) | Return to skipped machine |
| `start_machine` | `session_id` (str), `direction` (str: "beginning"\|"end") | Start machine with direction |

### 2.3 Common Request Body (All Tool Calls)

**File:** `src/hooks/useStockerAI.ts:767-874`

```json
{
  "session_id": "<current session ID>",
  "user_id": "<current user ID>",
  "count": 2,  // ONLY if 2-pick mode AND tool is start_machine or get_next_item
  ...toolSpecificArgs
}
```

**Headers:** `{ "Content-Type": "application/json" }` (No Authorization header)
**Timeout:** 30s
**Retry:** 3 retries with exponential backoff (1s, 2s, 4s)
**Debounce:** 1.5s duplicate command protection

### 2.4 Response Contracts Per Tool

#### 2.4.1 `set_route_sequence` Response

**Consumed at:** `src/hooks/useStockerSession.ts:199-222`

```json
{
  "route_name": "string",
  "date": "YYYY-MM-DD",
  "machines_count": number,
  "machine_index": number,
  "machine_name": "string",
  "machine_id": "uuid",
  "machines": [
    {
      "id": "uuid",
      "name": "string",
      "location": "string",
      "sequence": number,
      "totalItems": number,
      "completedItems": number,
      "status": "pending|in_progress|completed|skipped"
    }
  ]
}
```

#### 2.4.2 `start_machine` Response

**Consumed at:** `src/hooks/useStockerSession.ts:224-271`

```json
{
  "machine_id": "uuid",
  "items_remaining": number,
  "direction": "forward|reverse",
  "new_item_index": number,
  "item1": {
    "product": "string",
    "product_parsed": { "name": "string", "size": "string" },
    "quantity": number,
    "slot": "string",
    "slot_spoken": "string",
    "inventory_current": number,
    "inventory_parlevel": number
  },
  "item2": { ... }  // ONLY if count=2
}
```

#### 2.4.3 `get_next_item` Response

**Consumed at:** `src/hooks/useStockerSession.ts:273-477`

**When `action = "next_item"`:**
```json
{
  "action": "next_item",
  "machine_id": "uuid",
  "machine_name": "string",
  "machine_index": number,
  "items_remaining": number,
  "new_item_index": number,
  "items_to_increment": number,
  "item1": {
    "product": "string",
    "product_parsed": { "name": "string", "size": "string" },
    "quantity": number,
    "slot": "string",
    "slot_spoken": "string",
    "inventory_current": number,
    "inventory_parlevel": number
  },
  "item2": { ... }  // ONLY if count=2
}
```

**When `action = "next_machine"`:**
```json
{
  "action": "next_machine",
  "next_machine": "string",
  "next_machine_id": "uuid",
  "items_to_increment": number
}
```

**When `action = "route_complete"` or `action = "complete"`:**
```json
{
  "action": "route_complete",
  "route_complete": true,
  "items_to_increment": number
}
```

#### 2.4.4 `skip_current_machine` Response

**Consumed at:** `src/hooks/useStockerSession.ts:480-535`

```json
{
  "action": "next_machine",
  "next_machine_id": "uuid",
  "next_machine": "string"
}
```
Or legacy (no `action` field):
```json
{
  "next_machine": "string",
  "next_machine_id": "uuid"
}
```
Or route complete:
```json
{
  "action": "route_complete"
}
```

#### 2.4.5 `go_back_to_skipped` Response

**Consumed at:** `src/hooks/useStockerSession.ts:537-550`

```json
{
  "machine_id": "uuid",
  "machine_name": "string"
}
```

#### 2.4.6 `get_current_status` Response

Not explicitly consumed in `updateFromTool`. AI uses it for status information.

```json
{
  "session_status": "stocking|No active session",
  "route_name": "string",
  "route_date": "string",
  "machine_name": "string",
  "machine_number": "string",
  "location_name": "string",
  "current_item": "Product (qty) in Slot | Machine complete | No current item",
  "progress": "completed/total",
  "completed_items": number,
  "total_items": number,
  "items_remaining": number
}
```

#### 2.4.7 `update_session_state` Response

Not explicitly consumed in `updateFromTool`. Simple acknowledgment.

```json
{
  "success": true,
  "new_status": "string"
}
```

#### 2.4.8 `get_routes_for_date` Response

**Called directly at:** `src/hooks/useStockerAI.ts:876-893`

```json
{
  "routes": [
    {
      "id": "uuid",
      "route_name": "string",
      "machines": number,
      "items": number,
      "machine_names": ["string"]
    }
  ],
  "count": number,
  "queried_date": "YYYY-MM-DD"
}
```

### 2.5 OpenAI Chat Proxy

**File:** `src/hooks/useStockerAI.ts:730-764`
**Endpoint:** `POST ${N8N_BASE}/openai-chat`

**Request:**
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "<system prompt>" },
    ...userMessages
  ],
  "tools": [<8 tool definitions>],
  "tool_choice": "auto"
}
```

**Response:**
```json
{
  "choices": [{
    "message": {
      "content": "string or null",
      "tool_calls": [{
        "id": "string",
        "function": { "name": "tool_name", "arguments": "{...}" }
      }]
    }
  }]
}
```

### 2.6 PDF Upload

**Files:** `src/components/stocker/UploadTab.tsx:119-129`, `src/pages/dashboard/UploadRoutes.tsx:262-272`
**Endpoint:** `POST ${N8N_BASE}/upload`
**Content-Type:** multipart/form-data

**FormData fields:**
- `pdf`: File (PDF binary)
- `date`: "YYYY-MM-DD"
- `user_id`: "uuid"

**Response:**
```json
{
  "route": "string",
  "machines": number,
  "items": number,
  "date": "string"
}
```

### 2.7 Item Prefetch Cache

**File:** `src/hooks/useItemCache.ts:83-108`
**Endpoint:** `POST ${N8N_BASE}/next-item` (NOTE: `/next-item`, NOT `/next-item-optimized`)

Uses same request/response as `get_next_item` but caches `next_item` results. Prefetches next 3 items. 30-minute cache expiry.

### 2.8 Voice System (NO MIGRATION NEEDED)

- **Deepgram Token:** `GET https://stocker-deepgram-stt.russ-731.workers.dev/token`
- **Deepgram STT:** `wss://api.deepgram.com/v1/listen` (WebSocket)
- **TTS:** `POST https://solitary-base-799c.russ-731.workers.dev`

### 2.9 Direct Supabase DB Calls (NO MIGRATION NEEDED)

| Operation | Table | File |
|-----------|-------|------|
| Session persistence | `sessions` + joins | `useSessionPersistence.ts` |
| Auth operations | `profiles`, `accounts`, `account_users` | `useAuth.tsx` |
| Keyword learning | RPCs: `upsert_user_keyword`, `get_top_user_keywords` | `useKeywordLearning.ts` |
| Route management | `routes`, `machines`, `items`, `route_assignments` | `UploadRoutes.tsx` |

### 2.10 Billing Edge Functions (NO MIGRATION NEEDED)

| Function | Called From |
|----------|------------|
| `check-subscription` | `Billing.tsx` |
| `create-checkout` | `Billing.tsx` |
| `customer-portal` | `Billing.tsx` |
| `calculate-usage` | `Usage.tsx` |
| `invite-team-member` | `Team.tsx` |
| `create-coupon` | `AdminDiscounts.tsx` |

---

## 3. Layer 2: n8n Workflows

### Summary Table

| # | Workflow | ID | Webhook | Nodes | Status | Migrate? |
|---|---------|-----|---------|-------|--------|----------|
| 1 | get_next_item (Optimized) | iykbFj7f9222PF7r | /next-item-optimized | 4 | ACTIVE | YES |
| 2 | start_machine | JbKdJuKgGbyvzlF0 | /start-machine | 9 | ACTIVE | YES |
| 3 | skip_current_machine | ElCSMeguJNxwp0HO | /skip-machine | 11 | ACTIVE | YES |
| 4 | set_route_sequence | 46lMRdxTgD1E3WFz | /set-sequence | 19 | ACTIVE | YES |
| 5 | go_back_to_skipped | rpNfINhjbFCuFrlZ | /back-to-skipped | 11 | ACTIVE | YES |
| 6 | get_routes_for_date | 4XS07THe1uGak7rk | /get-routes | 6 | ACTIVE | YES |
| 7 | delete_route | zmgTBX1w1rc5bOpO | /delete-route | 9 | ACTIVE | YES |
| 8 | update_session_state | ueDSi9SDBZ5jMwpO | /update-state | 5 | ACTIVE | YES |
| 9 | PDF Upload | 7kO6o1wASKvbhc2U | /upload | 16 | ACTIVE | YES |
| 10 | Stocker Auth | cw0ERwaa1VXJ2Jah | /auth | 4 | ACTIVE | YES |
| 11 | get_current_status | PD3ErCuxWBWLFXIq | /current-status | 9 | INACTIVE | NO (already Edge Function) |
| 12 | switch_route | 3G01u7N9REhrC9tn | /switch-route | 15 | INACTIVE | NO (not in frontend) |

### 3.1 get_next_item (Optimized) — `iykbFj7f9222PF7r`

**Flow:** Webhook → Call Edge Function → Update Session → Format Output

**Logic:**
1. Receives `user_id`, `count` from webhook
2. Calls Edge Function `get-next-item-data` which calls RPC `get_next_item_and_increment`
3. Updates session `current_machine_id` based on RPC result
4. Format Output node transforms raw RPC output into frontend contract

**Format Output Code (critical - contains all TTS formatting):**

```javascript
// Functions in Format Output node:
function parseProduct(name) {
  // Splits "Product Name 16oz" into { name: "Product Name", size: "16oz" }
  // Handles oz, ml, L, pk, ct, lb patterns
}

function fix(text) {
  // Pronunciation fixes for TTS:
  // "Bueno" → "Bwayno", "Takis" → "Tah-keez"
  // "Dr " → "Doctor ", "oz" → "ounce"
  // Slot formatting: "A1" → "A 1", "B12" → "B 12"
}

function spoken(data) {
  // Generates voice text based on action:
  // next_item: "3 Product Name, Slot A 1"
  // next_machine: "Machine X complete. Next is Machine Y at Location"
  // complete: "Route complete! Great job."
}
```

**Output by action:**
- `next_item`: `{ action, item1: {product, product_parsed, quantity, slot, slot_spoken, inventory_current, inventory_parlevel}, item2?, items_remaining, machine_id, machine_name, new_item_index, items_to_increment, spoken, display }`
- `next_machine`: `{ action, next_machine, next_machine_id, next_machine_number, next_location, completed_machine, items_to_increment, spoken, display }`
- `complete`: `{ action, route_complete: true, items_to_increment, spoken, display }`

### 3.2 start_machine — `JbKdJuKgGbyvzlF0`

**Flow:** Webhook → Get Session → Extract Session → Get Items → Select Item → [Update Machine Status + Merge] → Update Session → Format Output

**Key Logic:**

**Extract Session:**
- Validates `direction` param: "beginning"|"end" → maps to `pick_direction`: "forward"|"reverse"
- Gets session, route, machine data

**Select Item:**
- `forward` → sequence = 1 (first item)
- `reverse` → sequence = total_items (last item)
- If `count=2`: gets adjacent item too

**Update Machine:** Sets machine `status = 'in_progress'`

**Update Session:** Sets `pick_direction`, `current_machine_id`

**Format Output (180+ lines):**
```javascript
function parseProduct(name) { /* same as get_next_item */ }
function fixPronunciation(text) { /* same as get_next_item */ }
function formatSlotForTTS(slot) { /* "A1" → "A 1" */ }
function generateVoiceText(item) { /* "3 Product, Slot A 1" */ }
function generateDisplayText(item) { /* "Product Name x3 - Slot A1" */ }
```

**Output:**
```json
{
  "machine_id": "uuid",
  "machine_name": "string",
  "direction": "forward|reverse",
  "items_remaining": number,
  "new_item_index": number,
  "item1": {
    "product": "string",
    "product_parsed": { "name": "string", "size": "string" },
    "quantity": number,
    "slot": "string",
    "slot_spoken": "string",
    "inventory_current": number,
    "inventory_parlevel": number,
    "spoken": "string",
    "display": "string"
  },
  "item2": { ... },
  "spoken": "Starting Machine X from the top/bottom. First item: ...",
  "display": "Machine: X | Direction: Top/Bottom"
}
```

### 3.3 skip_current_machine — `ElCSMeguJNxwp0HO`

**Flow:** Webhook → Get Session → Extract Session → Get Current Machine → Prepare Skip Update → Mark Skipped → Find Next Machine → Process Next → Prepare Session Update → Update Session → Format Output

**Key Logic:**
- Prevents skipping already-skipped machines
- Saves `skipped_at_item` = current `completed_items` for resume point
- Auto-saves via trigger `auto_set_skipped_at_item`
- Find Next Machine: `sequence > current AND status != 'skipped'`
- If no next machine: checks for skipped machines to return to
- If no skipped either: route complete

**Format Output:** Random skip phrases for natural speech:
```javascript
var phrases = [
  "Got it, skipping {machine}. Moving to {next} at {location}.",
  "No problem! We'll come back to {machine}. Next up: {next} at {location}.",
  // ... 5+ variations
];
```

**Output:**
```json
{
  "action": "next_machine|route_complete",
  "skipped_machine": "string",
  "next_machine": "string",
  "next_machine_id": "uuid",
  "next_location": "string",
  "spoken": "random phrase",
  "display": "Skipped: X → Next: Y"
}
```

### 3.4 set_route_sequence — `46lMRdxTgD1E3WFz`

**Flow:** Webhook → Prepare Input → Check Active Session → Find Route (exact + partial match) → Process Route → Check Existing Session → [Pause Other Sessions] → Create/Update Session → Get Machines → Build Machine List → Update Session Machine → Format Output

**19 nodes — most complex workflow**

**Key Logic:**

**Route Matching:**
```javascript
// Exact match first
var exactMatch = routes.filter(function(r) {
  return r.route_name.toLowerCase() === routeName.toLowerCase();
});
// Then partial match
if (!exactMatch.length) {
  var partialMatch = routes.filter(function(r) {
    return r.route_name.toLowerCase().indexOf(routeName.toLowerCase()) > -1;
  });
}
```

**Session Management:**
- Pauses ALL other active sessions for user before activating
- Uses UPSERT with `on_conflict=user_id,session_key`
- Session key format: `stocking_{route_id}`

**Output:**
```json
{
  "action": "machine_ready",
  "route_name": "string",
  "route_id": "uuid",
  "route_date": "YYYY-MM-DD",
  "first_machine": "string",
  "first_machine_id": "uuid",
  "first_machine_number": number,
  "first_location": "string",
  "total_machines": number,
  "machines": [
    {
      "id": "uuid",
      "name": "string",
      "location": "string",
      "sequence": number,
      "totalItems": number,
      "completedItems": number,
      "status": "pending|in_progress|completed|skipped"
    }
  ],
  "session_id": "uuid",
  "spoken": "Starting route. First machine is X at Y. Say top or bottom."
}
```

### 3.5 go_back_to_skipped — `rpNfINhjbFCuFrlZ`

**Flow:** Webhook → Get Session → Extract Session → Find Skipped Machine → Prepare Update → Update Machine Status → Get First Item → Format Success/Error → Update Session → Output

**Key Logic:**
- Finds FIRST skipped machine ordered by `sequence ASC`
- Marks machine `status = 'pending'`
- Updates session `current_machine_id` to skipped machine
- Gets first item from machine

**Output:**
```json
{
  "action": "machine_ready",
  "machine_id": "uuid",
  "machine_name": "string",
  "machine_number": number,
  "location": "string",
  "total_items": number,
  "completed_items": number,
  "spoken": "Going back to Machine X at Location. Say top or bottom to start.",
  "display": "Returning to: Machine X"
}
```

### 3.6 get_routes_for_date — `4XS07THe1uGak7rk`

**Flow:** Webhook → Check Permissions → Get Routes → Process Routes → Format Output → Respond

**Key Logic:**
- Uses `respondToWebhook` node (not lastNode pattern)
- Checks user permissions via `account_users` table
- Queries routes with nested `machines(machine_name)` select
- Returns array of routes with machine names

**Output:**
```json
{
  "routes": [
    {
      "id": "uuid",
      "route_name": "string",
      "machines": number,
      "items": number,
      "machine_names": ["Machine 1", "Machine 2"]
    }
  ],
  "count": number,
  "queried_date": "YYYY-MM-DD"
}
```

### 3.7 delete_route — `zmgTBX1w1rc5bOpO`

**Flow:** Webhook → Get Route → Verify Ownership → Check Active Sessions → [Error if active] → Delete Route → Confirm Deletion → Format Output

**Key Logic:**
- Verifies `user_id` matches route owner
- Checks for active sessions using this route
- If active session exists: returns error "Cannot delete route with active session"
- DELETE from routes table (CASCADE handles machines/items)

**Output:**
```json
{
  "success": true,
  "deleted_route": "string",
  "message": "Route 'X' and all associated data deleted."
}
```

### 3.8 update_session_state — `ueDSi9SDBZ5jMwpO`

**Flow:** Webhook → Find Session → Prepare Update → Update Session → Return Output

**Key Logic:**
- Finds active session for user
- Updates session `status` field
- Simple PATCH operation

**Output:**
```json
{
  "success": true,
  "new_status": "string",
  "session_id": "uuid"
}
```

### 3.9 PDF Upload — `7kO6o1wASKvbhc2U`

**Flow:** Webhook → [Parallel: Fetch Profile + Upload Storage + Extract Text] → Parse PDF → Flatten Data → Respond Success → Delete Existing → Insert Route → Prepare Machines → Insert Machines → Prepare Items → Insert Items

**16 nodes — second most complex workflow**

**PDF Parser (critical — ~200 lines):**

```javascript
// State machine parser for Canteen/Compass PDF format
// Header pattern: Route | Location | Machine (AssetNumber) | ... | ID: xxx
// Item pattern: slot product_name quantity current/parlevel price None

// 3 item formats handled:
// 1. Single line: "A1 Product Name 5 10/20 1.50 None"
// 2. Slot + product on separate lines
// 3. Slot-only line followed by product line

// Duplicate handling: Same product name → sum quantities, range slots ("A1-A3")
```

**Key Logic:**
- Parallel processing at start for speed
- Uploads PDF to Supabase Storage bucket `route-pdfs`
- Extracts text from PDF (text extraction service)
- Parses text into structured data
- Flattens/deduplicates items
- Deletes existing route data if same name+date
- Inserts route → machines → items in sequence
- Uses `temp_id` → real UUID mapping for machine-item relationships

**Output:**
```json
{
  "route": "Route Name",
  "machines": 5,
  "items": 25,
  "date": "YYYY-MM-DD"
}
```

### 3.10 Stocker Auth — `cw0ERwaa1VXJ2Jah`

**Flow:** Webhook → Lookup User → Check Access → Respond

**Key Logic:**
- Simple auth verification
- Looks up user in profiles/account_users
- Returns access status

### 3.11 get_current_status — `PD3ErCuxWBWLFXIq` (INACTIVE)

**Already migrated to Edge Function:** `get-current-status-optimized`
**No migration needed.**

### 3.12 switch_route — `3G01u7N9REhrC9tn` (INACTIVE)

**15 nodes — NOT in frontend WEBHOOK_MAP**

**Flow:** Webhook → Prepare Input → Get Session → Extract Session → [IF Preserve Progress?] →
- YES: Prep Call → Call set_route_sequence → Format Output (Preserve)
- NO: Reset Machines → Get Machine IDs → Prep Item Reset → Reset Items → Prep Call → Call set_route_sequence → Format Output (Reset)

**Key Logic:**
- Delegates to `set_route_sequence` workflow internally
- If `preserve_progress=true`: just switches route, keeps progress
- If `preserve_progress=false`: resets all machines/items to pending first

**Not currently used by frontend. Evaluate if needed for Python migration.**

---

## 4. Layer 3: Edge Functions

### Summary Table

| # | Function | Purpose | Called By | JWT | Migrate? |
|---|----------|---------|-----------|-----|----------|
| 1 | `get-next-item-data` | Calls `get_next_item_and_increment` RPC | n8n workflow | Default | KEEP (used by n8n) |
| 2 | `get-next-item-atomic` | Deprecated direct-query version | Inactive | false | NO (deprecated) |
| 3 | `get-current-status-optimized` | Current stocking status | Frontend direct | false | KEEP |
| 4 | `set-route-sequence-optimized` | Inactive route setup | Inactive | Default | NO (inactive) |
| 5 | `check-subscription` | Stripe subscription check | Frontend (Billing) | false | NO CHANGE |
| 6 | `create-checkout` | Stripe checkout session | Frontend (Billing) | false | NO CHANGE |
| 7 | `customer-portal` | Stripe billing portal | Frontend (Billing) | false | NO CHANGE |
| 8 | `create-coupon` | Admin discount codes | Frontend (Admin) | Default | NO CHANGE |
| 9 | `calculate-usage` | Monthly usage metrics | Frontend (Usage) | false | NO CHANGE |
| 10 | `invite-team-member` | Team member invitation | Frontend (Team) | false | NO CHANGE |
| 11 | `update-subscription-quantity` | Stripe quantity sync | Internal (invite) | false | NO CHANGE |
| 12 | `stripe-webhook` | Stripe event handler | Stripe | Signature | NO CHANGE |

### Migration Impact

**Only 2 Edge Functions are part of the stocking flow:**
1. `get-next-item-data` — Used by n8n `get_next_item` workflow. In Python migration, this will be replaced by direct RPC call from Python endpoint.
2. `get-current-status-optimized` — Called directly from frontend. Will need Python equivalent OR keep as-is (already works without n8n).

**10 billing/team/admin Edge Functions: NO CHANGES NEEDED.**

---

## 5. Layer 4: Database

### 5.1 Core Tables

#### `sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → profiles |
| session_key | TEXT | NOT NULL |
| current_route_id | UUID | FK → routes |
| current_machine_id | UUID | FK → machines |
| pick_direction | TEXT | 'forward' or 'reverse' |
| status | TEXT | 'stocking', 'completed', 'paused' |
| delivery_date | DATE | |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Note:** `current_item_index` was REMOVED in migration `20260131`.

#### `machines`
| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | UUID | | PK |
| route_id | UUID | | FK → routes ON DELETE CASCADE |
| machine_name | TEXT | | NOT NULL |
| machine_number | INTEGER | | |
| location_name | TEXT | | |
| sequence | INTEGER | | NOT NULL, CHECK > 0 |
| status | TEXT | | CHECK IN ('pending', 'in_progress', 'completed', 'skipped') |
| total_items | INTEGER | | CHECK > 0, IMMUTABLE (trigger) |
| completed_items | INTEGER | 0 | NOT NULL, CHECK >= 0 AND <= total_items |
| skipped_at_item | INTEGER | NULL | CHECK 0 <= val <= total_items |
| route_name | TEXT | | |
| created_at | TIMESTAMPTZ | | |

**Triggers:**
- `enforce_total_items_immutable` — Prevents changes to total_items
- `auto_save_skip_progress` — When status='skipped', saves completed_items to skipped_at_item

#### `items`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| machine_id | UUID | FK → machines ON DELETE CASCADE |
| product_name | TEXT | NOT NULL |
| quantity | INTEGER | NOT NULL |
| slot | TEXT | |
| slot_spoken | TEXT | |
| sequence | INTEGER | NOT NULL |
| status | TEXT | |
| inventory_current | INTEGER | |
| inventory_parlevel | INTEGER | |
| machine_name | TEXT | |
| created_at | TIMESTAMPTZ | |

#### `routes`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | |
| route_name | TEXT | |
| delivery_date | DATE | |
| total_machines | INTEGER | |
| total_items | INTEGER | |
| driver_name | TEXT | |
| pdf_url | TEXT | |
| created_at | TIMESTAMPTZ | |

#### Other Tables (no migration impact)
- `profiles` — User profiles
- `accounts` — Team accounts with Stripe info
- `account_users` — User-account relationships with roles
- `route_assignments` — Route-driver assignments
- `discount_codes` — Promo codes
- `monthly_usage` — Usage metrics
- `user_keywords` — Per-user voice keyword learning
- `global_keywords` — Aggregated keyword data

### 5.2 Active RPC Functions

| RPC | Purpose | Used By | Locking |
|-----|---------|---------|---------|
| `get_next_item_and_increment` | Atomic read + calculate + increment | Edge Function `get-next-item-data` | FOR UPDATE on machines |
| `get_next_item_data` | Read-only session + items query | Legacy (superseded) | None |
| `increment_machine_items` | Atomic increment of completed_items | n8n workflows | Implicit row lock |
| `check_seat_availability` | Seat limit checking | Edge Function `invite-team-member` | FOR UPDATE on accounts |
| `upsert_user_keyword` | Keyword learning upsert | Frontend | None |
| `get_top_user_keywords` | Get user's top keywords | Frontend | None |
| `has_role` | Check user role | RLS policies | None |
| `get_user_account_id` | Get user's account | RLS policies | None |
| `can_view_all_routes` | Check route visibility | RLS/frontend | None |

### 5.3 RLS Status

| Table | RLS | Notes |
|-------|-----|-------|
| accounts | ENABLED | SELECT/UPDATE policies |
| account_users | ENABLED | 4 policies |
| profiles | **DISABLED** | Security risk (temp fix) |
| routes | **NOT ENABLED** | Security risk |
| machines | **NOT ENABLED** | Security risk |
| items | **NOT ENABLED** | Security risk |
| sessions | **NOT ENABLED** | Security risk |
| route_assignments | ENABLED | Admin-controlled |
| discount_codes | ENABLED | Public SELECT |
| monthly_usage | ENABLED | Own account |
| user_keywords | ENABLED | Own keywords |
| global_keywords | ENABLED | Auth read, service write |

---

## 6. Migration Mapping

### What Gets Python Endpoints

| n8n Workflow | Python Endpoint | Database Operations |
|-------------|----------------|---------------------|
| get_next_item | `POST /api/get-next-item` | RPC `get_next_item_and_increment` + UPDATE session |
| start_machine | `POST /api/start-machine` | SELECT session/machine/items + UPDATE machine status + UPDATE session |
| skip_current_machine | `POST /api/skip-machine` | SELECT session/machine + UPDATE machine (skipped) + SELECT next machine + UPDATE session |
| set_route_sequence | `POST /api/set-route-sequence` | SELECT routes (match) + UPSERT session + UPDATE other sessions (pause) + SELECT machines |
| go_back_to_skipped | `POST /api/go-back-to-skipped` | SELECT session + SELECT skipped machines + UPDATE machine status + UPDATE session |
| get_routes_for_date | `POST /api/get-routes` | SELECT routes + account_users (permissions) |
| delete_route | `POST /api/delete-route` | SELECT route (verify) + SELECT sessions (check active) + DELETE route |
| update_session_state | `POST /api/update-session` | SELECT session + UPDATE session |
| PDF Upload | `POST /api/upload-pdf` | Storage upload + text extraction + DELETE old + INSERT route/machines/items |
| Stocker Auth | `POST /api/auth` | SELECT profiles/account_users |

### What Stays As-Is

| Component | Reason |
|-----------|--------|
| `get-current-status-optimized` Edge Function | Already migrated from n8n, working well |
| All billing Edge Functions (6) | Not n8n, no change needed |
| `stripe-webhook` Edge Function | Stripe integration, no change |
| Voice system (Deepgram/TTS) | Cloudflare Workers, separate system |
| All direct Supabase queries | Frontend → DB, no n8n involved |
| All RPC functions | Keep as database-level logic |

---

## 7. Critical Business Logic to Port

### 7.1 Product Name Parsing

```python
def parse_product(name: str) -> dict:
    """Split 'Product Name 16oz' into {'name': 'Product Name', 'size': '16oz'}"""
    # Pattern: number + unit at end (oz, ml, L, pk, ct, lb)
    import re
    match = re.search(r'(\d+(?:\.\d+)?)\s*(oz|ml|L|pk|ct|lb|fl\s*oz)$', name.strip())
    if match:
        size = match.group(0).strip()
        product = name[:match.start()].strip()
        return {"name": product, "size": size}
    return {"name": name.strip(), "size": ""}
```

### 7.2 TTS Pronunciation Fixes

```python
TTS_FIXES = {
    "Bueno": "Bwayno",
    "Takis": "Tah-keez",
    "Dr ": "Doctor ",
    "Dr.": "Doctor",
    "oz": "ounce",
    "Açaí": "Ah-sah-ee",
    # ... complete list from n8n Code nodes
}

def fix_pronunciation(text: str) -> str:
    for original, replacement in TTS_FIXES.items():
        text = text.replace(original, replacement)
    return text
```

### 7.3 Slot Formatting for TTS

```python
def format_slot_spoken(slot: str) -> str:
    """'A1' → 'A 1', 'B12' → 'B 12'"""
    import re
    return re.sub(r'([A-Za-z])(\d)', r'\1 \2', slot)
```

### 7.4 PDF Text Parser (Most Complex)

~200 lines of parsing logic for Canteen/Compass vending PDF format:
- State machine with header/item detection
- 3 item format patterns
- Duplicate product flattening (sum quantities, range slots)
- Machine boundary detection

**This is the most critical piece to port accurately. Unit tests mandatory.**

### 7.5 Skip Phrase Randomization

```python
SKIP_PHRASES = [
    "Got it, skipping {machine}. Moving to {next} at {location}.",
    "No problem! We'll come back to {machine}. Next up: {next} at {location}.",
    "Skipping {machine}. Let's head to {next} at {location}.",
    "Sure thing! Moving on to {next} at {location}.",
    "Alright, we'll circle back to {machine}. On to {next} at {location}.",
]
```

### 7.6 Route Matching (Exact + Partial)

```python
def find_route(routes: list, route_name: str) -> dict:
    """Exact match first, then partial match"""
    # Exact match (case-insensitive)
    for r in routes:
        if r["route_name"].lower() == route_name.lower():
            return r
    # Partial match
    for r in routes:
        if route_name.lower() in r["route_name"].lower():
            return r
    return None
```

---

## 8. Known Issues & Technical Debt

### 8.1 Stale Code References

| Issue | Location | Impact |
|-------|----------|--------|
| `update_session_with_lock` references removed `current_item_index` | Migration SQL | Function will fail if called |
| `get-next-item-atomic` Edge Function references `current_item_index` | Edge Function | Deprecated, don't use |
| `set-route-sequence-optimized` writes `current_item_index: 0` | Edge Function | Column doesn't exist |
| `types.ts` missing columns | Frontend types | `completed_items`, `skipped_at_item`, `slot_spoken`, etc. |

### 8.2 Security Gaps

- RLS missing on: `routes`, `machines`, `items`, `sessions`
- `profiles` RLS disabled (temp fix for Teams page)
- No rate limiting on Edge Functions or n8n webhooks
- n8n webhooks are open (no auth header required)

### 8.3 Architecture Inconsistencies

- Item prefetch uses `/next-item` while main flow uses `/next-item-optimized` (different webhooks)
- `get_current_status` is the only tool using Edge Function directly while others use n8n
- Some workflows use `respondToWebhook` node, others use `lastNode` pattern

### 8.4 Items to Validate During Migration

1. 2-pick mode (`count=2`) handling in start_machine and get_next_item
2. `pendingMachineTransition` state management in frontend
3. Machine transition lock (`machineTransitionLockRef`)
4. Session persistence during page reload
5. Optimistic locking in `get_next_item_and_increment` RPC
6. PDF parser edge cases (multi-line items, duplicates)
7. Route matching (exact vs partial) behavior
8. Skip/unskip machine state transitions

---

## Appendix A: File Reference

### Frontend Files Affected by Migration

| File | Purpose | Changes Needed |
|------|---------|---------------|
| `src/hooks/useStockerAI.ts` | WEBHOOK_MAP, AI tools, API calls | Update WEBHOOK_MAP endpoints |
| `src/hooks/useStockerSession.ts` | Response parsing, state updates | None (contract preserved) |
| `src/hooks/useVoice.ts` | Voice system | None |
| `src/hooks/useItemCache.ts` | Item prefetch | Update endpoint URL |
| `src/config/api.ts` (NEW) | Backend switch config | Create for env var switch |
| `src/components/stocker/UploadTab.tsx` | PDF upload | Update endpoint URL |
| `src/pages/dashboard/UploadRoutes.tsx` | PDF upload | Update endpoint URL |

### n8n Workflow Files (for reference)

All 12 workflows documented above are on n8n Cloud at `visionairy.app.n8n.cloud`.

### Database Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260210_atomic_get_next_item_and_increment.sql` | Atomic RPC |
| `supabase/functions/get-next-item-data/index.ts` | Edge Function wrapper |
| `supabase/functions/get-current-status-optimized/index.ts` | Status Edge Function |
| `supabase/config.toml` | JWT verification settings |

---

## Appendix B: Complete OpenAI Chat Proxy Workflow

The n8n workflow for OpenAI chat is NOT in the WEBHOOK_MAP (it's called directly at `${N8N_BASE}/openai-chat`). This proxy forwards the request to OpenAI's API and returns the response.

**For Python migration:** This can be a simple proxy endpoint:
```python
@app.post("/api/openai-chat")
async def openai_chat(request: dict):
    response = await openai.chat.completions.create(**request)
    return response.model_dump()
```

Or better: make OpenAI calls directly from the frontend (remove the proxy entirely).

---

*Document generated by Claude Opus 4.6 analysis of complete StockerAI codebase, n8n workflows (via Synta MCP), Edge Functions, and database migrations.*
