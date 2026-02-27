# StockerAI Marketing Engine (SAME) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI-driven prospect outreach engine for StockerAI targeting 8 vending industry verticals, starting with influencer seed list discovery and progressing to qualify → draft → SMTP send.

**Architecture:** Standalone Python repo at `/home/visionairy/StockerMarketing/`. Scrapers populate Supabase (`same_*` tables shared with VPE instance). CC sessions run qualify and draft loops. SMTP sends via russ@visionairy.biz. No Slack bot — all control via `main.py` CLI.

**Tech Stack:** Python 3.11+, Supabase (supabase-py), smtplib/SMTP, requests + BeautifulSoup for scraping, python-dotenv, pytest

**Design doc:** `/home/visionairy/StockerAI/docs/plans/2026-02-26-stockerai-marketing-engine-design.md`

---

## Phase 1: Repo + Seed List

### Task 1: Create repo structure and dependencies

**Files:**
- Create: `/home/visionairy/StockerMarketing/` (new directory)
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create the directory and init git**

```bash
mkdir -p /home/visionairy/StockerMarketing
cd /home/visionairy/StockerMarketing
git init
```

**Step 2: Create requirements.txt**

```
supabase==2.4.0
python-dotenv==1.0.0
requests==2.31.0
beautifulsoup4==4.12.3
pytest==8.0.0
tabulate==0.9.0
click==8.1.7
```

**Step 3: Create .env.example**

```
SUPABASE_URL=https://wvtkuposrlvadyeixlke.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=russ@visionairy.biz
SMTP_PASSWORD=
```

**Step 4: Create .gitignore**

```
.env
__pycache__/
*.pyc
.pytest_cache/
data/seed/*.csv
```

Note: seed CSVs are gitignored (contain contact info). Keep locally only.

**Step 5: Create directory structure**

```bash
mkdir -p scrapers agents outreach db data/seed tests
touch scrapers/__init__.py agents/__init__.py outreach/__init__.py
touch tests/__init__.py
```

**Step 6: Install dependencies**

```bash
pip install -r requirements.txt
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: initialize SAME repo structure"
```

---

### Task 2: Build Supabase schema

**Files:**
- Create: `db/schema.sql`

**Step 1: Write schema.sql**

```sql
-- StockerAI Marketing Engine (SAME)
-- Tables prefixed with same_ to share Supabase instance with VPE

-- Prospects table (one row per contact)
CREATE TABLE IF NOT EXISTS same_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical TEXT NOT NULL,  -- influencers, distributors, courses, etc.
    name TEXT NOT NULL,
    platform TEXT,           -- youtube, tiktok, instagram, email, web
    url TEXT,
    followers INTEGER,
    contact_email TEXT,
    contact_method TEXT,     -- email, instagram_dm, youtube_dm, contact_form
    notes TEXT,
    outreach_status TEXT NOT NULL DEFAULT 'not_contacted',
    -- not_contacted, contacted, responded, converted, rejected, monitor
    tier INTEGER,            -- 1=personalized, 2=templated
    score INTEGER,           -- 0-100 from MECE qualification
    score_band TEXT,         -- priority, qualified, review, monitor, low
    score_breakdown JSONB,   -- {AUDIENCE_MATCH: 22, REACH: 18, ...}
    draft_message TEXT,
    sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS same_prospects_vertical_idx ON same_prospects(vertical);
CREATE INDEX IF NOT EXISTS same_prospects_status_idx ON same_prospects(outreach_status);
CREATE INDEX IF NOT EXISTS same_prospects_band_idx ON same_prospects(score_band);

-- Activity log (tracks every status change, send, response)
CREATE TABLE IF NOT EXISTS same_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID REFERENCES same_prospects(id),
    action TEXT NOT NULL,    -- imported, scored, drafted, sent, responded, converted
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Step 2: Run schema in Supabase**

Open Supabase SQL Editor for project `wvtkuposrlvadyeixlke` and run `db/schema.sql`.

Verify tables created:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'same_%';
```
Expected: `same_prospects`, `same_activity`

**Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add same_prospects and same_activity Supabase schema"
```

---

### Task 3: Build the seed CSV for influencers

**Files:**
- Create: `data/seed/influencers.csv`
- Create: `scrapers/search_influencers.py` (web search helper)

**Step 1: Create the CSV with known prospects from research**

`data/seed/influencers.csv`:
```csv
name,platform,url,followers,contact_email,contact_method,outreach_status,notes
Jaime Ibanez,youtube,https://youtube.com/@realjaimeibanez,500000,,youtube_about,contacted,Texas-based 30+ machines
Investment Joy (Brandon Schlichter),youtube,https://investmentjoy.com,1900000,,web_contact,not_contacted,Side hustle + vending content
Quick Play,youtube,https://youtube.com,369000,,youtube_about,not_contacted,Documents full vending journey since 2018
Marcus Gram,tiktok,https://marcusgram.digital,50000,,web_contact,not_contacted,TikTok-native vending content + course
Dominic Barbato,youtube,https://youtube.com,16000,,youtube_about,not_contacted,Lifestyle + vending since 2019
Vending Heads,instagram,https://instagram.com/vendingheads,,,instagram_dm,not_contacted,Operator community content
Everything DSK,youtube,https://youtube.com,9000,,youtube_about,not_contacted,Diversified vending content
```

**Step 2: Create search_influencers.py to find more**

```python
#!/usr/bin/env python3
"""
Search for vending influencers to expand the seed list.
Run this manually and add results to data/seed/influencers.csv.
"""

SEARCH_QUERIES = [
    "vending machine business YouTube channel",
    "vending machine operator TikTok",
    "vending route business Instagram",
    "passive income vending machines YouTube",
    "how to start vending business influencer",
    "vending machine business review channel",
    "vending operator daily vlog",
]

YOUTUBE_CHANNELS_TO_CHECK = [
    "https://youtube.com/@realjaimeibanez",
    "https://investmentjoy.com",
]

if __name__ == "__main__":
    print("Manual search guide:")
    print("\nSearch these queries on YouTube and TikTok:")
    for q in SEARCH_QUERIES:
        print(f"  - {q}")
    print("\nFor each creator found, record:")
    print("  name, platform, url, followers (approx), contact method")
    print("\nAdd results to data/seed/influencers.csv")
    print("\nTo find contact email: check YouTube 'About' tab or channel description")
```

**Step 3: Run a CC-assisted web search session to expand the list**

Open a CC session and search for additional vending influencers using the queries in `search_influencers.py`. Add any new ones to `data/seed/influencers.csv`.

Target: 30-50 influencers in the CSV before moving to qualification.

**Step 4: Commit (CSV is gitignored — just commit the search helper)**

```bash
git add scrapers/search_influencers.py
git commit -m "feat: add influencer search helper and seed CSV (gitignored)"
```

---

### Task 4: Build db.py and main.py CLI skeleton

**Files:**
- Create: `db.py`
- Create: `main.py`

**Step 1: Write db.py**

```python
"""Supabase connection and CRUD helpers for SAME."""

import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_client = None

def get_client():
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


def insert_prospect(data: dict) -> dict:
    client = get_client()
    result = client.table("same_prospects").insert(data).execute()
    return result.data[0]


def update_prospect(prospect_id: str, updates: dict) -> dict:
    client = get_client()
    result = (
        client.table("same_prospects")
        .update(updates)
        .eq("id", prospect_id)
        .execute()
    )
    return result.data[0]


def get_prospects(vertical=None, status=None, band=None, tier=None) -> list:
    client = get_client()
    query = client.table("same_prospects").select("*")
    if vertical:
        query = query.eq("vertical", vertical)
    if status:
        query = query.eq("outreach_status", status)
    if band:
        query = query.eq("score_band", band)
    if tier:
        query = query.eq("tier", tier)
    return query.execute().data


def get_prospect(prospect_id: str) -> dict:
    client = get_client()
    result = (
        client.table("same_prospects")
        .select("*")
        .eq("id", prospect_id)
        .single()
        .execute()
    )
    return result.data


