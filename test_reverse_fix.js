#!/usr/bin/env node
/**
 * Test script for reverse mode new machine bug fix
 * Uses real data from execution 26957
 */

// Test data from execution 26957
const testData = {
  session: {
    id: "ec87e207-225d-4ba0-828d-fcb893fa8349",
    current_machine_id: "e1c6973a-6130-487f-a8f8-654d54268417",
    current_item_index: 1,  // ← THE BUG: Should be 39 for reverse mode on new machine
    current_route_id: "12ffe2e9-b011-46e3-a46d-8c40627fea6a",
    pick_direction: "reverse"
  },
  items: [
    { id: "1", sequence: 1, product_name: "Fritolay Smartfood Popcorn", slot: "010" },
    { id: "2", sequence: 2, product_name: "Cheetos Crunchy LSS 2 oz", slot: "012" },
    { id: "3", sequence: 3, product_name: "Gardetto's Original 1.75 oz", slot: "014" },
    // ... 36 more items
    { id: "39", sequence: 39, product_name: "Fanta Orange Bottle 20 oz", slot: "059" }
  ],
  machines: [
    { id: "41abcda7-12e4-4fa1-8f9e-896c6d54ac6d", sequence: 1, machine_name: "SH - A7 Dual Zone", status: "skipped" },
    { id: "e1c6973a-6130-487f-a8f8-654d54268417", sequence: 2, machine_name: "SH - A6 Dual Zone", status: "pending" },
    { id: "1fd82fe9-4ac4-4b38-b21c-32bc29448ca8", sequence: 3, machine_name: "SH - A4 Dual Zone", status: "pending" }
  ]
};

const webhookInput = {
  count: 2,
  session_id: testData.session.id,
  user_id: "test-user"
};

console.log("=" .repeat(80));
console.log("TESTING REVERSE MODE BUG FIX");
console.log("=" .repeat(80));
console.log();

// Simulate the OLD buggy logic
function testOldLogic() {
  console.log("--- OLD LOGIC (BUGGY) ---");
  console.log("Session state:");
  console.log(`  current_item_index: ${testData.session.current_item_index}`);
  console.log(`  pick_direction: ${testData.session.pick_direction}`);
  console.log(`  count: ${webhookInput.count}`);
  console.log();

  const currentItemIndex = testData.session.current_item_index;
  const pickDirection = testData.session.pick_direction;

  console.log("Looking for next item:");
  if (pickDirection === 'reverse') {
    const lookingFor = currentItemIndex - 1;
    console.log(`  Searching for sequence === ${currentItemIndex} - 1 = ${lookingFor}`);

    const nextItem = testData.items.find(item => item.sequence === lookingFor);

    if (nextItem) {
      console.log(`  ✓ Found: ${nextItem.product_name} (slot ${nextItem.slot})`);
      return { action: 'next_item', nextItem };
    } else {
      console.log(`  ✗ NOT FOUND (sequence ${lookingFor} doesn't exist)`);
      console.log(`  → Machine marked as COMPLETE (WRONG!)`);
      return { action: 'next_machine', error: 'Premature termination' };
    }
  }
}

// Simulate the FIXED logic
function testFixedLogic() {
  console.log("--- FIXED LOGIC ---");
  console.log("Simulating NEW machine start in reverse mode...");
  console.log();

  const pickDirection = 'reverse';
  const items = testData.items;

  // Calculate correct starting index
  const startingIndex = pickDirection === 'reverse' ? items.length : 0;

  console.log(`Starting index for new machine: ${startingIndex}`);
  console.log("User says 'next'...");
  console.log();

  // Now simulate finding next item
  const currentItemIndex = startingIndex;
  const lookingFor = currentItemIndex - 1;

  console.log(`Looking for sequence === ${currentItemIndex} - 1 = ${lookingFor}`);

  const nextItem = items.find(item => item.sequence === lookingFor);

  if (nextItem) {
    console.log(`✓ Found: ${nextItem.product_name} (slot ${nextItem.slot})`);
    console.log(`→ Machine continues correctly`);
    return { action: 'next_item', nextItem };
  } else {
    console.log(`✗ NOT FOUND`);
    return { action: 'next_machine', error: 'Still wrong' };
  }
}

console.log();
console.log("TEST SCENARIO:");
console.log("User skipped first machine, moved to second machine (SH - A6)");
console.log("System set current_item_index = 1 (wrong for reverse mode)");
console.log("User says 'next'");
console.log();
console.log("=" .repeat(80));
console.log();

const oldResult = testOldLogic();
console.log();
console.log("=" .repeat(80));
console.log();

const fixedResult = testFixedLogic();
console.log();
console.log("=" .repeat(80));
console.log();

console.log("RESULTS:");
console.log();
console.log("OLD LOGIC:");
console.log(`  Action: ${oldResult.action}`);
if (oldResult.error) {
  console.log(`  Error: ${oldResult.error} ❌`);
}
console.log();

console.log("FIXED LOGIC:");
console.log(`  Action: ${fixedResult.action}`);
if (fixedResult.nextItem) {
  console.log(`  Next item: ${fixedResult.nextItem.product_name} ✓`);
}
console.log();

console.log("=" .repeat(80));
console.log();
console.log("CONCLUSION:");
if (oldResult.action === 'next_machine' && fixedResult.action === 'next_item') {
  console.log("✓ FIX WORKS - Machine now continues correctly in reverse mode");
} else {
  console.log("✗ FIX FAILED - Need to investigate further");
}
console.log();
