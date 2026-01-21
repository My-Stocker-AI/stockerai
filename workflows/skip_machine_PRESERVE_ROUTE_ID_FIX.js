// FIX: skip_current_machine workflow - Preserve current_route_id
// Bug: Session updates were losing current_route_id, causing database queries to fail
// Workflow: ElCSMeguJNxwp0HO
// Node: "Prepare Session Update"
//
// CRITICAL: This is the root cause of both production bugs:
// 1. Last item gets stuck (route_id NULL → no items returned)
// 2. Premature completion after skip (route_id NULL → empty results)

var data = $input.first().json;
var session = $('Extract Session').first().json;  // FIX: Get session for route_id

var updateData = {
  current_item_index: 1,
  current_route_id: session.current_route_id  // FIX: PRESERVE route_id
};

if (data.next_machine_id) {
  updateData.current_machine_id = data.next_machine_id;
} else {
  updateData.status = 'completed';
}

return [{
  json: {
    session_id: data.session_id,
    update: updateData,
    process_data: data
  }
}];
