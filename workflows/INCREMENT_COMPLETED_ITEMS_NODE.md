# New Node: Increment Completed Items

**Workflow:** get_next_item (Optimized) - ID: iykbFj7f9222PF7r

**Node Name:** "Increment Completed Items"

**Node Type:** HTTP Request

**Position in Flow:**
- AFTER: "Switch Action" (on "next_item" branch)
- BEFORE: "Merge All Paths"

## Configuration

### HTTP Request Settings

**Method:** PATCH

**URL:** `https://jgaglhywjrhfofbpbwxe.supabase.co/rest/v1/machines`

**Authentication:** Predefined Credential Type → Supabase API

**Query Parameters:**
- `id` = `eq.{{ $json.new_machine_id }}`

**Headers:**
```
Content-Type: application/json
Prefer: return=representation
```

**Body (JSON):**
```json
{
  "completed_items": "={{ $json.completed_items + $json.items_to_increment }}"
}
```

## Explanation

**What it does:**
- Updates machines table
- Sets `completed_items = completed_items + items_to_increment`
- `items_to_increment` is 1 (normal) or 2 (count=2 mode)

**Example:**
- Current: completed_items = 2
- User picks 1 item
- Update: completed_items = 2 + 1 = 3

**Contract compliance:**
- ✅ completed_items increments (0 → 1 → 2 → 3 → total_items)
- ✅ Per-machine (only updates current machine)
- ✅ Persistent (survives machine transitions)

## n8n UI Steps

1. **Add new node between "Switch Action" and "Merge All Paths":**
   - Drag "HTTP Request" node onto canvas
   - Name it: "Increment Completed Items"

2. **Connect nodes:**
   - Disconnect "Switch Action" output 1 from "Merge All Paths"
   - Connect "Switch Action" output 1 → "Increment Completed Items"
   - Connect "Increment Completed Items" → "Merge All Paths" input 1

3. **Configure HTTP Request:**
   - Method: PATCH
   - URL: `https://jgaglhywjrhfofbpbwxe.supabase.co/rest/v1/machines?id=eq.{{ $json.new_machine_id }}`
   - Authentication: Select existing Supabase credential
   - Send Body: Yes (JSON)
   - Body:
     ```json
     {
       "completed_items": "={{ $json.completed_items + $json.items_to_increment }}"
     }
     ```
   - Headers:
     - Content-Type: application/json
     - Prefer: return=representation

4. **Test:**
   - Execute workflow
   - Check database: `SELECT * FROM machines WHERE id = '<machine_id>'`
   - Verify completed_items incremented

## Alternative: Use RPC Function (Better Performance)

If you want better performance, create a Supabase RPC function:

```sql
CREATE OR REPLACE FUNCTION increment_machine_progress(
  p_machine_id UUID,
  p_increment INTEGER DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  completed_items INTEGER,
  total_items INTEGER,
  status TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE machines
  SET completed_items = completed_items + p_increment
  WHERE id = p_machine_id
  RETURNING machines.id, machines.completed_items, machines.total_items, machines.status INTO id, completed_items, total_items, status;

  RETURN NEXT;
END;
$$;
```

Then HTTP Request becomes:
- Method: POST
- URL: `https://jgaglhywjrhfofbpbwxe.supabase.co/rest/v1/rpc/increment_machine_progress`
- Body:
  ```json
  {
    "p_machine_id": "={{ $json.new_machine_id }}",
    "p_increment": "={{ $json.items_to_increment }}"
  }
  ```

## Verification

After deploying, test with:

```sql
-- Before picking item
SELECT completed_items FROM machines WHERE id = '<machine_id>';
-- Should show: 0

-- User says "next"

-- After picking item
SELECT completed_items FROM machines WHERE id = '<machine_id>';
-- Should show: 1

-- Pick 4 more items (total 5)

-- Check completion
SELECT completed_items, total_items FROM machines WHERE id = '<machine_id>';
-- Should show: completed_items = 5, total_items = 5
```
