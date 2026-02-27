# StockerAI Marketing Engine (SAME) — Design Document

**Date:** 2026-02-26
**Status:** Approved
**Author:** Russ + Claude Code

---

## Overview

SAME is a standalone outreach engine for promoting StockerAI to vending machine operators through 8 industry verticals. It is modeled after the VPE architecture (prospect discovery → MECE qualification → CC-drafted outreach → SMTP send) but is purpose-built for the vending industry and operated solo via CLI.

**Repository:** `/home/visionairy/StockerMarketing/`
**Email:** russ@visionairy.biz (SMTP send layer)
**Control surface:** CLI + Claude Code sessions (no Slack bot)
**AI cost:** Zero — CC does all reasoning (no external API calls)

---

## Market Context

- ~15,867 vending machine operator businesses in the US (IBISWorld 2025)
- ~70% are solo/small operators (~11,100 addressable)
- StockerAI's sweet spot: solo operator doing hands-on route prep — estimated 5,000-8,000 individuals
- Total direct outreach contacts across all verticals: **225-450**
- At this volume, CLI operation is sufficient; no Slack bot required

---

## The 8 Verticals

| # | Slug | Name | Contacts | Priority | Tier |
|---|------|------|----------|----------|------|
| 1 | `influencers` | YouTube/TikTok/Instagram Vending Creators | 50-100 | HIGH | 1 (personalized) |
| 2 | `associations` | Industry Networks & Associations | 35-40 | HIGH | 2 (templated) |
| 3 | `distributors` | Vending Machine Sellers/Distributors | 75-150 | HIGH | 1 (top 15) + 2 (rest) |
| 4 | `courses` | "Start a Vending Business" Course Creators | 25-50 | HIGH | 1 (personalized) |
| 5 | `brokers` | Route Brokers & Marketplaces | 10-20 | MEDIUM | 1 (personalized) |
| 6 | `software` | Vending-Adjacent Software Companies | 8-12 | MEDIUM | 1 (BD outreach) |
| 7 | `communities` | Facebook Groups / Reddit | 15-25 admins | MEDIUM | 2 (templated) |
| 8 | `publications` | Industry Publications & Newsletters | 5-8 | MEDIUM | 2 (press/sponsored) |

---

## Architecture

```
Scrapers (autonomous Python)
    → Supabase DB (prospect storage + state tracking)
    → CC qualify session  (MECE scoring, 6 dimensions)
    → CC draft session    (Template A/B/C selection + personalization)
    → SMTP send           (auto for Tier 2, manual copy-paste for Tier 1)
```

**Database:** Shared Supabase instance with VPE. Separate `same_*` prefixed tables.

**No Slack bot.** All control via `main.py` CLI commands in a CC session.

---

## Two-Tier Outreach Model

### Tier 1 — Personalized (CC drafts individually, Russ sends manually)
- Influencers
- Course creators
- Top 10-15 distributors (DFY Vending, Betson, VendTek, etc.)
- VendingExchange + top route marketplaces
- Software company BD contacts

CC personalizes using their actual content, audience, business model, and the specific partnership angle that fits them.

### Tier 2 — Templated (auto-send via SMTP)
- Regional associations / NAMA state councils
- Remaining distributors
- Publications / newsletters
- Facebook group admins
- Reddit community contacts

Templated structure with name/company/specific detail merged in. Volume justifies automation.

---

## MECE Qualification Dimensions (6)

| Dimension | Weight | What CC Evaluates |
|---|---|---|
| **AUDIENCE_MATCH** | 25% | Do their followers/customers = solo vending operators doing route prep? |
| **REACH** | 20% | How many real operators can they put StockerAI in front of? |
| **INFLUENCE_TYPE** | 15% | Do they recommend tools? Does their audience act on recommendations? |
| **PARTNERSHIP_MODEL** | 15% | Affiliate? Sponsorship? Referral? Integration? Which fits their business? |
| **CONTACT_VIABILITY** | 15% | Real email/contact available? Active in last 90 days? |
| **COMPETITIVE_RISK** | 10% | Existing conflicting tool relationships? Promoting a competitor? |

### Score Bands

| Score | Band | Action |
|---|---|---|
| 85-100 | `priority` | Tier 1 personalized outreach, Russ sends manually |
| 70-84 | `qualified` | Tier 1 or 2 depending on vertical |
| 50-69 | `review` | CC flags for manual decision before drafting |
| 30-49 | `monitor` | Store, revisit in 90 days |
| 0-29 | `low` | Store for calibration |

---

## Outreach Templates

### Template A — Influencer (Tier 1, personalized)
- Hook: References their specific content/machines/audience
- Offer: Free account + commission per paid conversion
- Ask: Honest review or mention to audience
- Tone: Peer operator, not salesperson

