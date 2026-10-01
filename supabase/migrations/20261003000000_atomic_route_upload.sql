-- Replace a parsed route and all of its children in one database transaction.
-- The operation id makes a browser retry after a lost response return the first
-- committed result instead of deleting and recreating the route a second time.

BEGIN;

-- Existing rows remain reviewable. New capture-and-wait submissions receive a tenant and
-- operation identity so a lost response cannot create duplicate queue entries or overwrite
-- another request's report.
CREATE TABLE IF NOT EXISTS public.pending_unrecognized_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  account_email text,
  vendor text,
  filename text,
  pdf_url text,
  reason text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid,
  request_hash text,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE
);

ALTER TABLE public.pending_unrecognized_formats
  ADD COLUMN IF NOT EXISTS operation_id uuid,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE public.pending_unrecognized_formats
  DROP CONSTRAINT IF EXISTS pending_unrecognized_formats_request_hash_check;
ALTER TABLE public.pending_unrecognized_formats
  ADD CONSTRAINT pending_unrecognized_formats_request_hash_check
  CHECK (request_hash IS NULL OR request_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS pending_unrecognized_formats_operation_id
  ON public.pending_unrecognized_formats(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pending_unrecognized_formats_status_idx
  ON public.pending_unrecognized_formats(status, created_at DESC);

ALTER TABLE public.pending_unrecognized_formats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_unrecognized_formats FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_unrecognized_formats TO service_role;

CREATE TABLE public.route_upload_operations (
  operation_id uuid PRIMARY KEY,
  caller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('processing', 'completed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'processing' AND result IS NULL) OR
         (status = 'completed' AND result IS NOT NULL))
);

CREATE INDEX route_upload_operations_created_at
  ON public.route_upload_operations(created_at);

ALTER TABLE public.route_upload_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.route_upload_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_upload_operations TO service_role;

CREATE FUNCTION public.replace_route_upload(
  p_operation_id uuid,
  p_caller_id uuid,
  p_account_id uuid,
  p_driver_id uuid,
  p_request_hash text,
  p_route_name text,
  p_delivery_date date,
  p_pdf_url text,
  p_driver_name text,
  p_machines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role text;
  caller_can_upload boolean;
  existing_operation public.route_upload_operations%ROWTYPE;
  pending_operation_hash text;
  old_route_ids uuid[];
  inserted_route_id uuid;
  machine_id uuid;
  machine_record jsonb;
  item_record jsonb;
  machine_count integer := 0;
  item_count integer := 0;
  result_payload jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_caller_id IS NULL OR p_account_id IS NULL OR
     p_driver_id IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' OR
     NULLIF(btrim(p_route_name), '') IS NULL OR p_delivery_date IS NULL OR
     jsonb_typeof(p_machines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid route upload payload.';
  END IF;

  SELECT au.role, COALESCE(au.can_upload_routes, false)
    INTO caller_role, caller_can_upload
    FROM public.account_users au
    JOIN public.tenant_user_bindings b USING (user_id, account_id)
    WHERE au.user_id = p_caller_id AND au.account_id = p_account_id
    FOR SHARE OF au;

  IF caller_role IS NULL OR (caller_role <> 'primary_admin' AND NOT caller_can_upload) OR
     NOT EXISTS (
       SELECT 1 FROM public.account_users au
       JOIN public.tenant_user_bindings b USING (user_id, account_id)
       WHERE au.user_id = p_driver_id AND au.account_id = p_account_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not available on this account.';
  END IF;

  -- Serialize both retries of one request and distinct uploads targeting the same route.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT request_hash INTO pending_operation_hash
    FROM public.pending_unrecognized_formats
    WHERE operation_id = p_operation_id;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Upload operation was already used for a review request.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_account_id::text || '|' || p_driver_id::text || '|' || p_route_name || '|' || p_delivery_date::text,
    0
  ));

  SELECT * INTO existing_operation
    FROM public.route_upload_operations
    WHERE operation_id = p_operation_id
    FOR UPDATE;

  IF FOUND THEN
    IF existing_operation.caller_id IS DISTINCT FROM p_caller_id OR
       existing_operation.account_id IS DISTINCT FROM p_account_id OR
       existing_operation.driver_id IS DISTINCT FROM p_driver_id OR
       existing_operation.request_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Upload operation does not match its original request.';
    END IF;
    IF existing_operation.status = 'completed' THEN
      RETURN existing_operation.result;
    END IF;
    -- A processing row can exist only inside this transaction. Reaching this branch means
    -- corrupt state was inserted outside the function; fail closed rather than guessing.
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Upload operation is incomplete.';
  END IF;

  INSERT INTO public.route_upload_operations(
    operation_id, caller_id, account_id, driver_id, request_hash, status
  ) VALUES (
    p_operation_id, p_caller_id, p_account_id, p_driver_id, p_request_hash, 'processing'
  );

  SELECT array_agg(r.id ORDER BY r.id) INTO old_route_ids
    FROM public.routes r
    WHERE r.account_id = p_account_id
      AND r.user_id = p_driver_id
      AND r.route_name = p_route_name
      AND r.delivery_date = p_delivery_date;

  IF old_route_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.current_route_id = ANY(old_route_ids) AND s.status = 'stocking'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Cannot replace a route with an active session.';
  END IF;

  IF old_route_ids IS NOT NULL THEN
    DELETE FROM public.sessions WHERE current_route_id = ANY(old_route_ids);
    DELETE FROM public.routes WHERE id = ANY(old_route_ids);
  END IF;

  INSERT INTO public.routes(
    user_id, account_id, route_name, delivery_date, pdf_url, driver_name
  ) VALUES (
    p_driver_id, p_account_id, p_route_name, p_delivery_date, p_pdf_url, p_driver_name
  ) RETURNING id INTO inserted_route_id;

  FOR machine_record IN SELECT value FROM jsonb_array_elements(p_machines)
  LOOP
    IF jsonb_typeof(machine_record->'items') IS DISTINCT FROM 'array' OR
       NULLIF(btrim(machine_record->>'machine_name'), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid machine upload payload.';
    END IF;

    INSERT INTO public.machines(
      route_id, route_name, machine_name, machine_number, location_name,
      sequence, total_items, completed_items, status
    ) VALUES (
      inserted_route_id,
      p_route_name,
      machine_record->>'machine_name',
      COALESCE((machine_record->>'machine_number')::integer, 0),
      machine_record->>'location_name',
      (machine_record->>'sequence')::integer,
      jsonb_array_length(machine_record->'items'),
      0,
      'pending'
    ) RETURNING id INTO machine_id;

    machine_count := machine_count + 1;

    FOR item_record IN SELECT value FROM jsonb_array_elements(machine_record->'items')
    LOOP
      IF NULLIF(btrim(item_record->>'product_name'), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid item upload payload.';
      END IF;
      INSERT INTO public.items(
        machine_id, machine_name, product_name, quantity, slot, sequence,
        status, inventory_current, inventory_parlevel
      ) VALUES (
        machine_id,
        machine_record->>'machine_name',
        item_record->>'product_name',
        COALESCE((item_record->>'quantity')::integer, 1),
        item_record->>'slot',
        (item_record->>'sequence')::integer,
        'pending',
        COALESCE((item_record->>'inventory_current')::integer, 0),
        COALESCE((item_record->>'inventory_parlevel')::integer, 0)
      );
      item_count := item_count + 1;
    END LOOP;
  END LOOP;

  IF machine_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No machines with items found in PDF.';
  END IF;

  UPDATE public.routes SET total_machines = machine_count, total_items = item_count
    WHERE id = inserted_route_id;

  INSERT INTO public.route_assignments(route_id, user_id, assigned_by)
    VALUES(inserted_route_id, p_driver_id, p_caller_id)
    ON CONFLICT(route_id, user_id) DO UPDATE SET
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = now();

  result_payload := jsonb_build_object(
    'route_id', inserted_route_id,
    'assignment_confirmed', true,
    'route', p_route_name,
    'machines', machine_count,
    'items', item_count,
    'date', p_delivery_date
  );

  UPDATE public.route_upload_operations SET
    status = 'completed', result = result_payload, updated_at = now()
    WHERE operation_id = p_operation_id;

  RETURN result_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_route_upload(
  uuid, uuid, uuid, uuid, text, text, date, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_route_upload(
  uuid, uuid, uuid, uuid, text, text, date, text, text, jsonb
) TO service_role;

CREATE FUNCTION public.record_pending_format_upload(
  p_operation_id uuid,
  p_caller_id uuid,
  p_account_id uuid,
  p_user_id uuid,
  p_request_hash text,
  p_account_email text,
  p_vendor text,
  p_filename text,
  p_pdf_url text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role text;
  caller_can_upload boolean;
  existing_row public.pending_unrecognized_formats%ROWTYPE;
  route_operation_hash text;
  pending_id uuid;
BEGIN
  IF p_operation_id IS NULL OR p_caller_id IS NULL OR p_account_id IS NULL OR
     p_user_id IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' OR
     NULLIF(btrim(p_filename), '') IS NULL OR NULLIF(btrim(p_pdf_url), '') IS NULL OR
     NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid pending-format upload payload.';
  END IF;

  SELECT au.role, COALESCE(au.can_upload_routes, false)
    INTO caller_role, caller_can_upload
    FROM public.account_users au
    JOIN public.tenant_user_bindings b USING (user_id, account_id)
    WHERE au.user_id = p_caller_id AND au.account_id = p_account_id
    FOR SHARE OF au;

  IF caller_role IS NULL OR (caller_role <> 'primary_admin' AND NOT caller_can_upload) OR
     NOT EXISTS (
       SELECT 1 FROM public.account_users au
       JOIN public.tenant_user_bindings b USING (user_id, account_id)
       WHERE au.user_id = p_user_id AND au.account_id = p_account_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not available on this account.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT request_hash INTO route_operation_hash
    FROM public.route_upload_operations
    WHERE operation_id = p_operation_id;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Upload operation was already used for a route request.';
  END IF;

  SELECT * INTO existing_row
    FROM public.pending_unrecognized_formats
    WHERE operation_id = p_operation_id
    FOR UPDATE;

  IF FOUND THEN
    IF existing_row.account_id IS DISTINCT FROM p_account_id OR
       existing_row.user_id IS DISTINCT FROM p_user_id OR
       existing_row.request_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Upload operation does not match its original request.';
    END IF;
    RETURN jsonb_build_object(
      'pending_id', existing_row.id,
      'created', false,
      'status', existing_row.status
    );
  END IF;

  INSERT INTO public.pending_unrecognized_formats(
    operation_id, request_hash, account_id, user_id, account_email,
    vendor, filename, pdf_url, reason
  ) VALUES (
    p_operation_id, p_request_hash, p_account_id, p_user_id, p_account_email,
    p_vendor, p_filename, p_pdf_url, p_reason
  ) RETURNING id INTO pending_id;

  RETURN jsonb_build_object('pending_id', pending_id, 'created', true, 'status', 'new');
END;
$$;

REVOKE ALL ON FUNCTION public.record_pending_format_upload(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pending_format_upload(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
