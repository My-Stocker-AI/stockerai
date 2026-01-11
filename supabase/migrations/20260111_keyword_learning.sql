-- Keyword Learning System for Stocker AI
-- Purpose: Track and learn user-specific vocabulary to improve voice recognition
-- Date: 2026-01-11
-- Session: 32

-- ============================================================================
-- TABLE: user_keywords
-- Purpose: Store per-user keyword learning data
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  success_count INTEGER DEFAULT 0 CHECK (success_count >= 0),
  failure_count INTEGER DEFAULT 0 CHECK (failure_count >= 0),
  confidence_score DECIMAL(3,2) DEFAULT 0.50 CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

-- ============================================================================
-- TABLE: global_keywords
-- Purpose: Aggregate keyword data across all users for global patterns
-- ============================================================================
CREATE TABLE IF NOT EXISTS global_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  total_success INTEGER DEFAULT 0 CHECK (total_success >= 0),
  total_failure INTEGER DEFAULT 0 CHECK (total_failure >= 0),
  user_count INTEGER DEFAULT 0 CHECK (user_count >= 0),
  confidence_score DECIMAL(3,2) DEFAULT 0.50 CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_keywords_user ON user_keywords(user_id);
CREATE INDEX IF NOT EXISTS idx_user_keywords_confidence ON user_keywords(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_keywords_updated ON user_keywords(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_keywords_confidence ON global_keywords(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_global_keywords_user_count ON global_keywords(user_count DESC);
CREATE INDEX IF NOT EXISTS idx_global_keywords_updated ON global_keywords(updated_at DESC);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_keywords_updated_at
  BEFORE UPDATE ON user_keywords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_global_keywords_updated_at
  BEFORE UPDATE ON global_keywords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES: Row Level Security
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE user_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_keywords ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own keywords
CREATE POLICY "Users can view own keywords"
  ON user_keywords FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own keywords
CREATE POLICY "Users can insert own keywords"
  ON user_keywords FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own keywords
CREATE POLICY "Users can update own keywords"
  ON user_keywords FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own keywords
CREATE POLICY "Users can delete own keywords"
  ON user_keywords FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Authenticated users can view global keywords
CREATE POLICY "Authenticated users can view global keywords"
  ON global_keywords FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only service role can modify global keywords (via edge function)
CREATE POLICY "Service role can modify global keywords"
  ON global_keywords FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTION: Upsert user keyword (increment counts)
-- Purpose: Safely update keyword stats or create if doesn't exist
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_user_keyword(
  p_user_id UUID,
  p_keyword TEXT,
  p_success BOOLEAN
)
RETURNS void AS $$
DECLARE
  v_success_count INTEGER;
  v_failure_count INTEGER;
  v_confidence DECIMAL(3,2);
BEGIN
  -- Insert or get existing counts
  INSERT INTO user_keywords (user_id, keyword, success_count, failure_count)
  VALUES (
    p_user_id,
    p_keyword,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END
  )
  ON CONFLICT (user_id, keyword)
  DO UPDATE SET
    success_count = CASE WHEN p_success THEN user_keywords.success_count + 1 ELSE user_keywords.success_count END,
    failure_count = CASE WHEN NOT p_success THEN user_keywords.failure_count + 1 ELSE user_keywords.failure_count END,
    last_used_at = NOW()
  RETURNING success_count, failure_count INTO v_success_count, v_failure_count;

  -- Calculate and update confidence score
  IF (v_success_count + v_failure_count) > 0 THEN
    v_confidence := ROUND(v_success_count::DECIMAL / (v_success_count + v_failure_count), 2);

    UPDATE user_keywords
    SET confidence_score = v_confidence
    WHERE user_id = p_user_id AND keyword = p_keyword;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_user_keyword(UUID, TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- HELPER FUNCTION: Get top keywords for user
-- Purpose: Fetch keywords with confidence > threshold, sorted by confidence
-- ============================================================================
CREATE OR REPLACE FUNCTION get_top_user_keywords(
  p_user_id UUID,
  p_min_confidence DECIMAL DEFAULT 0.60,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  keyword TEXT,
  confidence_score DECIMAL,
  success_count INTEGER,
  failure_count INTEGER,
  last_used_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    uk.keyword,
    uk.confidence_score,
    uk.success_count,
    uk.failure_count,
    uk.last_used_at
  FROM user_keywords uk
  WHERE uk.user_id = p_user_id
    AND uk.confidence_score >= p_min_confidence
  ORDER BY uk.confidence_score DESC, uk.success_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_top_user_keywords(UUID, DECIMAL, INTEGER) TO authenticated;

-- ============================================================================
-- COMMENTS for documentation
-- ============================================================================
COMMENT ON TABLE user_keywords IS 'Stores per-user keyword learning data for voice recognition improvement';
COMMENT ON TABLE global_keywords IS 'Aggregated keyword data across all users for global vocabulary patterns';
COMMENT ON COLUMN user_keywords.confidence_score IS 'Calculated as success_count / (success_count + failure_count)';
COMMENT ON COLUMN global_keywords.user_count IS 'Number of unique users who have used this keyword';
COMMENT ON FUNCTION upsert_user_keyword IS 'Safely increment keyword success/failure counts and update confidence score';
COMMENT ON FUNCTION get_top_user_keywords IS 'Retrieve user keywords above confidence threshold, sorted by score';

-- ============================================================================
-- VERIFICATION QUERIES (for testing after deployment)
-- ============================================================================
-- Run these queries in Supabase SQL Editor to verify migration:
--
-- 1. Check tables created:
--    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%keyword%';
--
-- 2. Check indexes created:
--    SELECT indexname FROM pg_indexes WHERE tablename IN ('user_keywords', 'global_keywords');
--
-- 3. Check RLS enabled:
--    SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('user_keywords', 'global_keywords');
--
-- 4. Test insert (replace with your user_id):
--    SELECT upsert_user_keyword('<your-user-id>'::UUID, 'test_keyword', true);
--
-- 5. Test retrieval:
--    SELECT * FROM get_top_user_keywords('<your-user-id>'::UUID, 0.00, 10);
--
-- 6. Test RLS (should only see your own keywords):
--    SELECT * FROM user_keywords;