### Template B — Business Partnership (distributors, course creators)
- Hook: Your customers need what I built
- Offer: Referral revenue + co-marketing angle
- Ask: Referral partnership or affiliate arrangement
- Tone: Professional, ROI-focused

### Template C — Institutional (associations, publications, software)
- Hook: Press release / sponsorship / integration pitch
- Offer: Member discount / sponsored feature / API integration
- Ask: Newsletter mention, editorial placement, or partnership call
- Tone: Industry professional, credibility-first

---

## Rollout Phases

### Phase 1 (Now — 30 days): Influencers + Course Creators
- Build influencer seed list via web search (today)
- Qualify and draft against seed list
- Jaime Ibanez: already contacted → `contacted` status in seed data
- VendingExchange: intro email sent → `in_progress` status in seed data
- Goal: 5-10 responses, 1-2 partnerships

### Phase 2 (60 days): Distributors + Route Marketplaces
- DFY Vending is highest priority: onboards new operators continuously
- Referral partnership conversations — expect 2-4 week close cycle
- Goal: 2-3 referral partnerships generating warm leads

### Phase 3 (90 days): Associations + Publications + Communities
- NAMA Show 2026: April 22-24, Los Angeles — attend/exhibit
- Press release to VendingMarketWatch (free, reaches 30K+ monthly)
- VendingToday newsletter sponsorship: 12,600 decision-makers per send
- Goal: Industry credibility, 1 trade press placement

### Phase 4 (Ongoing): Software Partnerships
- Start with VendSoft + Gimme (same solo operator segment)
- Longest sales cycle, highest long-term leverage
- Goal: 1 integration partnership that makes StockerAI discoverable passively

---

## CLI Interface

```bash
# Discovery
python3 main.py scrape --vertical influencers
python3 main.py import --file data/seed/influencers.csv

# Qualification (CC-driven)
python3 main.py qualify --vertical influencers
python3 main.py apply --id <uuid> --json '<scores>'

# Drafting (CC-driven)
python3 main.py draft --tier 1 --vertical influencers
python3 main.py save-draft --id <uuid> --message '<text>'

# Review + Send
python3 main.py list-drafts --vertical influencers
python3 main.py send --tier 2 --vertical associations
python3 main.py mark-sent --id <uuid>

# Pipeline visibility
python3 main.py status
python3 main.py status --vertical influencers --band priority
```

---

## File Structure

```
/home/visionairy/StockerMarketing/
├── main.py
├── scrapers/
│   ├── influencers.py
│   ├── distributors.py
│   ├── courses.py
│   ├── associations.py
│   └── publications.py
├── agents/
│   ├── qualifier.py          # 6-dimension MECE scoring
│   └── drafter.py            # Template A/B/C + CC prompting
├── outreach/
│   └── smtp_sender.py        # russ@visionairy.biz SMTP
├── db/
│   └── schema.sql            # same_* tables in shared Supabase
└── data/
    └── seed/
        ├── influencers.csv   # Built from web searches (Phase 1)
        ├── distributors.csv  # Named from research
        └── courses.csv       # Named from research
```

---

## Seed Data: Known High-Priority Prospects

### Influencers (from research)
| Name | Platform | Followers | Status |
|---|---|---|---|
| Jaime Ibanez | YouTube | 500K | contacted |
| Investment Joy (Brandon Schlichter) | YouTube | 1.9M | not_contacted |
| Quick Play | YouTube | 369K | not_contacted |
| Marcus Gram | TikTok | 50K | not_contacted |
| Dominic Barbato | YouTube/Instagram | 16K | not_contacted |
| Vending Heads | TikTok/Instagram | Unknown | not_contacted |

### Distributors (high priority)
| Company | Type | Status |
|---|---|---|
| DFY Vending | Done-for-you operator onboarding | not_contacted |
| Betson | National distributor | not_contacted |
| VendTek Wholesale | National distributor | not_contacted |
| iKrave Vending | Training + machine bundling | not_contacted |

### Course Creators
| Creator | Program | Status |
|---|---|---|
| Adam Hill | Vending Business Blueprint | not_contacted |
| Jami Stufflebeam | First Steps HQ | not_contacted |
| Marcus Gram | Digital vending course | not_contacted |
| UpFlip | The Vending Bootcamp | not_contacted |

### Networks
| Organization | Type | Status |
|---|---|---|
| VendingExchange | Route marketplace + operator network | in_progress |
| NAMA | National trade association | not_contacted |

---

## Key External Resources

- **The NAMA Show 2026:** April 22-24, Los Angeles — thenamashow.org
- **VendingToday newsletter:** 12,600 subscribers — vendingmarketwatch.com/subscribe
- **Automatic Merchandiser:** 13,000+ print subscribers — vendingmarketwatch.com/magazine
- **VENDiscuss Forums:** Veteran operator community — vendiscuss.net
- **VendingConnection Directory:** Distributor list — vendingconnection.com/directories/
