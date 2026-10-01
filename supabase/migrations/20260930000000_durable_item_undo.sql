-- Durable, item-level undo for an actively displayed picking window.
-- Apply after the revisioned transition and tenant-ownership migrations.
-- Additive: older application builds do not call this function.
BEGIN;

CREATE OR REPLACE FUNCTION public.undo_picking_item(
  p_user_id uuid,
  p_session_id uuid,
  p_operation_id uuid,
  p_revision uuid,
  p_machine_id uuid,
  p_expected jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owner_id uuid;
  s public.sessions%ROWTYPE;
  r public.routes%ROWTYPE;
  m public.machines%ROWTYPE;
  item public.items%ROWTYPE;
  saved public.picking_operations%ROWTYPE;
  window_receipt public.picking_operations%ROWTYPE;
  request_data jsonb;
  answer jsonb;
  window_width integer;
  confirmed integer;
  target integer;
  receipt_count integer;
  receipt_operation uuid;
  revision uuid;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_operation_id IS NULL
    OR p_revision IS NULL OR p_machine_id IS NULL OR p_expected IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid undo request';
  END IF;

  -- Same idempotency and route serialization order as transition_picking.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_operation_id::text, 0));
  owner_id := public.authorized_picking_route_owner(p_user_id, p_session_id);

  SELECT * INTO s
    FROM public.sessions
    WHERE id=p_session_id AND user_id=p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
  END IF;

  SELECT * INTO r
    FROM public.routes
    WHERE id=s.current_route_id AND user_id=owner_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
  END IF;

  SELECT * INTO s
    FROM public.sessions
    WHERE id=p_session_id AND user_id=p_user_id
    FOR UPDATE;
  IF s.current_route_id IS DISTINCT FROM r.id THEN
    RAISE EXCEPTION 'Picking state conflict';
  END IF;

  request_data := jsonb_build_object(
    'protocol', 3,
    'session', p_session_id,
    'revision', p_revision,
    'machine', p_machine_id,
    'action', 'undo',
    'count', 1,
    'direction', p_expected->>'direction',
    'expected', p_expected
  );

  SELECT * INTO saved
    FROM public.picking_operations
    WHERE user_id=p_user_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF saved.request <> request_data THEN
      RAISE EXCEPTION 'Picking state conflict';
    END IF;
    RETURN saved.result;
  END IF;

  IF r.picking_revision <> p_revision
    OR s.current_machine_id IS DISTINCT FROM p_machine_id
    OR s.status <> 'stocking' THEN
    RAISE EXCEPTION 'Picking state conflict';
  END IF;

  SELECT * INTO m
    FROM public.machines
    WHERE id=p_machine_id AND route_id=r.id
    FOR UPDATE;
  IF NOT FOUND OR m.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Picking state conflict';
  END IF;

  IF p_expected IS DISTINCT FROM jsonb_build_object(
    'completed_items', m.completed_items,
    'status', m.status,
    'direction', s.pick_direction
  ) THEN
    RAISE EXCEPTION 'Picking state conflict';
  END IF;

  -- The receipt at the current revision is the only authoritative description
  -- of the unfinished one/two-item window. Never infer it from preference/parity.
  SELECT count(*), (array_agg(operation_id))[1]
    INTO receipt_count, receipt_operation
    FROM public.picking_operations
    WHERE user_id=p_user_id
      AND session_id=s.id
      AND result->>'picking_revision'=p_revision::text;
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'Exact unfinished items are unavailable';
  END IF;

  SELECT * INTO window_receipt
    FROM public.picking_operations
    WHERE user_id=p_user_id AND operation_id=receipt_operation;

  window_width := CASE
    WHEN window_receipt.result->>'product_name2' IS NOT NULL THEN 2
    WHEN window_receipt.result->>'product_name' IS NOT NULL THEN 1
    ELSE 0
  END;

  IF window_receipt.request->>'protocol' IS DISTINCT FROM '3'
    OR window_receipt.request->>'session' IS DISTINCT FROM s.id::text
    OR window_receipt.request->>'direction' IS DISTINCT FROM s.pick_direction
    OR COALESCE(window_receipt.request->>'action','') NOT IN ('start','next','undo')
    OR COALESCE(window_receipt.result->>'action','') NOT IN ('item_ready','next_item','undo_item')
    OR window_receipt.result->>'session_id' IS DISTINCT FROM s.id::text
    OR window_receipt.result->>'machine_id' IS DISTINCT FROM m.id::text
    OR window_receipt.result->>'picking_revision' IS DISTINCT FROM p_revision::text
    OR (window_receipt.result->>'new_completed_items')::integer IS DISTINCT FROM m.completed_items
    OR (window_receipt.result->>'total_items')::integer IS DISTINCT FROM m.total_items
    OR window_width NOT IN (1,2) THEN
    RAISE EXCEPTION 'Saved item window could not be verified';
  END IF;

  -- completed_items is a presented prefix. Removing the current unfinished
  -- window exposes the last confirmed item as a one-item unfinished window.
  confirmed := m.completed_items - window_width;
  IF confirmed < 1 THEN
    RAISE EXCEPTION 'Nothing to undo on this machine';
  END IF;

  target := CASE
    WHEN s.pick_direction='forward' THEN confirmed
    WHEN s.pick_direction='reverse' THEN m.total_items-confirmed+1
    ELSE NULL
  END;
  IF target IS NULL OR target < 1 OR target > m.total_items THEN
    RAISE EXCEPTION 'Saved item window could not be verified';
  END IF;

  SELECT * INTO item
    FROM public.items
    WHERE machine_id=m.id AND sequence=target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Picking data incomplete';
  END IF;

  UPDATE public.machines
    SET completed_items=confirmed
    WHERE id=m.id;

  answer := jsonb_build_object(
    'action', 'undo_item',
    'machine_id', m.id,
    'machine_name', m.machine_name,
    'new_completed_items', confirmed,
    'confirmed_items', confirmed-1,
    'total_items', m.total_items,
    'items_remaining', m.total_items-confirmed,
    'new_item_index', target,
    'direction', s.pick_direction,
    'product_name', item.product_name,
    'quantity', item.quantity,
    'slot', item.slot,
    'inventory_current', item.inventory_current,
    'inventory_parlevel', item.inventory_parlevel
  );

  UPDATE public.routes
    SET picking_revision=gen_random_uuid()
    WHERE id=r.id
    RETURNING picking_revision INTO revision;

  answer := answer || jsonb_build_object(
    'picking_revision', revision,
    'session_id', s.id,
    'operation_id', p_operation_id
  );

  INSERT INTO public.picking_operations(user_id, operation_id, session_id, request, result)
    VALUES(p_user_id, p_operation_id, s.id, request_data, answer);
  RETURN answer;
END;
$$;

REVOKE ALL ON FUNCTION public.undo_picking_item(uuid,uuid,uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_picking_item(uuid,uuid,uuid,uuid,uuid,jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
