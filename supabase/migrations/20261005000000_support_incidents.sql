BEGIN;

CREATE TABLE IF NOT EXISTS public.support_incidents (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  client_session_id text,
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 2000),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  notification_status text NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending', 'sent', 'failed')),
  notification_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_incidents_account_created_idx
  ON public.support_incidents(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_incidents_status_created_idx
  ON public.support_incidents(status, created_at DESC);

ALTER TABLE public.support_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_incidents_insert_own ON public.support_incidents;
CREATE POLICY support_incidents_insert_own ON public.support_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_user_id = auth.uid()
    AND account_id = public.get_user_account_id(auth.uid())
  );

DROP POLICY IF EXISTS support_incidents_select_own_account ON public.support_incidents;
CREATE POLICY support_incidents_select_own_account ON public.support_incidents
  FOR SELECT TO authenticated
  USING (
    reporter_user_id = auth.uid()
    OR (
      account_id = public.get_user_account_id(auth.uid())
      AND public.has_role(auth.uid(), 'primary_admin')
    )
  );

REVOKE ALL ON public.support_incidents FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON public.support_incidents TO authenticated;
GRANT ALL ON public.support_incidents TO service_role;

COMMIT;
