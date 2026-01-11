# Deploy Keyword Learning System - Step 1.1

**Status:** Migration created, ready to deploy
**Time Required:** 5 minutes
**Risk:** LOW (additive only, no changes to existing tables)

---

## QUICK DEPLOY (Copy-Paste Method)

### 1. Open Supabase SQL Editor
- Go to: https://supabase.com/dashboard/project/wvtkuposrlvadyeixlke
- Click: **SQL Editor** (left sidebar)
- Click: **New Query**

### 2. Run the Migration
- Copy the ENTIRE contents of: `/home/visionairy/StockerAI/supabase/migrations/20260111_keyword_learning.sql`
- Paste into SQL Editor
- Click: **Run** (or press Cmd/Ctrl + Enter)

### 3. Verify Success
You should see: **"Success. No rows returned"** or similar success message

---

## VERIFICATION QUERIES

After running the migration, test with these queries:

### Check Tables Created:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%keyword%';
```

**Expected Output:**
```
table_name
--------------
user_keywords
global_keywords
```

---

### Check Indexes Created:
```sql
SELECT indexname
FROM pg_indexes
WHERE tablename IN ('user_keywords', 'global_keywords')
ORDER BY tablename, indexname;
```

**Expected Output:**
```
indexname
-----------------------------------
idx_user_keywords_user
idx_user_keywords_confidence
idx_user_keywords_updated
idx_global_keywords_confidence
idx_global_keywords_user_count
idx_global_keywords_updated
```

---

### Check RLS Enabled:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('user_keywords', 'global_keywords');
```

**Expected Output:**
```
tablename         | rowsecurity
------------------+-------------
user_keywords     | t
global_keywords   | t
```

---

### Test Insert (replace with your user_id):
```sql
-- Get your user_id first
SELECT id FROM auth.users WHERE email = 'your-email@example.com';

-- Test upsert function
SELECT upsert_user_keyword(
  '<your-user-id>'::UUID,
  'test_keyword',
  true  -- success
);

-- Verify it was inserted
SELECT * FROM user_keywords WHERE keyword = 'test_keyword';
```

**Expected Output:**
- Row inserted with success_count = 1, confidence_score = 1.00

---

### Test Retrieval Function:
```sql
SELECT * FROM get_top_user_keywords(
  '<your-user-id>'::UUID,
  0.00,  -- min_confidence (0.00 = all keywords)
  10     -- limit
);
```

**Expected Output:**
- Returns your test_keyword with confidence_score

---

### Test RLS (should only see your own keywords):
```sql
SELECT * FROM user_keywords;
```

**Expected Output:**
- Only shows keywords for currently logged-in user
- If you see other users' keywords = RLS FAILED (but shouldn't happen)

---

## WHAT THIS CREATES

### Tables:
1. **user_keywords** - Per-user vocabulary learning
   - Tracks success/failure per keyword
   - Calculates confidence scores
   - RLS ensures users only see their own data

2. **global_keywords** - Cross-user patterns
   - Aggregated statistics
   - Readable by all authenticated users
   - Only modifiable by service role (via edge function)

### Functions:
1. **upsert_user_keyword(user_id, keyword, success)** - Track keyword usage
2. **get_top_user_keywords(user_id, min_confidence, limit)** - Fetch learned keywords

### Indexes:
- Optimized for confidence score sorting
- Optimized for user lookup
- Optimized for date-based queries

### Triggers:
- Auto-update `updated_at` timestamp on changes

---

## ROLLBACK (if needed)

If something goes wrong, run this to undo:

```sql
-- Drop tables (cascades to indexes, triggers, policies)
DROP TABLE IF EXISTS user_keywords CASCADE;
DROP TABLE IF EXISTS global_keywords CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS upsert_user_keyword(UUID, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS get_top_user_keywords(UUID, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS update_updated_at_column();
```

---

## NEXT STEPS (After Deployment)

1. ✅ Verify all tests pass (above)
2. ⏳ Create `useKeywordLearning.ts` hook (Step 1.2)
3. ⏳ Integrate with Deepgram (Step 1.3)
4. ⏳ Add frontend tracking (Step 1.4)

---

**Ready to deploy?** Just copy-paste the migration SQL into Supabase SQL Editor and click Run!
