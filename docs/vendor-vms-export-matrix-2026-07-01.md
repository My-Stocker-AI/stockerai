# StockerAI — Vending Management System (VMS) Export Capability Matrix

**Compiled:** 2026-07-01, from grounded research (real vendor docs, help centers, app-store listings, and — where obtainable — an actual exported sample report). Confidence tags reflect how directly each fact was verified.

**Purpose:** the reference for StockerAI's onboarding vendor dropdown + per-vendor parsing templates. Answers the core question: *can an operator on each major VMS produce a driver pick/restock list as a file (PDF or spreadsheet), and does it resemble the Parlevel report StockerAI already reads?*

---

## The reference format (what StockerAI reads today)

Ground truth from Davy Dupon's real export (Sundragon Vending), the "South" route:

- **Source:** Parlevel VMS — the **"Prekitting Detail"** page, printed to PDF from his phone (URL on the file: `sundragon.parlevelvms.com/daily-routes/{id}/prekitting`).
- **Per-machine header:** Transaction #, Asset #, Address, Key, Action, Bag #, Tote #, Cash Meter, Change Added, Refunds
- **Per-item rows:** **Slot · Cst ID · Product · Product-To-Add (pick qty) · Inventory/Parlevel (current/par) · Price · Changes**

The parser labeled "Canteen/Compass" in the code is actually reading **this Parlevel layout** — the label is a misnomer. Parlevel-via-PDF is StockerAI's proven, working intake.

---

## The matrix (9 major systems)

| System | Usable file | Resembles Parlevel? | From the phone? | Confidence |
|---|---|---|---|---|
| **Parlevel / 365** | PDF | reference format | ✅ **Proven** (Davy) | Proven |
| **Nayax** (Core / MoMa) | **PDF or Excel** | ✅ Clean match: PA code→slot, product, Missing→pick qty, PAR/On-Hand→par/current | ⚠️ File export desktop-documented; phone app builds picklist on-screen | High |
| **Gimme** | PDF (native "Export to PDF") | Close — position/slot, product, qty, route (par/price unconfirmed) | ✅ Likely (export in mobile app) | High |
| **VendSoft** | PDF ("Print Prekitting", native) | Close — Selections, Product, Predicted (pick qty); **no par/price** | ⚠️ Desktop web app | High |
| **VendSys** | PDF ("Service Card", print-to-PDF) | Close — Product, Fills (pick qty), Par, Price; **no explicit slot #** | ⚠️ Desktop; phone app view-only | High |
| **Vend-Trak** | PDF (printer-friendly service sheet) | Likely tabular (columns unconfirmed) | ❓ Browser/desktop | Medium |
| **Cantaloupe / Seed** | Spreadsheet (Excel/CSV via Seed Spotlight) | Paperless by design — no PDF pick list | ❌ Desktop-oriented | Medium |
| **Vagabond** (PayRange) | Spreadsheet (CSV) | Paperless — in-app "Pack" screen, no PDF | ❌ Web/desktop | Medium |
| **VendMAX** (Crane/simplifi) | Neither cleanly | Printable planogram drops the fill qty; real pick list is a phone screen with no confirmed export | ❌ | Medium |

---

## Bottom line

- **8 of 9 can produce a usable file.** Six give a **PDF** (Parlevel, Nayax, Gimme, VendSoft, VendSys, Vend-Trak); Nayax also gives Excel; **Seed and Vagabond are spreadsheet-only**; **VendMAX** produces neither cleanly.
- **The files are NOT one universal format** — columns differ vendor to vendor (VendSoft omits par/price, VendSys uses "Fills," Gimme sorts by position code, Nayax uses "Missing"). So the model is **one parsing template per vendor**, not one universal parser. This validates the template-library approach.
- **Phone export is only *proven* for Parlevel.** Gimme is likely; most others generate the file on a **computer** (their phone apps show the list on-screen but export from desktop). Onboarding instructions must tell each operator the right path for their system.
- **Easiest next templates after Parlevel:** **Nayax** (maps almost 1:1) and **Gimme** (native PDF, clean structure).

## Open items to close with a real operator (not resolvable from public docs)
- Exact printed column layout + whether price prints, for Nayax, Gimme, VendSoft, Vend-Trak.
- Whether VendSoft / VendSys / Vend-Trak / Nayax can export the file **from the phone** (docs show desktop).
- Seed / Vagabond: confirm the spreadsheet columns from a real export.

**Rule:** capture a real sample file from the first operator on each new system before locking that vendor's template. "Other" is the catch-all until a template exists.
