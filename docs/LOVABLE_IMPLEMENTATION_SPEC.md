# Stocker AI Marketing Site - Lovable Implementation Spec

**Created:** 2025-12-28
**Purpose:** Sequential prompts for building marketing site + customer dashboard in Lovable

---

## Tech Stack Constraints (Include in Every Prompt)

```
Tech Stack:
- React + TypeScript
- Tailwind CSS for styling
- Supabase for auth and database (EXISTING - connect to it)
- Stripe for payments
- Mobile-first responsive design
```

---

## Design System (Include in Prompt 1, Reference Throughout)

**TARGET AUDIENCE:** Mid-market vending operators (5-50 drivers). Traditional industry, not tech-savvy. They need to feel TRUST, SIMPLICITY, and ROI. Design should feel like a reliable business partner, not a trendy tech startup.

**Brand Colors:**
```
Primary CTA: #4ecca3 (teal - CTAs, buttons, highlights)
Primary CTA Hover: #3db892 (darker teal)
Trust Blue: #3b82f6 (links, info icons, secondary elements)
Trust Blue Dark: #1e40af (headings that need emphasis)
Success: #22c55e
Warning: #f59e0b
Error: #ef4444
```

**Marketing Site (Light Theme - TRUST-FOCUSED):**
```
Background: #ffffff (white - clean, professional)
Background Alt: #f8fafc (slate-50 - section breaks)
Text Primary: #1e293b (slate-800 - readable, not harsh)
Text Secondary: #64748b (slate-500 - supporting text)
Text Muted: #94a3b8 (slate-400 - captions, labels)
Border: #e2e8f0 (slate-200)
Card Background: #ffffff with shadow-sm
```

**Customer Dashboard (Dark Theme - matches PWA for continuity):**
```
Background: #0d1117
Background Secondary: #161b22
Text Primary: #e6edf3
Text Secondary: #7d8590
Border: rgba(48, 54, 61, 0.6)
Card: rgba(22, 27, 34, 0.8)
Primary Accent: #4ecca3 (same teal)
```

**Typography:**
```
Font Family: 'Inter', system-ui, -apple-system, sans-serif
Hero Headline: text-5xl md:text-6xl font-bold tracking-tight text-slate-900
Section Headline: text-3xl md:text-4xl font-bold tracking-tight text-slate-900
Subheadline: text-xl text-slate-600 leading-relaxed
Body: text-base text-slate-600 leading-relaxed
Small/Caption: text-sm text-slate-500
```

**Button Styles (Conversion-Optimized):**
```
Primary CTA: bg-[#4ecca3] text-white hover:bg-[#3db892] font-semibold px-8 py-4 rounded-lg shadow-md hover:shadow-lg transition-all text-lg
Secondary CTA: bg-white border-2 border-slate-300 text-slate-700 hover:border-[#4ecca3] hover:text-[#4ecca3] font-medium px-6 py-3 rounded-lg
Text Link: text-[#3b82f6] hover:text-[#1e40af] font-medium underline-offset-2 hover:underline
Nav Link: text-slate-600 hover:text-slate-900 font-medium
```

**Card Styles:**
```
Feature Card: bg-white rounded-xl shadow-sm border border-slate-100 p-6 hover:shadow-md transition-shadow
Pricing Card: bg-white rounded-2xl shadow-lg border border-slate-200 p-8
Testimonial Card: bg-slate-50 rounded-xl p-6 border-l-4 border-[#4ecca3]
```

**Spacing Scale:**
```
Section padding: py-20 md:py-28
Container max-width: max-w-6xl mx-auto px-4
Card gap: gap-6 md:gap-8
Stack spacing: space-y-4 or space-y-6
```

