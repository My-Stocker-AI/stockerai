// =============================================================================
// go_back_to_skipped workflow → Format Success node (CONTRACT FIX)
// FIX: Add machine_id and machine_name to match frontend contract
// Date: 2026-02-08
// =============================================================================
// Frontend expects (useStockerSession.ts:539-548):
//   result.machine_id → used to update currentMachineId
//   result.machine_name → used to update currentMachineName
//
// Without these fields, frontend can't sync state after returning to skipped machine
// =============================================================================

var checkData = $('Check Skipped').first().json;
var itemData = $input.first().json;

function formatSlotForTTS(slot) {
  if (!slot) return null;
  slot = String(slot);
  if (slot.indexOf('-') !== -1) {
    var parts = slot.split('-');
    var first = parseInt(parts[0], 10);
    var second = parseInt(parts[1], 10);
    return 'slots ' + first + ' and ' + second;
  }
  return 'slot ' + parseInt(slot, 10);
}

var items = [];
if (Array.isArray(itemData)) {
  items = itemData;
} else if (itemData && typeof itemData === 'object' && itemData.id) {
  items = [itemData];
}

var item = items.length > 0 ? items[0] : {};

return [{
  json: {
    success: true,
    machine_id: checkData.target_machine_id,        // ← FIX: Frontend needs this
    machine_name: checkData.target_machine_name,    // ← FIX: Frontend needs this
    returned_to_machine: checkData.target_machine_name,  // Keep for backward compat
    machine_number: checkData.target_machine_number,
    location: checkData.target_location,
    first_item: item.product_name || null,
    first_quantity: item.quantity || null,
    slot: item.slot || null,
    slot_spoken: formatSlotForTTS(item.slot),
    remaining_skipped: checkData.skipped_count - 1
  }
}];
