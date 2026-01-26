// =============================================================================
// get_next_item workflow - "Add First Item to Machine" node
// FIX: Read correct field name (next_machine not next_machine_name)
// =============================================================================

var stateData = $('Switch Action').first().json;

return [{
  json: {
    action: stateData.action,
    completed_machine: stateData.completed_machine,
    completed_location: stateData.completed_location,
    next_location: stateData.next_location,
    next_machine: stateData.next_machine,  // ← FIX: Was next_machine_name
    next_machine_number: stateData.next_machine_number,
    new_item_index: stateData.new_item_index,
    new_machine_id: stateData.new_machine_id,
    new_route_id: stateData.new_route_id,
    session_record_id: stateData.session_record_id,
    machine_complete: stateData.machine_complete,
    route_complete: stateData.route_complete,
    session_complete: stateData.session_complete
  }
}];
