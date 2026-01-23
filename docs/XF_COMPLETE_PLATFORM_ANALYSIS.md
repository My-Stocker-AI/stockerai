# COMPLETE XF ANALYSIS - STOCKER AI PLATFORM
**Date:** 2026-01-22
**Purpose:** Systematic boundary discovery for machine transition bug
**Method:** Manual XF following BBRD protocol

---

## BOUNDARY 1: DATA - All Data Structures & Transformations

### 1.1 Database Schema (Source of Truth)

**Table: sessions**
Discovered from: `get_next_item_data()` function signature
- session_id (UUID)
- session_key (TEXT)
- user_id (UUID)
- current_route_id (UUID)
- current_machine_id (UUID)
- current_item_index (INTEGER) ← STATE VARIABLE
- status (TEXT)
- pick_direction (TEXT) ← 'forward' | 'reverse'
- session_created_at (TIMESTAMPTZ)
- session_updated_at (TIMESTAMPTZ)

**Table: machines**
Discovered from: `get_next_item_data()` function signature
- machine_id (UUID)
- route_id (UUID)
- machine_name (TEXT)
- machine_number (INTEGER)
- location_name (TEXT)
- machine_sequence (INTEGER) ← ORDERING FIELD
- machine_status (TEXT) ← 'pending' | 'skipped' | ?
- machine_total_items (INTEGER)

**Table: items**
Discovered from: `get_next_item_data()` function signature
- item_id (UUID)
- product_name (TEXT)
- quantity (INTEGER)
- slot (TEXT)
- item_sequence (INTEGER) ← ORDERING FIELD (1-indexed)
- item_status (TEXT)
- inventory_current (INTEGER)
- inventory_parlevel (INTEGER)
- machine_id (UUID) ← Foreign key

**Table: routes**
Not directly returned but referenced by:
- machines.route_id
- sessions.current_route_id

**KEY DISCOVERY: Item sequences are 1-indexed (1, 2, 3, ..., N), NOT 0-indexed**
Provenance: Test data in SQL migration shows sequences 1, 2, 3

### 1.2 Edge Function Data Transformation

**Input:** User ID
**Process:** Calls `get_next_item_data(p_user_id)`
**Output:** Consolidated JSON

Need to discover: How Edge Function structures the response
