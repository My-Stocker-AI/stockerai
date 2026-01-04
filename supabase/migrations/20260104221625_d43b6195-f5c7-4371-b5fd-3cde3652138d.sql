-- Fix error-level security issues
-- Issue 1: Enable RLS on accounts table (SUPA_rls_disabled_in_public & SUPA_policy_exists_rls_disabled)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Issue 2: Fix account_users_view to use SECURITY INVOKER instead of SECURITY DEFINER (SUPA_security_definer_view)
-- Drop and recreate the view with security_invoker = true
DROP VIEW IF EXISTS public.account_users_view;

CREATE VIEW public.account_users_view
WITH (security_invoker = true)
AS SELECT 
  au.id,
  au.account_id,
  au.user_id,
  au.role,
  au.can_view_all_routes,
  au.created_at,
  p.email,
  p.first_name,
  p.last_name,
  a.name as account_name
FROM public.account_users au
JOIN public.profiles p ON au.user_id = p.id
JOIN public.accounts a ON au.account_id = a.id;