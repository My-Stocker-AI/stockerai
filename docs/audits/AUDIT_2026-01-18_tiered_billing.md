# System Impact Audit: Tiered Pro-Rated Billing

**Date:** 2026-01-18
**Author:** Claude Sonnet 4.5
**Scope:** Edge Function (update-subscription-quantity) + Stripe Integration
**Status:** ⚠️ INCOMPLETE IMPLEMENTATION DISCOVERED

---

## Proposed Change

Add automatic pro-rated billing when team members added/removed mid-month, with tiered pricing:
- 2-5 drivers: $20/driver/month
- 6-20 drivers: $18/driver/month
- 21-50 drivers: $15/driver/month

---

## DISCOVERED COMPLEXITY (User-Identified)

**Business Rule NOT in Initial Implementation:**
- **Mid-month additions:** New user gets NEW tier rate immediately
- **Existing users:** Stay at OLD tier rate until next billing cycle (NOT retroactive)
- **Mid-month removals:** Need credit handling + tier change logic
- **Same-month add+remove:** Edge case handling needed

**Current Implementation Problem:**
```typescript
// This updates ALL drivers to SAME price
const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
  items: [{
    id: subscriptionItem.id,
    quantity: driverCount, // ← Applies ONE price to ALL units
  }],
  proration_behavior: 'always_invoice', // ← Prorates ALL seats at SAME rate
});
```

**This CANNOT handle:**
- Different users at different tier rates simultaneously
- Non-retroactive tier changes for existing users

---

## Scenario Analysis

### Scenario A: Simple Addition (5 → 6 drivers mid-month)

**Current State:**
- 5 drivers @ $20/each = $100/month
- Subscription created on Day 1

**Event (Day 15):**
- Add 6th driver

**Expected Behavior:**
- **Existing 5 drivers:** Stay @ $20/each until renewal (Day 1 next month)
- **New 6th driver:** Charged $18 × (15/30) = $9 for remaining 15 days
- **Next billing cycle:** All 6 @ $18/each = $108/month

**Current Implementation Behavior:**
- ❌ Updates subscription quantity to 6
- ❌ Stripe applies $20 (current price) × 6 = $120/month
- ❌ Prorates the ENTIRE subscription at old rate
- ❌ Does NOT change tier pricing mid-month

**Problem:** No mechanism to:
1. Apply different rates to different users
2. Track which users are at which tier rate
3. Schedule tier change for next billing cycle

---

### Scenario B: Mid-Month Removal (6 → 5 drivers)

**Current State:**
- 6 drivers @ $18/each = $108/month

**Event (Day 15):**
- Remove 1 driver

**Expected Behavior:**
- **Credit:** 15 days × ($18/30) = $9 credit for removed driver
- **Remaining 5 drivers:** Stay @ $18 until renewal
- **Next billing cycle:** Tier changes to 5 drivers → $20/each = $100/month (PRICE INCREASE)

**Current Implementation Behavior:**
- ✅ Would create credit for removed driver
- ❌ Does NOT handle tier change at renewal
- ❌ No mechanism to track that tier should change next month

**Problem:** Tier changes can go UP (fewer drivers = higher per-driver cost)

---

### Scenario C: Same-Month Add Then Remove (5 → 6 → 5)

**Current State:**
- 5 drivers @ $20/each = $100/month

**Event Timeline:**
- Day 10: Add 6th driver
- Day 20: Remove that 6th driver

**Expected Behavior:**
- **6th driver:** Charged for 10 days @ $18
- **Other 5 drivers:** Stay @ $20/each (no tier change because returned to 5)
- **Next billing cycle:** Still 5 @ $20 = $100/month

**Current Implementation Behavior:**
- ❌ Two separate proration events
- ❌ May double-tier-change or miss tier change
- ❌ Complex state tracking needed

**Problem:** Multiple mutations in same billing period

---

### Scenario D: Multiple Tier Jump (5 → 22 drivers)

**Current State:**
- 5 drivers @ $20/each = $100/month

**Event (Day 15):**
- Add 17 drivers (total = 22)

**Expected Behavior (AMBIGUOUS - Need User Clarification):**

**Option 1: Only New Users Get New Tier**
- Existing 5: Stay @ $20 until renewal
- New 17: Charged @ $15 for 15 days
- Next month: All 22 @ $15 = $330/month

**Option 2: Tier Jump Applies to All**
- All 22 immediately @ $15
- Prorate the difference for existing 5 (refund $5 × 5 × 15/30)
- Next month: All 22 @ $15 = $330/month

