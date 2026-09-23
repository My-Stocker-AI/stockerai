-- Transitional contract: one unambiguous customer account per login.
-- Does not move memberships or routes. Multi-account switching requires explicit design.
BEGIN;
CREATE OR REPLACE FUNCTION public.resolve_picking_account(p_user_id uuid)
RETURNS TABLE(account_id uuid, team_user_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_account uuid;
BEGIN
  IF (SELECT count(*) FROM public.account_users au WHERE au.user_id = p_user_id) <> 1 THEN
    RAISE EXCEPTION 'Not available on this account.' USING ERRCODE = '42501';
  END IF;
  SELECT au.account_id INTO v_account FROM public.account_users au WHERE au.user_id = p_user_id;
  RETURN QUERY SELECT v_account, array_agg(au.user_id ORDER BY au.user_id)
    FROM public.account_users au
    WHERE au.account_id = v_account
      AND NOT EXISTS (SELECT 1 FROM public.account_users other
                      WHERE other.user_id = au.user_id AND other.account_id <> v_account);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_picking_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_picking_account(uuid) TO service_role;
COMMIT;
