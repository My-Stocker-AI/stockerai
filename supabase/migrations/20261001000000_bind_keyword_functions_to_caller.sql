-- Bind the browser-facing keyword-learning RPCs to the authenticated caller.
-- The signatures remain unchanged so already-released clients stay compatible.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_user_keyword(
  p_user_id uuid,
  p_keyword text,
  p_success boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_success_count integer;
  v_failure_count integer;
  v_confidence decimal(3,2);
BEGIN
  IF v_caller_id IS NULL OR p_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Keyword data is available only to its signed-in owner.';
  END IF;

  INSERT INTO public.user_keywords (user_id, keyword, success_count, failure_count)
  VALUES (
    v_caller_id,
    p_keyword,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 0 ELSE 1 END
  )
  ON CONFLICT (user_id, keyword)
  DO UPDATE SET
    success_count = CASE
      WHEN p_success THEN public.user_keywords.success_count + 1
      ELSE public.user_keywords.success_count
    END,
    failure_count = CASE
      WHEN NOT p_success THEN public.user_keywords.failure_count + 1
      ELSE public.user_keywords.failure_count
    END,
    last_used_at = now()
  RETURNING success_count, failure_count
  INTO v_success_count, v_failure_count;

  IF (v_success_count + v_failure_count) > 0 THEN
    v_confidence := round(
      v_success_count::decimal / (v_success_count + v_failure_count),
      2
    );

    UPDATE public.user_keywords
    SET confidence_score = v_confidence
    WHERE user_id = v_caller_id
      AND keyword = p_keyword;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_user_keywords(
  p_user_id uuid,
  p_min_confidence numeric DEFAULT 0.60,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  keyword text,
  confidence_score numeric,
  success_count integer,
  failure_count integer,
  last_used_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL OR p_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Keyword data is available only to its signed-in owner.';
  END IF;

  RETURN QUERY
  SELECT
    uk.keyword,
    uk.confidence_score,
    uk.success_count,
    uk.failure_count,
    uk.last_used_at
  FROM public.user_keywords AS uk
  WHERE uk.user_id = v_caller_id
    AND uk.confidence_score >= p_min_confidence
  ORDER BY uk.confidence_score DESC, uk.success_count DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_keyword(uuid, text, boolean)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_top_user_keywords(uuid, numeric, integer)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_user_keyword(uuid, text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_user_keywords(uuid, numeric, integer)
  TO authenticated;

COMMENT ON FUNCTION public.upsert_user_keyword(uuid, text, boolean) IS
  'Increment only the signed-in caller''s keyword success/failure counts.';
COMMENT ON FUNCTION public.get_top_user_keywords(uuid, numeric, integer) IS
  'Retrieve only the signed-in caller''s learned keywords.';

NOTIFY pgrst, 'reload schema';

COMMIT;
