# Reset Route Workflow

**Workflow Name:** `reset_route`
**Webhook Path:** `/reset-route`
**Method:** POST

## Purpose
Resets all progress on the current route so user can start fresh without deleting and re-adding the route.

## Request Body
```json
{
  "route_id": "uuid",
  "session_id": "session_xxx"
}
```

## Workflow Logic

1. **Webhook Trigger** - Receives route_id and session_id

2. **Reset Items** - SQL Query
```sql
UPDATE items
SET status = 'pending'
WHERE route_id = '{{ $json.body.route_id }}'
RETURNING *;
```

3. **Reset Session** - SQL Query
```sql
UPDATE sessions
SET
  current_item_index = 0,
  status = 'pending',
  updated_at = NOW()
WHERE
  current_route_id = '{{ $json.body.route_id }}'
  AND user_id = (SELECT user_id FROM routes WHERE id = '{{ $json.body.route_id }}')
RETURNING *;
```

4. **Get First Machine** - SQL Query
```sql
SELECT id, machine_name, location_name, sequence
FROM machines
WHERE route_id = '{{ $json.body.route_id }}'
ORDER BY sequence ASC
LIMIT 1;
```

5. **Format Response**
```javascript
return [{
  json: {
    success: true,
    message: 'Route reset successfully',
    route_id: $('Webhook').first().json.body.route_id,
    first_machine_id: $('Get First Machine').first().json.id,
    first_machine_name: $('Get First Machine').first().json.machine_name
  }
}];
```

## Response
```json
{
  "success": true,
  "message": "Route reset successfully",
  "route_id": "uuid",
  "first_machine_id": "uuid",
  "first_machine_name": "Machine Name"
}
```

## Frontend Integration
- Call this workflow when user clicks "Reset Route" button
- Clear local session state (IndexedDB)
- Reset RouteState to initial values
- Show confirmation before resetting

## Testing
1. Complete several items on a route
2. Click "Reset Route"
3. Confirm all items are back to pending
4. Verify session is at beginning
5. Can start route again from scratch