**Current Implementation:**
- ❌ Cannot handle either option correctly
- ❌ Would charge all 22 at old price ($20) then prorate

**Problem:** Business rule ambiguity on bulk additions crossing tier boundaries

---

## Stripe Capabilities/Limitations

### Limitation 1: Single Price Per Subscription Item
- Subscription item has ONE price (e.g., price_1234_driver_tier1_20dollars)
- `quantity` applies that SAME price to ALL units
- **Cannot** have 5 users @ $20 and 1 user @ $18 on same subscription item

### Limitation 2: Proration Applies to Quantity Delta
- Adding 1 driver: Prorates for new quantity (6 × price × days_remaining / days_in_period)
- Does NOT support "different price for different units"

### Limitation 3: Price Changes Apply to All Units
- Changing subscription item price affects ALL quantity units
- Cannot selectively apply price to subset

### Workaround Options

**Option A: Multiple Subscription Items (Complex)**
```
Subscription has:
- subscription_item_1: 5 × price_tier1_20dollars
- subscription_item_2: 1 × price_tier2_18dollars
```
**Pros:** Accurate per-user pricing
**Cons:** Complex management, need to track which users in which item

**Option B: Defer Tier Changes to Renewal (Simpler)**
```
Mid-month: Keep old tier price, add/remove at old rate
Renewal: Calculate new tier, update price, reset quantity
```
**Pros:** Simple, matches "existing users keep rate until renewal"
**Cons:** New users overpay/underpay until renewal

**Option C: Manual Invoicing (Most Flexible)**
```
Disable auto-billing
Create invoice line items per user
Full control over pricing
```
**Pros:** Complete control
**Cons:** Loses Stripe automation, more complex

**Option D: Track Tier Changes, Apply at Renewal (Recommended)**
```
Database tracks:
- user_added_at (timestamp)
- billing_tier_at_add (integer: 20, 18, or 15)

Mid-month mutations:
- Add user: Charge at CURRENT tier price, log add date
- Remove user: Credit at CURRENT tier price

Renewal webhook:
- Calculate new tier based on current driver count
- Update subscription price to new tier price
- Reset proration anchor
```
**Pros:** Balances simplicity and accuracy
**Cons:** Requires webhook handling, database state

---

## Required Data Tracking

### Database Schema Addition

**Table:** `account_users`

**New Columns:**
```sql
ALTER TABLE account_users ADD COLUMN billing_tier_at_add INTEGER NULL; -- 20, 18, or 15
ALTER TABLE account_users ADD COLUMN added_to_billing_at TIMESTAMPTZ NULL;
ALTER TABLE account_users ADD COLUMN removed_from_billing_at TIMESTAMPTZ NULL;
```

**Why:**
- Track what tier user was added at
- Calculate prorated charges accurately
- Handle mid-month add/remove correctly

---

## Recommended Implementation

### Phase 1: Simple Add/Remove (No Mid-Month Tier Changes)

**Rule:** Mid-month mutations stay at current tier price, tier changes at renewal

```typescript
// update-subscription-quantity.ts
async function updateSubscriptionQuantity(accountId: string) {
  // 1. Count current drivers
  const driverCount = await countActiveDrivers(accountId);

  // 2. Get current subscription
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentPrice = subscription.items.data[0].price.unit_amount / 100; // e.g., 20, 18, 15

  // 3. Update quantity (SAME price)
  await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      quantity: driverCount,
    }],
    proration_behavior: 'always_invoice', // Prorate at CURRENT price
  });

  // 4. Check if tier SHOULD change at next renewal
  const newTierPrice = getTierPrice(driverCount); // 20, 18, or 15

  if (newTierPrice !== currentPrice) {
    // Schedule price change at next renewal
    await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: getPriceId(newTierPrice), // price_tier2_18dollars, etc.
      }],
      proration_behavior: 'none', // Don't prorate the price change
      billing_cycle_anchor: 'unchanged', // Wait for renewal
    });
  }
}
```

**Behavior:**
- ✅ Add driver mid-month: Charged at current tier price (not new tier)
- ✅ Remove driver mid-month: Credited at current tier price
- ✅ Tier change: Applied at next billing cycle
- ✅ Handles same-month add+remove correctly (no tier change)

**Trade-off:**
- New users may overpay (added to 5-driver account, charged $20 not $18) until renewal
- Acceptable for simplicity?