**Trust Elements (CRITICAL for B2B conversion):**
- Big, bold numbers for stats (text-4xl font-bold text-[#4ecca3])
- Logos of integrations (Parlevel, Nayax, VendSoft)
- "Built by venders for venders" tagline prominently placed
- Real testimonial with photo and company name
- Clear pricing (no hidden fees messaging)
- ROI calculator with real numbers

**Design Principles:**
- WHITE backgrounds dominate (trust, professionalism)
- Generous whitespace (clean, not cluttered)
- Teal CTAs POP against white (high contrast = clicks)
- Numbers and stats are LARGE and prominent
- Simple language, no jargon
- Photos/illustrations of warehouses, drivers, vending (industry-specific)
- Mobile-first but desktop-optimized (B2B research happens on desktop)
- Fast loading (no heavy animations, optimized images)

**What to AVOID:**
- Dark backgrounds on marketing pages (feels "techy", not trustworthy)
- Trendy gradients or neon colors
- Tech jargon or developer language
- Small text or cramped layouts
- Generic stock photos (use industry-specific imagery)
- Too many CTAs (one primary per section)

---

## Existing Supabase Schema Reference

**Database:** Existing Supabase project with these tables:
- `users` - id, email, first_name, last_name, created_at
- `routes` - id, user_id, name, delivery_date, created_at
- `machines` - id, route_id, name, location, sequence
- `items` - id, machine_id, product_name, quantity, slot, inventory_count

**New tables needed:**
- `accounts` - subscription/billing info
- `account_users` - link users to accounts with roles
- `discount_codes` - promo codes

---

## Prompt Sequence

### PROMPT 1: Project Setup + Supabase Connection

```
Create a new React + TypeScript project for "Stocker AI" - a voice-guided warehouse picking SaaS for vending machine operators.

TARGET AUDIENCE: Mid-market vending operators (5-50 drivers). Traditional industry, NOT tech-savvy. Design must feel TRUSTWORTHY and PROFESSIONAL - like a reliable business partner, not a trendy tech startup.

Tech Stack:
- React + TypeScript
- Tailwind CSS
- Supabase (connect to existing project)
- Lucide React for icons
- Inter font (from Google Fonts)
- Mobile-first responsive design

DESIGN SYSTEM (use throughout project):

Brand Colors:
- Primary CTA: #4ecca3 (teal - for buttons and highlights, POPS on white)
- Primary CTA Hover: #3db892
- Trust Blue: #3b82f6 (links, info elements)
- Trust Blue Dark: #1e40af (emphasized headings)
- Success: #22c55e
- Warning: #f59e0b
- Error: #ef4444

Marketing Pages (Light Theme - TRUST FOCUSED):
- Background: #ffffff (white - clean, professional)
- Background Alt: #f8fafc (for alternating sections)
- Text Primary: #1e293b (slate-800)
- Text Secondary: #64748b (slate-500)
- Border: #e2e8f0 (slate-200)
- Card: white with shadow-sm

Typography:
- Font: 'Inter', system-ui, sans-serif
- Hero: text-5xl md:text-6xl font-bold tracking-tight
- Section headings: text-3xl md:text-4xl font-bold
- Subheadings: text-xl text-slate-600
- Body: text-base leading-relaxed

Button Styles (CONVERSION OPTIMIZED):
- Primary CTA: bg-[#4ecca3] text-white hover:bg-[#3db892] font-semibold px-8 py-4 rounded-lg shadow-md hover:shadow-lg text-lg
- Secondary: bg-white border-2 border-slate-300 text-slate-700 hover:border-[#4ecca3] font-medium px-6 py-3 rounded-lg
- Nav Link: text-slate-600 hover:text-slate-900 font-medium

Spacing:
- Sections: py-20 md:py-28
- Container: max-w-6xl mx-auto px-4
- Cards: rounded-xl shadow-sm p-6

DESIGN PRINCIPLES:
- WHITE backgrounds (trust, professionalism)
- Generous whitespace
- Teal CTAs pop against white
- Big, bold numbers for stats
- Simple language, no jargon
- One primary CTA per section

Project structure:
/src
  /components - reusable UI components
  /pages - page components
  /lib - Supabase client, utilities
  /hooks - custom React hooks
  /types - TypeScript interfaces

Create:
1. Supabase client configuration (I'll add credentials)
2. App.tsx with React Router
3. Placeholder pages: Home, Pricing, Login, Dashboard
4. Professional navbar: Logo left, nav center, CTAs right
   - Logo: "Stocker" text with a simple sound wave icon
   - Nav items: Features, Pricing, Demo (scroll links)
   - Right side: "Login" (text link), "Start Free Trial" (teal button)
5. Tailwind config with design system colors

Do NOT build features yet - just foundation and routing.
```

---

### PROMPT 2: Landing Page Structure

```
Build the landing page structure for Stocker AI at the "/" route.

This is a B2B SaaS marketing page for vending machine operators. The page should have these sections in order:

1. Hero section (full viewport height on desktop)
2. "How It Works" section with 3 steps
3. Features & Benefits section (4 cards)
4. ROI Calculator section
5. Social proof section
6. Pricing preview (link to full pricing page)
7. FAQ accordion (5 questions)
8. Final CTA section
9. Footer with links

Use Tailwind CSS. Mobile-first responsive design.

Create placeholder content for now - I will provide the actual copy in the next prompt.

Do NOT modify other pages or components.
```

---

### PROMPT 3: Landing Page - Hero Content

```
Update ONLY the Hero section on the landing page with this exact content:

Headline: "Enterprise Warehouse Speed. Zero Hardware Cost."

Subhead: "Hardware automation runs $100k+. Stocker runs on the phone in your pocket. Same accuracy and speed, no hardware. Starting at $29/month."

Primary CTA button: "Start Free Trial" - links to /signup
Secondary CTA button: "See How It Works" - smooth scrolls to How It Works section

Background: Subtle gradient or professional image placeholder
Layout: Text left-aligned on desktop, centered on mobile

Do NOT modify any other sections.
```

---

### PROMPT 4: Landing Page - How It Works

```
Update ONLY the "How It Works" section with this content:

Section headline: "Up and Running in 5 Minutes"

Step 1:
Icon: Upload/document icon
Title: "Upload Your Route"
Description: "Export your PDF from Parlevel, Nayax, or VendSoft. Upload it to Stocker."

Step 2:
Icon: Headphones/audio icon
Title: "Put in Your Earbuds"
Description: "Bluetooth earbuds or phone speaker. Whatever you have."

Step 3:
Icon: Microphone/voice icon
Title: "Pick by Voice"
Description: "Stocker tells you what to grab. Say 'next' when done. Repeat."

Layout: 3 columns on desktop, stacked on mobile. Include step numbers (1, 2, 3).

Do NOT modify any other sections.
```

---

### PROMPT 5: Landing Page - Features & Benefits

```
Update ONLY the Features & Benefits section with these 4 content blocks:

Section headline: "Why Operators Switch to Stocker"

Block 1:
Headline: "Stop Squinting at Screens"
Body: "Screen-based picking slows drivers down and causes errors. Stocker's voice guidance calls out quantity, product, and slot - hands stay full, eyes stay up. Result: 25-30% faster picks with near-zero mistakes."

Block 2:
Headline: "New Driver? Productive in 15 Minutes"
Body: "Training new hires takes weeks of shadowing and costly mistakes. Stocker walks them through every pick, step by step, from day one. Result: Onboarding drops from weeks to minutes."

Block 3:
Headline: "Every Pick Confirmed. Every Item Tracked"
Body: "Lost progress means rework - or worse, missed deliveries. Stocker auto-saves after every item and resumes exactly where you stopped. Result: Zero rework, 100% route completion."

Block 4:
Headline: "Your Workflow, Your Way"
Body: "Forcing one picking method slows drivers down and fights muscle memory. Stocker adapts to each driver and machine - they choose how to work it. Result: No retraining, no friction, natural flow."

Layout: 2x2 grid on desktop, stacked on mobile. Use subtle card styling with icons.

Do NOT modify any other sections.
```

---

### PROMPT 6: Landing Page - ROI Calculator

```
Update ONLY the ROI Calculator section:

Section headline: "See Your Savings"
Subhead: "Voice guidance delivers 20-30% faster picking. At $15-20/driver/month, that's typically less than 10% of your labor savings."

Interactive calculator with these inputs:
1. Number of drivers (slider or input, range 2-50, default 5)
2. Average hourly wage (input, default $18)

Calculation logic:
- Monthly labor hours = drivers × 8 hours × 22 days
- Monthly labor cost = hours × hourly wage
- Estimated savings (25%) = labor cost × 0.25
- Stocker cost = (drivers × $20 if ≤5) OR (drivers × $18 if ≤20) OR (drivers × $15)
- Net savings = estimated savings - Stocker cost

Display:
- "Estimated monthly labor savings: $X,XXX"
- "Stocker cost: $XXX/mo"
- "Net monthly savings: $X,XXX"

CTA button below: "Start Free Trial"

Footnote: "Based on industry research showing 25-35% productivity gains with voice-directed picking."

Do NOT modify any other sections.
```

---

### PROMPT 7: Landing Page - Social Proof & Testimonial

```
Update ONLY the Social Proof section:

Tagline (centered, styled): "Built by venders for venders"

Testimonial block:
Quote: "[PLACEHOLDER - Driver testimonial to be added]"
Attribution: "- Driver Name, Company Name"

Tech credibility line (smaller, below testimonial):
"Powered by Deepgram voice AI and OpenAI"

Keep this section minimal and authentic - we're a new product with real industry expertise.

Do NOT modify any other sections.
```

---

### PROMPT 8: Landing Page - FAQ Section

```
Update ONLY the FAQ section with an accordion component:

Section headline: "Frequently Asked Questions"

Q1: "How does pricing work?"
A1: "$20/driver/month for 1-5 drivers, $18 for 6-20 drivers, $15 for 21-50 drivers. Adjust your driver count anytime - changes apply next billing cycle."

Q2: "Is there a minimum?"
A2: "2 driver minimum ($40/month). Each driver can service up to 10 machines per day."

Q3: "What do I need to get started?"
A3: "A smartphone, Bluetooth earbuds (optional), and your route PDFs from Parlevel, Nayax, or VendSoft. A laptop makes generating and uploading PDFs easier, but it works from a phone too."

Q4: "How long does setup take?"
A4: "5 minutes. Upload your PDF and start picking. New drivers are productive in 15 minutes with zero training."

Q5: "What's the trial?"
A5: "14 days free with credit card signup. Cancel anytime - no questions asked."

Use an accordion pattern - one question expanded at a time.

Do NOT modify any other sections.
```

---

### PROMPT 9: Landing Page - Final CTA & Footer

```
Update the Final CTA section and Footer:

FINAL CTA SECTION:
Headline: "Ready to Pick Smarter?"
Subhead: "Join operators who've cut picking time by 25% or more."
Button: "Start Your Free Trial" - links to /signup
Secondary link: "Questions? Contact us" - mailto:support@my-stocker-ai.com

FOOTER:
Logo (left)
Links (center): Home | Pricing | Login | Contact
Legal (right): © 2025 Stocker AI | Privacy Policy | Terms of Service
Tagline (below, centered, small): "Pick smarter. Stock faster."

Do NOT modify any other sections.
```

---

### PROMPT 10: Pricing Page

```
Create the Pricing page at "/pricing" route.

Page headline: "Simple, Per-Driver Pricing"
Subhead: "Scale up or down monthly. No contracts. No surprises."

PRICING TIERS (display as cards side by side):

Tier 1 - "Starter"
- 1-5 drivers
- $20/driver/month
- Features: Voice-guided picking, PDF upload, Auto-save & resume, Email support
- CTA: "Start Free Trial"

Tier 2 - "Growth" (mark as "Most Popular")
- 6-20 drivers
- $18/driver/month
- Features: Everything in Starter, Team management, Route assignment, Usage analytics
- CTA: "Start Free Trial"

Tier 3 - "Scale"
- 21-50 drivers
- $15/driver/month
- Features: Everything in Growth, Phone support, Priority onboarding
- CTA: "Start Free Trial"

Tier 4 - "Enterprise"
- 51+ drivers
- "Contact Us"
- Features: Custom pricing, Dedicated support, Custom integrations
- CTA: "Contact Sales"

Below tiers:
- "All plans include 14-day free trial"
- "2 driver minimum*"
- Footer note: "*Each driver can service up to 10 machines per day"

Add FAQ accordion below (reuse component from landing page):

Q: "Can I change my plan?"
A: "Yes, adjust your driver count anytime. Changes apply next billing cycle. If you exceed 10 machines per driver per day, you'll need to add another driver."

Q: "What happens after the trial?"
A: "Your card is charged based on your driver count. Cancel anytime before the trial ends - no charge."

Q: "Do you offer annual billing?"
A: "Not yet. Monthly billing lets you scale up or down with seasonal demand."

Include same footer as landing page.
```

---

### PROMPT 11: Authentication Pages

```
Create Login and Signup pages that connect to Supabase Auth.

LOGIN PAGE (/login):
- Email input
- Password input
- "Login" button
- "Forgot password?" link
- "Don't have an account? Sign up" link to /signup
- Error message display area

SIGNUP PAGE (/signup):
- Email input (required)
- Password input (required, min 8 chars)
- First name input (required)
- Last name input (required)
- "How many drivers do you have?" dropdown (2-50+)
- "How many machines per driver daily?" dropdown (1-5, 6-10, 11-15, 16-20, 20+)
- Checkbox: "I agree to the Terms of Service and Privacy Policy"
- "Start Free Trial" button
- "Already have an account? Login" link

VALIDATION:
- If machines per driver > 10, show message: "For more than 10 machines per driver, we'll review your account setup before activation."

Connect to Supabase Auth. On successful signup, redirect to /dashboard.
On successful login, redirect to /dashboard.

Do NOT modify landing page or pricing page.
```

---

### PROMPT 12: Customer Dashboard - Layout & Navigation

```
Create the authenticated customer dashboard structure at "/dashboard".

IMPORTANT: The dashboard uses the DARK THEME to match the existing PWA:
- Background: #0d1117
- Background Alt: #161b22
- Text Primary: #e6edf3
- Text Secondary: #7d8590
- Border: rgba(48, 54, 61, 0.6)
- Cards: rgba(22, 27, 34, 0.8)
- Primary accent: #4ecca3 (same teal)

This dashboard has TWO user roles:
1. Primary Admin - full access to everything
2. Driver - limited access (routes only)

NAVIGATION SIDEBAR (collapsible on mobile):
- Logo at top
- "Voice App" - links to existing PWA at /app (external link)
- "Upload Routes" - only visible to Primary Admin
- "My Routes" - visible to all users
- "Team" - only visible to Primary Admin
- "Usage" - only visible to Primary Admin
- "Billing" - only visible to Primary Admin
- "Settings" - visible to all
- User name + logout at bottom

MAIN CONTENT AREA:
- Header with page title and breadcrumbs
- Content area below

Create this layout structure with placeholder content for each page.
Role-based visibility should check a user_role field (we'll connect to Supabase next).

Mobile: Hamburger menu, slide-out nav.

Do NOT modify public pages (landing, pricing, login, signup).
```

---

### PROMPT 13: Database Schema - Accounts & Roles

```
Create Supabase database migrations for the customer account system.

NEW TABLES:

accounts:
- id (uuid, primary key)
- name (text) - company/account name
- stripe_customer_id (text, nullable)
- subscription_status (text: 'trialing', 'active', 'past_due', 'canceled')
- trial_ends_at (timestamp)
- driver_count (integer, default 2)
- created_at (timestamp)

account_users:
- id (uuid, primary key)
- account_id (uuid, foreign key to accounts)
- user_id (uuid, foreign key to auth.users)
- role (text: 'primary_admin', 'driver')
- can_view_all_routes (boolean, default false) - for "central picker"
- created_at (timestamp)

route_assignments:
- id (uuid, primary key)
- route_id (uuid, foreign key to routes)
- user_id (uuid, foreign key to auth.users)
- assigned_by (uuid, foreign key to auth.users)
- assigned_at (timestamp)

discount_codes:
- id (uuid, primary key)
- code (text, unique)
- discount_type (text: 'percent', 'fixed')
- discount_value (numeric)
- duration_months (integer, nullable - null means forever)
- max_uses (integer, nullable)
- times_used (integer, default 0)
- expires_at (timestamp, nullable)
- created_at (timestamp)

ROW LEVEL SECURITY:
- Users can only see their own account data
- Primary admins can see all users in their account
- Drivers can only see routes assigned to them (or all if can_view_all_routes = true)

Generate the SQL migrations I can run in Supabase.
```

---

### PROMPT 14: Dashboard - Upload & Assign Routes

```
Build the "Upload Routes" page in the dashboard (Primary Admin only).

UPLOAD SECTION:
- File input accepting PDF files
- Date picker for "Delivery Date" (defaults to tomorrow)
- "Upload Route" button
- Upload progress indicator
- Success message showing: route name, machine count, item count

Note: Actual PDF parsing happens via external n8n webhook. For now, create the UI and a placeholder function that we'll connect later.

EXISTING ROUTES SECTION:
Below the upload form, show "My Routes" grouped by date:

For each date header, show route cards:
- Route name
- Machine count
- Item count
- "Assign" button (opens modal)
- "Delete" button (with confirmation)

ASSIGN MODAL:
- Route name at top
- List of team members (from account_users)
- Checkbox next to each member
- "Save Assignments" button

Connect to Supabase to:
- Fetch routes for the current account
- Fetch team members for assignment
- Save route assignments to route_assignments table
- Delete routes (CASCADE deletes machines and items)

Do NOT modify other dashboard pages.
```

---

### PROMPT 15: Dashboard - Team Management

```
Build the "Team" page in the dashboard (Primary Admin only).

TEAM MEMBERS LIST:
Table/cards showing:
- Name (first + last)
- Email
- Role (Primary Admin or Driver)
- Access level (Assigned Routes Only / All Routes)
- "Edit" button
- "Remove" button (with confirmation, cannot remove self)

ADD TEAM MEMBER:
Button opens modal:
- Email input (required)
- First name input (required)
- Last name input (required)
- Role dropdown: "Driver" (default), "Admin"
- Access toggle: "Can view all routes" checkbox
- "Send Invite" button

On invite:
1. Create Supabase auth user with random password
2. Add to account_users table
3. Send password reset email so they can set their password

EDIT MEMBER MODAL:
- Change role (unless it's the only Primary Admin)
- Toggle "Can view all routes"
- Cannot edit email or name (they do that in Settings)

Connect to Supabase for all CRUD operations.

Do NOT modify other pages.
```

---

### PROMPT 16: Dashboard - Usage & Billing

```
Build the "Usage" page (Primary Admin only).

CURRENT PERIOD STATS:
Cards showing:
- "Active Drivers" - count of users who used the app this month
- "Routes Completed" - count of routes marked complete
- "Items Picked" - total items picked this month
- "Machines Serviced" - total machines completed

USAGE CHART:
Line chart showing daily usage over the past 30 days:
- X-axis: dates
- Y-axis: items picked
- Tooltip showing date and count

DRIVER BREAKDOWN:
Table showing per-driver stats:
- Driver name
- Routes completed
- Items picked
- Machines serviced
- Machines/day average

Flag any driver averaging >10 machines/day with a warning icon.

---

Build the "Billing" page (Primary Admin only).

SUBSCRIPTION INFO:
- Current plan: "X drivers at $Y/driver"
- Status: "Active" / "Trialing (X days left)" / "Past Due"
- Next billing date
- "Change Driver Count" button (opens modal)

PAYMENT METHOD:
- Card ending in XXXX
- "Update Payment Method" button (Stripe portal)

BILLING HISTORY:
Table of past invoices:
- Date
- Amount
- Status
- "View Invoice" link (Stripe hosted)

CHANGE DRIVER COUNT MODAL:
- Current: X drivers
- New count: number input (min 2)
- Shows new monthly price
- "Update" button
- Note: "Changes apply at next billing cycle"

For Stripe integration, create placeholder functions - we'll connect Stripe later.

Do NOT modify other pages.
```

---

### PROMPT 17: Driver View - My Routes

```
Build the "My Routes" page that BOTH Primary Admin and Driver roles can see.

LOGIC:
- If user role is 'primary_admin': show ALL routes for the account
- If user role is 'driver' AND can_view_all_routes = true: show ALL routes
- If user role is 'driver' AND can_view_all_routes = false: show ONLY assigned routes

DISPLAY:
Group routes by delivery date (today first, then future dates, then past).

For each date, show route cards:
- Route name
- Machine count / Items count
- Status: "Not Started" / "In Progress (X%)" / "Completed"
- "Start Picking" button - links to external PWA with route ID parameter

TODAY'S ROUTES:
Highlighted section at top showing routes for today with larger "Start Picking" CTA.

COMPLETED ROUTES:
Collapsible section for past/completed routes.

Connect to Supabase:
- Check user role from account_users
- Fetch routes based on role logic above
- Join with route_assignments for assigned routes

Do NOT modify other pages.
```

---

### PROMPT 18: Settings Page

```
Build the "Settings" page accessible to ALL users.

PROFILE SECTION:
- First name (editable)
- Last name (editable)
- Email (read-only, shown but not editable)
- "Save Changes" button

PASSWORD SECTION:
- Current password input
- New password input
- Confirm new password input
- "Change Password" button

PREFERENCES SECTION (if we add any later):
- Placeholder for future preferences

DELETE ACCOUNT (only for Primary Admin):
- "Delete Account" button
- Confirmation modal: "This will cancel your subscription and delete all data. This cannot be undone."
- Requires typing "DELETE" to confirm

Connect to Supabase Auth for profile updates and password changes.

Do NOT modify other pages.
```

---

## Post-Build Checklist

After all prompts are complete:

1. [ ] Test responsive design on mobile
2. [ ] Verify all Supabase connections work
3. [ ] Test signup flow end-to-end
4. [ ] Test role-based access (admin vs driver)
5. [ ] Connect Stripe for payments
6. [ ] Connect PDF upload to n8n webhook
7. [ ] Add real testimonial quote
8. [ ] Add demo video to landing page
9. [ ] Deploy to production domain

---

## Notes for Lovable

- Build incrementally - one prompt at a time
- Wait for each section to be complete before moving on
- If something breaks, use Chat mode to debug before Edit mode
- Export code to GitHub regularly as backup
- Test on mobile after each major section

---

**END OF SPEC**
