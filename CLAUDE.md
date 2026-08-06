# StockerAI — Vending Machine Inventory Management

**Inherits:** `/home/visionairy/CLAUDE.md` (global protocols)

**Uses Tools:**
- `/home/visionairy/Xpansion/CLAUDE.md` (XF for system analysis and debugging)
- `/home/visionairy/Flon8/CLAUDE.md` (n8n for workflow management)

**GitHub:** github.com/My-Stocker-AI/stockerai  (moved from VisionAIrySE 2026-06-28 — the move
killed the Cloudflare and Render auto-deploy webhooks; see the deployment section below)

---

## Tech Stack

**Frontend:** React + TypeScript + Vite + shadcn-ui + Tailwind CSS
**Backend:** Supabase (PostgreSQL + Edge Functions) + Deepgram WebSocket (voice)
**Workflows:** n8n (visionairy.app.n8n.cloud)
**Deployed:** GitHub → Cloudflare Pages (auto-deploy on push)
**URLs:** https://my-stocker-ai.com (primary) | https://stocker-ai.pages.dev (legacy)

---

## SECTION -1: ABSOLUTE RULES

### NEVER MAKE ASSUMPTIONS ABOUT AVAILABLE DATA (SUPREME)

When diagnosing issues:
1. **Query the actual database** — don't assume data is missing or corrupt
2. **Read the actual code** — `git log`, `git diff`, don't assume what changed
3. **Check what the user can see** — toasts, UI errors, browser console
4. **Verify deployment state** — what code is actually running in production
5. **Don't dismiss user reports** — if something "broke", SOMETHING changed

**Incident (2026-02-15):** I added warning code that made silent drops visible as red error toasts. I dismissed user reports as "bad PDFs" when uploads were actually succeeding. Wasted session. Don't repeat this.

---

## SECTION 0.1: DEPLOYMENT — NEVER GET THIS WRONG

### ⚠️ PUSHING DOES NOT DEPLOY. Verified broken 2026-08-06.

This section used to say pushing to `main` auto-deploys in 2–3 minutes, and called that the only
method. It is false, and believing it cost an hour: eight commits reached GitHub and the live site
kept serving the old build.

**What actually happens.** The 2026-06-28 move to the `My-Stocker-AI` org killed the
GitHub→Cloudflare and GitHub→Render webhooks. Deployment has run through GitHub Actions calling
wrangler ever since (`.github/workflows/deploy-frontend.yml`). **That automation has produced no
build since 2026-07-31** — jobs sit queued ~15 min, never start a step, and get cancelled, which
is what an exhausted Actions minutes allowance looks like on a private repo.

**Deploy the frontend by hand** (this is what works today, and wrangler is already authenticated
on Russ's machine as `Russ@visionairy.biz`):
```bash
npm run build:deploy                 # vite build + prerender the 7 public routes
npx wrangler pages deploy dist --project-name stockerai --branch main \
    --commit-hash "$(git rev-parse HEAD)"
```
`--branch main` is what makes it a Production deployment rather than a preview.

**Then VERIFY against the live bytes — never trust "Success!".** The app screen is a separate
chunk from the main bundle, so grepping the main bundle proves nothing:
```bash
curl -s https://my-stocker-ai.com/assets/StockerApp-<hash>.js | grep -c "<a string you just added>"
```
Get `<hash>` from `ls dist/assets/StockerApp-*.js` after the build.

**Still push to GitHub** — it is the source of truth and the backup, it just is not the deploy.

**NEVER run:** `npx netlify deploy`, `npx vercel deploy`, `npx render deploy`
**NEVER assume:** "Vite projects use Netlify" (WRONG), "Check Render" (that's Xpansion)

**To restore automatic deploys:** check the Actions minutes / spending limit at
`https://github.com/organizations/My-Stocker-AI/settings/billing`. Everything else is wired
correctly — the workflows are active and the secrets are in place; nothing is picking up the jobs.

---

## Source of Truth

**MEMORY.md is the primary SOT.** Read it first for current state, workflow IDs, and pending tasks.

---

## XF Mandate (Xpansion)

**If user says "use XF" / "run XF":**
1. IMMEDIATELY run XF — no explanation, no alternatives, no "it's simple enough"
2. Use exact problem statement provided
3. Show results when complete. **Violation = session-ending failure.**

**Run XF automatically for:**
- Workflow activation/changes (n8n)
- Database schema changes (ALTER TABLE, CASCADE, RLS)
- API contract changes (WEBHOOK_MAP, endpoint updates)
- Multi-boundary fixes (frontend + backend + database)
- Bug fixes affecting 2+ components

```bash
xpansion analyze "problem"    # System: DATA/NODES/FLOW/ERRORS
xpansion validate "p" "s"     # Solution validation
```

---

## Mandatory System Impact Audit

**BEFORE making ANY change** to code, Edge Functions, DB schema, n8n workflows, API contracts:

Answer these 6 questions:
1. What exact boundary does this change touch?
2. What calls this? What does this call?
3. What shared types/interfaces are affected?
4. What tests cover this?
5. What n8n workflows depend on this?
6. What is the rollback plan?

**Violation consequences:** Session terminates.

---

## Reference Files (load on demand)

- `~/.claude/ref/stockerai-history.md` — POC benchmark (95% accuracy, 2026-02-02), validation results (44 lines)
- `~/.claude/ref/stockerai-incidents.md` — Netlify deploy incident, JWT bandaid hell, machine transition bugs (406 lines)
- `~/.claude/ref/stockerai-architecture.md` — Full project identity, Supabase schema, voice commands, audio pipeline (370 lines)
