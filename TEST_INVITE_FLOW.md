# Test Team Invite Flow - Browser Console Test
**Run this in your browser while logged into my-stocker-ai.com**

---

## Quick Test (Copy-Paste into Browser Console)

### Step 1: Open Browser Console
1. Go to: https://my-stocker-ai.com/dashboard/team
2. Press **F12** (or right-click → Inspect)
3. Click **Console** tab

### Step 2: Run This Test Script

Copy-paste this entire block into the console and press Enter:

```javascript
// Test the Supabase Edge Function for team invites
(async function testInvite() {
  console.log('🧪 Starting team invite test...');

  try {
    // Get Supabase client from the page
    const { createClient } = window.supabase || {};
    if (!createClient) {
      console.error('❌ Supabase client not found on page');
      return;
    }

    const supabase = createClient(
      'https://wvtkuposrlvadyeixlke.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dGt1cG9zcmx2YWR5ZWl4bGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxNTEwNzcsImV4cCI6MjA1MDcyNzA3N30.ksY4LXqfmgJ8XTIiBmzBaWTcbMGIkn1r_dT98rL0Vnc'
    );

    console.log('✅ Supabase client initialized');

    // Test data
    const testData = {
      email: 'test-' + Date.now() + '@example.com', // Unique email
      first_name: 'Test',
      last_name: 'User',
      account_id: '6ed5d948-479c-466a-8c95-67246c821e66',
      role: 'driver',
      can_view_all_routes: false
    };

    console.log('📤 Sending invite request...', testData);

    // Call the Edge Function
    const { data, error } = await supabase.functions.invoke('invite-team-member', {
      body: testData
    });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('✅ Success!', data);

    // Verify the response structure
    if (data.success) {
      console.log('✅ Invite successful!');
      console.log('   User:', data.user);
      console.log('   Seat info:', data.seat_info);
    } else {
      console.error('❌ Invite failed:', data.error);
    }

  } catch (err) {
    console.error('❌ Test failed:', err);
  }
})();
```

---

## What You Should See:

### ✅ Success Output:
```
🧪 Starting team invite test...
✅ Supabase client initialized
📤 Sending invite request... { email: "test-...", ... }
✅ Success! { success: true, ... }
✅ Invite successful!
   User: { id: "...", email: "test-...", first_name: "Test", ... }
   Seat info: { total_seats: 999, used_seats: 1, available_seats: 998 }
```

### ❌ If You See Errors:

**"No authorization header provided"**
- You're not logged in
- Solution: Login at https://my-stocker-ai.com/login first

**"Only admins can invite team members"**
- Your account is not a primary_admin
- Solution: Make sure you're logged in as the account owner

**"Supabase client not found"**
- Wrong page
- Solution: Make sure you're on https://my-stocker-ai.com/dashboard/team

---

## Alternative: Test Via UI (Easier)

If the console test is confusing, just:

1. Go to: https://my-stocker-ai.com/dashboard/team
2. Click "Invite Team Member"
3. Fill in:
   - Email: test@example.com
   - First Name: David
   - Last Name: Spencer
   - Role: Driver
4. Click "Invite"

**Look for:**
- ✅ Success message appears
- ✅ User shows up in list
- ✅ No errors in console (F12 → Console tab)

---

## Verify It's Using Supabase (Not n8n)

While inviting:
1. Open DevTools (F12)
2. Click **Network** tab
3. Invite someone
4. Look for: `invite-team-member` request
5. Should go to: `supabase.co/functions/v1/invite-team-member`
6. Should NOT go to: `n8n.cloud/webhook`

---

## What This Tests:

- ✅ Edge Function deployed correctly
- ✅ Authentication working
- ✅ Seat availability check (RPC function)
- ✅ User creation/update
- ✅ Frontend → Supabase integration
- ✅ NOT using n8n anymore

---

**Try either the console test OR the UI test and let me know what happens!**