---

### Phase 2: Advanced (Different Rates for New vs Existing)

**Requires:**
- Multiple subscription items OR
- Manual invoicing with line items per user

**Complexity:** High
**Benefit:** Accurate per-user pricing from day 1
**Recommend:** Only if Phase 1 insufficient

---

## Testing Plan

### Test 1: Add Driver (5 → 6) Mid-Month
1. Create account with 5 drivers @ $20/each
2. On day 15, add 6th driver
3. Verify:
   - Prorated charge created for 6th driver @ $20 (current price, not $18)
   - Subscription quantity = 6
   - Subscription price = $20/driver (unchanged until renewal)
4. Wait for renewal
5. Verify:
   - Subscription price changes to $18/driver
   - All 6 drivers now @ $18

### Test 2: Remove Driver (6 → 5) Mid-Month
1. Create account with 6 drivers @ $18/each
2. On day 15, remove 1 driver
3. Verify:
   - Credit created for removed driver @ $18
   - Subscription quantity = 5
   - Subscription price = $18/driver (unchanged until renewal)
4. Wait for renewal
5. Verify:
   - Subscription price changes to $20/driver (tier UP)
   - 5 drivers now @ $20

### Test 3: Same-Month Add+Remove (5 → 6 → 5)
1. Start with 5 @ $20
2. Day 10: Add 6th driver
3. Day 20: Remove that driver
4. Verify:
   - Two proration events (charge + credit)
   - Subscription returns to 5 drivers
   - Price stays at $20
5. Wait for renewal
6. Verify:
   - No tier change (still 5 @ $20)

### Test 4: Tier Jump (5 → 22) Mid-Month
1. Start with 5 @ $20
2. Add 17 drivers mid-month
3. Verify:
   - Prorated charge for 17 × $20 (current price)
   - Subscription quantity = 22
   - Price stays at $20 until renewal
4. Wait for renewal
5. Verify:
   - Price changes to $15/driver
   - All 22 @ $15

---

## Rollback Plan

**If billing logic breaks:**

1. **Immediate:** Disable `update-subscription-quantity` Edge Function
2. **Revert:** Remove calls from `invite-team-member` Edge Function
3. **Manual:** Admin manually updates Stripe subscriptions via dashboard
4. **Database:** Remove new columns if added

**Data Recovery:**
- Stripe retains full proration/invoice history
- Can manually credit/charge customers if errors occur

---

## Risk Assessment

**Severity:** HIGH
- Incorrect billing damages customer trust
- Overcharging = refunds + frustration
- Undercharging = lost revenue

**Likelihood:** HIGH (current implementation is incomplete)

**Justification:**
- Current implementation does NOT handle non-retroactive tier changes
- Stripe limitations not accounted for
- Multiple edge cases not tested

**Mitigation:**
1. HALT DEPLOYMENT of current implementation
2. Implement Phase 1 (simple, correct)
3. Test all 4 scenarios before production
4. Monitor first 10 customers closely
5. Have manual override process ready

---

## Questions for User

**Q1:** For mid-month additions that trigger tier change (5 → 6), should new user pay:
- **Option A:** Current tier price ($20) until renewal, then $18? (simpler)
- **Option B:** New tier price ($18) immediately? (complex, requires multiple subscription items)

**Q2:** For same-month add+remove, if they briefly cross tier boundary, should tier change?
- **Example:** 5 drivers, add 1 (6 total), remove 1 (5 total) - still 5 at end of month
- **Option A:** No tier change (ends where it started)
- **Option B:** Tier changes at renewal (crossed 6 boundary)

**Q3:** Acceptable to charge new users at OLD tier price until renewal?
- **Trade-off:** Simplicity vs accuracy
- **Impact:** New user on 5-driver account pays $20 not $18 for first partial month

**Q4:** Should removals trigger immediate tier changes or wait for renewal?
- **Example:** 6 → 5 drivers mid-month
- **Option A:** Tier changes at renewal (simpler)
- **Option B:** Immediate tier change (may increase price mid-month)

---

## Approval Checklist

- [ ] All 4 scenarios tested
- [ ] User clarifies business rules (Q1-Q4)
- [ ] Stripe price IDs created for each tier
- [ ] Database schema updated
- [ ] Webhook handler for renewal events
- [ ] Manual override process documented
- [ ] First 10 customers monitored

**Audit Complete:** 2026-01-18
**Proceed with implementation:** ⚠️ NO - Requires user clarification on business rules
