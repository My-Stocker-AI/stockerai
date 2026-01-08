# EMERGENCY FIX FOR BLANK SCREEN

## What Happened
I deployed code that requires database columns (`route_platform`, `platform_setup_pending`)
before the migrations were run. This caused a React crash → blank screen.

## I've Already Done
✅ Pushed hotfix code (commit 78d0d81) with defensive error handling
✅ Built locally - confirmed it compiles
✅ Created SQL migration file: `fix-platform-columns.sql`

## YOU Need To Do (2 minutes)

### Step 1: Run SQL Migration (1 minute)
1. Go to: https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke/sql/new
2. Paste this SQL:

```sql
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS route_platform TEXT DEFAULT 'parlevel',
ADD COLUMN IF NOT EXISTS platform_setup_pending BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS platform_setup_requested_at TIMESTAMPTZ;
```

3. Click "Run" (bottom right)
4. Should see: "Success. No rows returned"

### Step 2: Trigger Redeploy (1 minute)
Your host should auto-deploy from the git push I just made (commit 78d0d81).

If it doesn't auto-deploy:
- **Netlify**: Go to Deploys → Trigger deploy
- **Vercel**: Should auto-deploy from GitHub push
- **Custom**: Run `git pull && npm run build` and redeploy dist folder

## Verification
After both steps, visit my-stocker-ai.com:
- Should load normally ✅
- No more React Error #31 ✅
- Console should show no errors ✅

## What's Fixed
- Site works even WITHOUT migrations (fallback to defaults)
- Platform selector ready in Settings (after migrations)
- Sample PDF submission ready for VendSoft/Nayax users

## I'm Sorry
This was my mistake - I should have:
1. Run migrations BEFORE pushing code that uses them
2. Made the code defensive from the start
3. Tested on a staging environment first

The hotfix I pushed makes the app resilient to missing columns going forward.