def log_activity(prospect_id: str, action: str, detail: str = None):
    client = get_client()
    client.table("same_activity").insert({
        "prospect_id": prospect_id,
        "action": action,
        "detail": detail,
    }).execute()
```

**Step 2: Write main.py CLI skeleton**

```python
#!/usr/bin/env python3
"""
SAME — StockerAI Marketing Engine
CLI for prospect discovery, qualification, drafting, and outreach.

Usage:
  python3 main.py import --file data/seed/influencers.csv --vertical influencers
  python3 main.py qualify --vertical influencers
  python3 main.py apply --id <uuid> --json '<scores_json>'
  python3 main.py draft --vertical influencers --tier 1
  python3 main.py save-draft --id <uuid> --message '<text>'
  python3 main.py list-drafts --vertical influencers
  python3 main.py send --tier 2 --vertical associations
  python3 main.py mark-sent --id <uuid>
  python3 main.py status
  python3 main.py status --vertical influencers
"""

import argparse
import json
import sys
import csv

import db


def cmd_import(args):
    """Import prospects from a seed CSV file."""
    imported = 0
    skipped = 0
    with open(args.file, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Skip if URL already exists
            existing = db.get_prospects(vertical=args.vertical)
            urls = [p.get("url") for p in existing]
            if row.get("url") and row["url"] in urls:
                skipped += 1
                continue

            followers = row.get("followers", "")
            prospect = {
                "vertical": args.vertical,
                "name": row["name"],
                "platform": row.get("platform"),
                "url": row.get("url"),
                "followers": int(followers) if followers else None,
                "contact_email": row.get("contact_email") or None,
                "contact_method": row.get("contact_method"),
                "outreach_status": row.get("outreach_status", "not_contacted"),
                "notes": row.get("notes"),
            }
            result = db.insert_prospect(prospect)
            db.log_activity(result["id"], "imported", f"From {args.file}")
            imported += 1

    print(f"Imported {imported} prospects, skipped {skipped} duplicates.")


def cmd_qualify(args):
    """Print qualify prompts for unscored prospects. CC reads and calls apply."""
    prospects = db.get_prospects(vertical=args.vertical)
    unscored = [p for p in prospects if p.get("score") is None
                and p.get("outreach_status") != "rejected"]

    if not unscored:
        print("No unscored prospects found.")
        return

    print(f"\n{'='*60}")
    print(f"SAME QUALIFY SESSION — {args.vertical} ({len(unscored)} prospects)")
    print(f"{'='*60}")
    print("\nFor each prospect below, evaluate 6 MECE dimensions and call:")
    print("  python3 main.py apply --id <uuid> --json '<scores_json>'")
    print("\nDimensions (weights):")
    print("  AUDIENCE_MATCH (25%) — Do their followers = solo vending operators doing route prep?")
    print("  REACH (20%)          — How many real operators can they put StockerAI in front of?")
    print("  INFLUENCE_TYPE (15%) — Do they recommend tools? Does audience act on recommendations?")
    print("  PARTNERSHIP_MODEL (15%) — Affiliate/Sponsorship/Referral/Integration — which fits?")
    print("  CONTACT_VIABILITY (15%) — Real email/contact? Active in last 90 days?")
    print("  COMPETITIVE_RISK (10%) — Existing conflicting relationships? Promoting a competitor?")
    print("\nScore 0-100 per dimension. Total score = weighted sum.")
    print(f"\n{'='*60}\n")

    for p in unscored:
        print(f"--- PROSPECT ---")
        print(f"ID:       {p['id']}")
        print(f"Name:     {p['name']}")
        print(f"Platform: {p.get('platform', 'unknown')}")
        print(f"URL:      {p.get('url', 'none')}")
        print(f"Followers:{p.get('followers', 'unknown')}")
        print(f"Method:   {p.get('contact_method', 'unknown')}")
        print(f"Notes:    {p.get('notes', '')}")
        print(f"Status:   {p.get('outreach_status')}")
        print()


def cmd_apply(args):
    """Apply qualification scores from CC analysis."""
    scores = json.loads(args.json)

    weights = {
        "AUDIENCE_MATCH": 0.25,
        "REACH": 0.20,
        "INFLUENCE_TYPE": 0.15,
        "PARTNERSHIP_MODEL": 0.15,
        "CONTACT_VIABILITY": 0.15,
        "COMPETITIVE_RISK": 0.10,
    }

    total = sum(scores.get(dim, 0) * weight for dim, weight in weights.items())
    total = round(total)

    if total >= 85:
        band = "priority"
        tier = 1
    elif total >= 70:
        band = "qualified"
        tier = 1
    elif total >= 50:
        band = "review"
        tier = 1
    elif total >= 30:
        band = "monitor"
        tier = 2
    else:
        band = "low"
        tier = 2

    db.update_prospect(args.id, {
        "score": total,
        "score_band": band,
        "score_breakdown": scores,
        "tier": tier,
    })
    db.log_activity(args.id, "scored", f"Score: {total} ({band})")
    print(f"Applied: score={total}, band={band}, tier={tier}")


def cmd_draft(args):
    """Print draft prompts for qualified prospects. CC reads and calls save-draft."""
    prospects = db.get_prospects(vertical=args.vertical)
    to_draft = [
        p for p in prospects
        if p.get("draft_message") is None
        and p.get("score_band") in ("priority", "qualified", "review")
        and p.get("outreach_status") == "not_contacted"
    ]
    if args.tier:
        to_draft = [p for p in to_draft if p.get("tier") == args.tier]

    if not to_draft:
        print("No prospects ready for drafting.")
        return

    print(f"\n{'='*60}")
    print(f"SAME DRAFT SESSION — {args.vertical} ({len(to_draft)} prospects)")
    print(f"{'='*60}")
    print("\nFor each prospect, write a personalized outreach email and call:")
    print("  python3 main.py save-draft --id <uuid> --message '<text>'")
    print()

    for p in to_draft:
        tier = p.get("tier", 1)
        print(f"--- DRAFT PROSPECT (Tier {tier}) ---")
        print(f"ID:       {p['id']}")
        print(f"Name:     {p['name']}")
        print(f"Platform: {p.get('platform')}")
        print(f"Followers:{p.get('followers', 'unknown')}")
        print(f"Score:    {p.get('score')} ({p.get('score_band')})")
        print(f"Notes:    {p.get('notes', '')}")
        print()
        if tier == 1:
            print("Template: A — Influencer (personalized)")
            print("  - Reference their specific content/machines/audience")
            print("  - Offer: Free account + commission per paid conversion")
            print("  - Ask: Honest review or mention to audience")
            print("  - Tone: Peer operator, not salesperson")
            print("  - From: Russ at StockerAI (russ@visionairy.biz)")
        print()


def cmd_save_draft(args):
    """Save a CC-drafted outreach message."""
    db.update_prospect(args.id, {"draft_message": args.message})
    db.log_activity(args.id, "drafted", "Message saved")
    print(f"Draft saved for prospect {args.id}")


def cmd_list_drafts(args):
    """List all prospects with unsent draft messages."""
    prospects = db.get_prospects(vertical=args.vertical)
    drafts = [p for p in prospects
              if p.get("draft_message") and not p.get("sent_at")]

    if not drafts:
        print("No unsent drafts found.")
        return

    print(f"\n{'='*60}")
    print(f"UNSENT DRAFTS — {len(drafts)} messages")
    print(f"{'='*60}\n")
    for p in drafts:
        print(f"ID:      {p['id']}")
        print(f"Name:    {p['name']} ({p.get('platform')})")
        print(f"Email:   {p.get('contact_email', 'NO EMAIL — manual send')}")
        print(f"Score:   {p.get('score')} ({p.get('score_band')}) Tier {p.get('tier')}")
        print(f"Message preview: {p['draft_message'][:120]}...")
        print()


def cmd_mark_sent(args):
    """Mark a prospect as sent (after manual send for Tier 1)."""
    from datetime import datetime, timezone
    db.update_prospect(args.id, {
        "outreach_status": "contacted",
        "sent_at": datetime.now(timezone.utc).isoformat(),
    })
    db.log_activity(args.id, "sent", "Marked sent manually")
    print(f"Marked sent: {args.id}")


def cmd_status(args):
    """Print pipeline status summary."""
    from tabulate import tabulate

    verticals = ["influencers", "distributors", "courses", "associations",
                 "brokers", "software", "communities", "publications"]
    if args.vertical:
        verticals = [args.vertical]

    rows = []
    for v in verticals:
        prospects = db.get_prospects(vertical=v)
        if not prospects:
            continue
        rows.append([
            v,
            len(prospects),
            sum(1 for p in prospects if not p.get("score")),
            sum(1 for p in prospects if p.get("score_band") in ("priority", "qualified")),
            sum(1 for p in prospects if p.get("draft_message") and not p.get("sent_at")),
            sum(1 for p in prospects if p.get("outreach_status") == "contacted"),
            sum(1 for p in prospects if p.get("outreach_status") == "responded"),
        ])

    print(tabulate(rows,
        headers=["Vertical", "Total", "Unscored", "Qualified", "Drafts ready", "Sent", "Responded"],
        tablefmt="simple"))


def main():
    parser = argparse.ArgumentParser(prog="main.py", description="SAME CLI")
    sub = parser.add_subparsers(dest="command")

    # import
    p_import = sub.add_parser("import")
    p_import.add_argument("--file", required=True)
    p_import.add_argument("--vertical", required=True)

    # qualify
    p_qualify = sub.add_parser("qualify")
    p_qualify.add_argument("--vertical", required=True)

    # apply
    p_apply = sub.add_parser("apply")
    p_apply.add_argument("--id", required=True)
    p_apply.add_argument("--json", required=True)

    # draft
    p_draft = sub.add_parser("draft")
    p_draft.add_argument("--vertical", required=True)
    p_draft.add_argument("--tier", type=int)

    # save-draft
    p_save = sub.add_parser("save-draft")
    p_save.add_argument("--id", required=True)
    p_save.add_argument("--message", required=True)

    # list-drafts
    p_list = sub.add_parser("list-drafts")
    p_list.add_argument("--vertical")

    # mark-sent
    p_mark = sub.add_parser("mark-sent")
    p_mark.add_argument("--id", required=True)

    # status
    p_status = sub.add_parser("status")
    p_status.add_argument("--vertical")

    args = parser.parse_args()
    commands = {
        "import": cmd_import,
        "qualify": cmd_qualify,
        "apply": cmd_apply,
        "draft": cmd_draft,
        "save-draft": cmd_save_draft,
        "list-drafts": cmd_list_drafts,
        "mark-sent": cmd_mark_sent,
        "status": cmd_status,
    }

    if args.command not in commands:
        parser.print_help()
        sys.exit(1)

    commands[args.command](args)


if __name__ == "__main__":
    main()
```

**Step 3: Write test for apply scoring logic**

`tests/test_apply_scoring.py`:
```python
"""Tests for MECE qualification scoring in cmd_apply."""

import json
import sys
import types

# Stub db module so tests don't need Supabase connection
db_stub = types.ModuleType("db")
db_stub.update_prospect = lambda *a, **kw: None
db_stub.log_activity = lambda *a, **kw: None
sys.modules["db"] = db_stub

import main  # noqa: E402


class FakeArgs:
    def __init__(self, prospect_id, scores):
        self.id = prospect_id
        self.json = json.dumps(scores)


def test_priority_band():
    """Perfect scores across all dimensions → priority band, tier 1."""
    calls = {}
    db_stub.update_prospect = lambda pid, updates: calls.update(updates)
    args = FakeArgs("test-id", {
        "AUDIENCE_MATCH": 100,
        "REACH": 100,
        "INFLUENCE_TYPE": 100,
        "PARTNERSHIP_MODEL": 100,
        "CONTACT_VIABILITY": 100,
        "COMPETITIVE_RISK": 100,
    })
    main.cmd_apply(args)
    assert calls["score"] == 100
    assert calls["score_band"] == "priority"
    assert calls["tier"] == 1


def test_qualified_band():
    """Scores summing to ~75 → qualified band."""
    calls = {}
    db_stub.update_prospect = lambda pid, updates: calls.update(updates)
    args = FakeArgs("test-id", {
        "AUDIENCE_MATCH": 75,
        "REACH": 75,
        "INFLUENCE_TYPE": 75,
        "PARTNERSHIP_MODEL": 75,
        "CONTACT_VIABILITY": 75,
        "COMPETITIVE_RISK": 75,
    })
    main.cmd_apply(args)
    assert calls["score"] == 75
    assert calls["score_band"] == "qualified"
    assert calls["tier"] == 1


def test_low_band():
    """Scores summing to < 30 → low band."""
    calls = {}
    db_stub.update_prospect = lambda pid, updates: calls.update(updates)
    args = FakeArgs("test-id", {
        "AUDIENCE_MATCH": 20,
        "REACH": 20,
        "INFLUENCE_TYPE": 20,
        "PARTNERSHIP_MODEL": 20,
        "CONTACT_VIABILITY": 20,
        "COMPETITIVE_RISK": 20,
    })
    main.cmd_apply(args)
    assert calls["score_band"] == "low"


def test_weighted_scoring():
    """AUDIENCE_MATCH weight=25% — high score there lifts total disproportionately."""
    calls = {}
    db_stub.update_prospect = lambda pid, updates: calls.update(updates)
    # Only AUDIENCE_MATCH is high (100), rest zero
    args = FakeArgs("test-id", {
        "AUDIENCE_MATCH": 100,
        "REACH": 0,
        "INFLUENCE_TYPE": 0,
        "PARTNERSHIP_MODEL": 0,
        "CONTACT_VIABILITY": 0,
        "COMPETITIVE_RISK": 0,
    })
    main.cmd_apply(args)
    assert calls["score"] == 25  # 100 * 0.25 = 25
```

**Step 4: Run tests — verify they fail first**

```bash
cd /home/visionairy/StockerMarketing
pytest tests/test_apply_scoring.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'tabulate'` or similar import errors until main.py exists.

**Step 5: Run tests after implementation**

```bash
pytest tests/test_apply_scoring.py -v
```

Expected: 4 tests PASS

**Step 6: Smoke test the CLI**

```bash
python3 main.py --help
python3 main.py status
```

Expected: help text printed, status prints empty table (no prospects yet)

**Step 7: Commit**

```bash
git add db.py main.py tests/test_apply_scoring.py
git commit -m "feat: add main.py CLI and db.py with full qualify/draft/send pipeline"
```

---

## Phase 2: SMTP Send Layer

### Task 5: Build smtp_sender.py and auto-send for Tier 2

**Files:**
- Create: `outreach/smtp_sender.py`
- Modify: `main.py` — add `cmd_send` function

**Step 1: Write test first**

`tests/test_smtp_sender.py`:
```python
"""Tests for SMTP sender — uses unittest.mock to avoid real sends."""

from unittest.mock import patch, MagicMock
import sys
import types

# Stub dotenv
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda: None
sys.modules["dotenv"] = dotenv_stub

from outreach.smtp_sender import send_email, build_email_headers


def test_build_email_headers():
    """build_email_headers returns dict with required fields."""
    headers = build_email_headers(
        to_email="test@example.com",
        to_name="Test Person",
        subject="Hello",
        body="Message body"
    )
    assert headers["To"] == "test@example.com"
    assert "StockerAI" in headers["From"]
    assert headers["Subject"] == "Hello"


def test_send_email_calls_smtp():
    """send_email opens SMTP connection and sends message."""
    with patch("smtplib.SMTP") as mock_smtp:
        mock_server = MagicMock()
        mock_smtp.return_value.__enter__ = MagicMock(return_value=mock_server)
        mock_smtp.return_value.__exit__ = MagicMock(return_value=False)

        send_email(
            to_email="prospect@example.com",
            to_name="Prospect",
            subject="Test subject",
            body="Test body",
            smtp_user="russ@visionairy.biz",
            smtp_password="testpass",
        )

        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once()
        mock_server.send_message.assert_called_once()


def test_send_email_raises_on_missing_credentials():
    """send_email raises ValueError if smtp_user or smtp_password empty."""
    import pytest
    with pytest.raises(ValueError, match="SMTP credentials"):
        send_email(
            to_email="test@example.com",
            to_name="Test",
            subject="Subject",
            body="Body",
            smtp_user="",
            smtp_password="",
        )
```

**Step 2: Run tests — verify they fail**

```bash
pytest tests/test_smtp_sender.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'outreach.smtp_sender'`

**Step 3: Write smtp_sender.py**

```python
"""SMTP send layer for SAME outreach via russ@visionairy.biz."""

import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
FROM_NAME = "Russ at StockerAI"
FROM_EMAIL = os.getenv("SMTP_USER", "russ@visionairy.biz")


def build_email_headers(to_email: str, to_name: str, subject: str, body: str) -> dict:
    return {
        "From": f"{FROM_NAME} <{FROM_EMAIL}>",
        "To": to_email,
        "Subject": subject,
        "Body": body,
    }


def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    body: str,
    smtp_user: str = None,
    smtp_password: str = None,
) -> None:
    """Send an email via SMTP. Raises ValueError if credentials missing."""
    smtp_user = smtp_user or os.getenv("SMTP_USER", "")
    smtp_password = smtp_password or os.getenv("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        raise ValueError("SMTP credentials required — set SMTP_USER and SMTP_PASSWORD in .env")

    msg = EmailMessage()
    msg["From"] = f"{FROM_NAME} <{smtp_user}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)


def send_bulk(prospects: list, get_subject_fn, get_body_fn) -> tuple[int, int]:
    """
    Send to a list of prospects. Returns (sent_count, failed_count).
    get_subject_fn(prospect) → subject string
    get_body_fn(prospect) → body string
    """
    sent = 0
    failed = 0
    for p in prospects:
        if not p.get("contact_email"):
            print(f"  SKIP {p['name']} — no email")
            failed += 1
            continue
        try:
            send_email(
                to_email=p["contact_email"],
                to_name=p["name"],
                subject=get_subject_fn(p),
                body=get_body_fn(p),
            )
            sent += 1
            print(f"  SENT → {p['name']} ({p['contact_email']})")
        except Exception as e:
            print(f"  FAIL → {p['name']}: {e}")
            failed += 1
    return sent, failed
```

**Step 4: Run tests — verify they pass**

```bash
pytest tests/test_smtp_sender.py -v
```

Expected: 3 tests PASS

**Step 5: Add cmd_send to main.py**

Add this function and its argparse entry in `main.py`:

```python
def cmd_send(args):
    """Auto-send Tier 2 templated outreach via SMTP."""
    from outreach.smtp_sender import send_bulk
    from datetime import datetime, timezone

    prospects = db.get_prospects(vertical=args.vertical)
    to_send = [
        p for p in prospects
        if p.get("draft_message")
        and not p.get("sent_at")
        and p.get("outreach_status") == "not_contacted"
    ]
    if args.tier:
        to_send = [p for p in to_send if p.get("tier") == args.tier]

    if not to_send:
        print("No prospects ready to send.")
        return

    print(f"Sending {len(to_send)} messages...")

    def get_subject(p):
        return f"Quick note about StockerAI for {p['name']}"

    def get_body(p):
        return p["draft_message"]

    sent, failed = send_bulk(to_send, get_subject, get_body)

    # Mark sent in DB
    now = datetime.now(timezone.utc).isoformat()
    for p in to_send:
        if p.get("contact_email"):
            db.update_prospect(p["id"], {
                "outreach_status": "contacted",
                "sent_at": now,
            })
            db.log_activity(p["id"], "sent", "Auto-sent via SMTP")

    print(f"\nDone: {sent} sent, {failed} skipped/failed")
```

And add to argparse in `main()`:
```python
# send
p_send = sub.add_parser("send")
p_send.add_argument("--vertical")
p_send.add_argument("--tier", type=int)
```

And in the commands dict:
```python
"send": cmd_send,
```

**Step 6: Commit**

```bash
git add outreach/smtp_sender.py tests/test_smtp_sender.py main.py
git commit -m "feat: add SMTP send layer with auto-send for Tier 2"
```

---

## Phase 3: First Run — Qualify and Draft Influencers

### Task 6: End-to-end first run with influencer seed data

This task is operational, not code. Execute the full pipeline for the first time.

**Step 1: Set up .env**

Copy `.env.example` to `.env` and fill in:
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard
- `SMTP_PASSWORD` — Gmail App Password for russ@visionairy.biz
  (Google Account → Security → App Passwords → create one for "StockerAI")

**Step 2: Run schema migration**

```sql
-- Run in Supabase SQL Editor
-- (paste contents of db/schema.sql)
```

**Step 3: Import seed data**

```bash
python3 main.py import --file data/seed/influencers.csv --vertical influencers
```

Expected: `Imported 7 prospects, skipped 0 duplicates.`

**Step 4: Check status**

```bash
python3 main.py status
```

Expected: influencers row showing 7 total, 6 unscored (Jaime Ibanez already contacted)

**Step 5: Run qualify session**

```bash
python3 main.py qualify --vertical influencers
```

Read each PROSPECT block. For each one, evaluate the 6 MECE dimensions (0-100 each) based on what you know about them, then call:

```bash
python3 main.py apply --id <uuid> --json '{
  "AUDIENCE_MATCH": 90,
  "REACH": 85,
  "INFLUENCE_TYPE": 80,
  "PARTNERSHIP_MODEL": 75,
  "CONTACT_VIABILITY": 70,
  "COMPETITIVE_RISK": 90
}'
```

**Step 6: Run draft session for Tier 1**

```bash
python3 main.py draft --vertical influencers --tier 1
```

For each prospect, write a personalized email (Template A) and save:

```bash
python3 main.py save-draft --id <uuid> --message 'Hi Brandon,

