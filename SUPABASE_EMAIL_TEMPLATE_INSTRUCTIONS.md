# Supabase Email Template Configuration

## ⚠️ IMPORTANT: Manual Configuration Required

The email template HTML files exist in this repository, but they must be manually applied in the Supabase Dashboard.

## Step-by-Step Instructions

### 1. Access Supabase Email Templates

Go to: https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke/auth/templates

Or navigate:
1. Open Supabase Dashboard
2. Select your project: "wvtkuposrlvadyeixlke"
3. Go to: Authentication → Email Templates

---

### 2. Apply Invite User Template

**Template Name:** Invite user

**Subject Line:**
```
{{ .Data.admin_name }} invited you to join their Stocker AI team
```

**HTML Body:**
1. Open file: `/home/visionairy/StockerAI/supabase-invitation-email-template.html`
2. Copy the ENTIRE contents (it's a large file with embedded logo)
3. Paste into the "Message Body" field in Supabase
4. Click "Save"

**Template Variables Used:**
- `{{ .Data.admin_name }}` - Name of admin who sent invite
- `{{ .Data.admin_email }}` - Admin's email
- `{{ .Data.first_name }}` - Invited person's first name
- `{{ .Data.role }}` - Their role (driver, primary_admin)
- `{{ .ConfirmationURL }}` - Invitation acceptance link

**Redirect URL Configuration:**
- The Edge Function sets: `redirectTo: "https://my-stocker-ai.com/auth/callback?type=invite"`
- AuthCallback.tsx handles the routing to /set-password

---

### 3. Verify Other Templates (Optional)

Apply the following templates if needed:

| Template | File | Subject |
|----------|------|---------|
| **Confirm signup** | `supabase-confirm-signup-email-template.html` | Confirm your Stocker AI account |
| **Reset password** | `supabase-password-reset-email-template.html` | Reset your Stocker AI password |
| **Magic Link** | `supabase-magic-link-email-template.html` | Sign in to Stocker AI |
| **Change Email** | `supabase-change-email-template.html` | Confirm your new email address for Stocker AI |

---

### 4. Test Email Delivery

After applying the template:

1. Send a test invite (see TEST_PLAN.md)
2. Check the email you receive
3. Verify:
   - ✅ Subject shows admin name (not "()")
   - ✅ Body shows "Hi {FirstName}" (not "Hi")
   - ✅ Admin name and email are correct
   - ✅ Role is displayed correctly
   - ✅ Button says "Accept Invitation"
   - ✅ Link redirects to /auth/callback?type=invite

---

### 5. Troubleshooting

**Email shows "()" for admin name:**
- Admin's profile has empty strings for first_name/last_name
- Edge Function should fall back to "Your Team Admin" (check line 73 in supabase/functions/invite-team-member/index.ts)

**Email goes to spam:**
- Supabase uses their own SMTP by default
- Consider configuring custom SMTP (Settings → Auth → SMTP Settings)

**Link goes to /login instead of /set-password:**
- Check AuthCallback.tsx is deployed (should be in latest build)
- Verify `type=invite` query parameter is present in URL
- Check browser console for errors

**Template variables not rendering:**
- Ensure you're using Supabase's template syntax: `{{ .Data.variable_name }}`
- Verify Edge Function is sending the data in the `data` field of `inviteUserByEmail()`

---

## Current Template Status

✅ **Template files exist in repository:**
- supabase-invitation-email-template.html
- supabase-password-reset-email-template.html
- supabase-confirm-signup-email-template.html
- supabase-magic-link-email-template.html
- supabase-change-email-template.html

⚠️ **Manual step required:**
- Templates must be copy/pasted into Supabase Dashboard
- Cannot be automated via API

✅ **Edge Function configured correctly:**
- Sends all required data fields
- Sets redirectTo with type=invite parameter
- Falls back to "Your Team Admin" if names are empty

---

## Next Steps

1. [ ] Apply invitation template in Supabase Dashboard
2. [ ] Test invite flow end-to-end (see TEST_PLAN.md)
3. [ ] Verify email received with correct formatting
4. [ ] Confirm redirect to /set-password works
5. [ ] Apply other templates as needed
