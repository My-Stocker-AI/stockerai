# Stocker AI - Supabase Email Templates

All templates are ready to use in the Supabase dashboard at:
https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke/auth/templates

## Templates to Apply

### 1. Invite user
**File**: `supabase-invitation-email-template.html`
**Subject**: `{{ .Data.admin_name }} invited you to join their Stocker AI team`

### 2. Reset Password (Confirm password reset)
**File**: `supabase-password-reset-email-template.html`
**Subject**: `Reset your Stocker AI password`

### 3. Confirm signup
**File**: `supabase-confirm-signup-email-template.html`
**Subject**: `Confirm your Stocker AI account`

### 4. Magic Link
**File**: `supabase-magic-link-email-template.html`
**Subject**: `Sign in to Stocker AI`

### 5. Change Email Address (Confirm email change)
**File**: `supabase-change-email-template.html`
**Subject**: `Confirm your new email address for Stocker AI`

## How to Apply

For each template:
1. Go to the Supabase Auth Templates page (link above)
2. Select the template from the list
3. Paste the **Subject** into the subject field
4. Paste the **HTML** from the corresponding file into the body field
5. Click Save

## Features

All templates include:
- Embedded Stocker AI logo (base64 - always displays)
- Teal (#14b8a6) branded header
- Responsive design for mobile and desktop
- Clear call-to-action buttons
- Fallback text links for email clients that block buttons
- "Pick smarter. Stock faster." tagline in footer

## Variables Used

### Invite user template:
- `{{ .Data.admin_name }}` - Team admin who sent invitation
- `{{ .Data.admin_email }}` - Admin's email
- `{{ .Data.first_name }}` - Invited person's first name
- `{{ .Data.role }}` - Their role (team_member, primary_admin, etc.)
- `{{ .ConfirmationURL }}` - Invitation acceptance link

### All other templates:
- `{{ .ConfirmationURL }}` - Action link (reset password, confirm email, etc.)