I came across Investment Joy and noticed you cover vending routes as part of your income portfolio content...
[rest of personalized message]'
```

**Step 7: Review drafts**

```bash
python3 main.py list-drafts --vertical influencers
```

**Step 8: Send or copy-paste**

For prospects with contact_email → copy message and send manually from russ@visionairy.biz.
Mark as sent:

```bash
python3 main.py mark-sent --id <uuid>
```

**Step 9: Final status check**

```bash
python3 main.py status
```

Expected: influencers row showing contacted count > 0.

---

## Appendix: Adding Remaining Verticals

Each new vertical follows the same pattern:

1. Build seed CSV in `data/seed/<vertical>.csv` (same columns as influencers.csv)
2. `python3 main.py import --file data/seed/<vertical>.csv --vertical <slug>`
3. `python3 main.py qualify --vertical <slug>`
4. `python3 main.py draft --vertical <slug> --tier <1|2>`
5. For Tier 2: `python3 main.py send --vertical <slug> --tier 2`

No code changes needed. The vertical slug is just a string stored in the DB.

**Priority order for remaining seed CSVs:**
1. `courses.csv` — Hill Vending, First Steps HQ, Marcus Gram, UpFlip
2. `distributors.csv` — DFY Vending, Betson, VendTek, iKrave
3. `associations.csv` — NAMA state councils (31 orgs)
4. `brokers.csv` — VendingExchange (in_progress), BuySellVending
5. `communities.csv` — Facebook group admins
6. `software.csv` — VendSoft, Gimme, Cantaloupe BD
7. `publications.csv` — VendingMarketWatch, Automatic Merchandiser
