// =============================================================================
// skip_current_machine workflow - "Prepare Session Update" node
// FIX: Set current_item_index = 0 when moving to new machine
// =============================================================================

var data = $input.first().json;
var session = $('Extract Session').first().json;

var updateData = {
  current_item_index: 0,  // ← FIX: Was hardcoded to 1, should be 0 for new machine
  current_route_id: session.current_route_id
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
