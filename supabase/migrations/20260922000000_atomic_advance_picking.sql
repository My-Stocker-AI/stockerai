-- Additive release: apply and verify this migration before deploying the API/client.
-- Existing clients keep their existing endpoint contract; never fall back from v2
-- to the legacy mutation after a v2 failure (the write may already have committed).
BEGIN;

CREATE TABLE public.picking_operations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);
ALTER TABLE public.picking_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.picking_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.picking_operations TO service_role;

CREATE FUNCTION public.advance_picking(
  p_user_id uuid, p_team_user_ids uuid[], p_session_id uuid,
  p_operation_id uuid, p_machine_id uuid, p_completed_items integer,
  p_count integer, p_direction text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  s public.sessions%ROWTYPE;
  m public.machines%ROWTYPE;
  destination public.machines%ROWTYPE;
  first_item public.items%ROWTYPE;
  second_item public.items%ROWTYPE;
  saved public.picking_operations%ROWTYPE;
  request_data jsonb;
  result_data jsonb;
  target integer;
  step integer;
  presented integer;
  returning_to_skipped boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_operation_id IS NULL OR p_session_id IS NULL
     OR p_machine_id IS NULL OR p_completed_items IS NULL OR p_completed_items < 0
     OR p_count IS NULL OR p_count NOT IN (1, 2)
     OR p_direction IS NULL OR p_direction NOT IN ('forward', 'reverse') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid picking request';
  END IF;
  request_data := jsonb_build_object('session', p_session_id, 'machine', p_machine_id,
    'completed', p_completed_items, 'count', p_count, 'direction', p_direction);

  -- Serializes the same key even when it is submitted for different sessions.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_operation_id::text, 0));
  SELECT * INTO s FROM public.sessions
    WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not available on this account.';
  END IF;
  -- Membership comes from the API's verified Caller, never from the request body.
  PERFORM 1 FROM public.routes WHERE id = s.current_route_id
    AND user_id = ANY(p_team_user_ids) FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not available on this account.';
  END IF;

  SELECT * INTO saved FROM public.picking_operations
    WHERE user_id = p_user_id AND operation_id = p_operation_id;
  IF FOUND THEN
    IF saved.request <> request_data THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Picking state conflict';
    END IF;
    RETURN saved.result;
  END IF;
  IF s.status <> 'stocking' OR s.current_machine_id IS DISTINCT FROM p_machine_id
     OR s.pick_direction IS DISTINCT FROM p_direction THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Picking state conflict';
  END IF;
  SELECT * INTO m FROM public.machines
    WHERE id = p_machine_id AND route_id = s.current_route_id FOR UPDATE;
  IF NOT FOUND OR m.status <> 'in_progress'
     OR m.completed_items IS DISTINCT FROM p_completed_items THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Picking state conflict';
  END IF;

  IF m.completed_items >= m.total_items THEN
    UPDATE public.machines SET status = 'completed', skipped_at_item = NULL WHERE id = m.id;
    SELECT * INTO destination FROM public.machines
      WHERE route_id = s.current_route_id AND sequence > m.sequence
        AND status NOT IN ('completed', 'skipped') ORDER BY sequence LIMIT 1;
    IF NOT FOUND THEN
      SELECT * INTO destination FROM public.machines
        WHERE route_id = s.current_route_id AND status = 'skipped'
        ORDER BY sequence LIMIT 1;
      returning_to_skipped := FOUND;
    END IF;
    IF destination.id IS NOT NULL THEN
      UPDATE public.sessions SET current_machine_id = destination.id WHERE id = s.id;
      result_data := jsonb_build_object('action', 'next_machine',
        'machine_complete', true, 'route_complete', false, 'session_complete', false,
        'completed_machine', m.machine_name, 'completed_machine_number', m.machine_number,
        'completed_location', m.location_name, 'next_machine_id', destination.id,
        'next_machine', destination.machine_name, 'next_machine_number', destination.machine_number,
        'next_location', destination.location_name, 'returning_to_skipped', returning_to_skipped);
    ELSE
      -- Do not close over unfinished work earlier in the route.
      IF EXISTS (SELECT 1 FROM public.machines WHERE route_id = s.current_route_id AND status <> 'completed') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Picking state conflict';
      END IF;
      UPDATE public.sessions SET status = 'completed' WHERE id = s.id;
      result_data := jsonb_build_object('action', 'complete', 'machine_complete', true,
        'route_complete', true, 'session_complete', true, 'completed_route', 'Route', 'total_routes', 1);
    END IF;
  ELSE
    step := CASE WHEN p_direction = 'forward' THEN 1 ELSE -1 END;
    target := CASE WHEN step = 1 THEN m.completed_items + 1 ELSE m.total_items - m.completed_items END;
    SELECT * INTO first_item FROM public.items WHERE machine_id = m.id AND sequence = target;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Picking data incomplete';
    END IF;
    presented := LEAST(p_count, m.total_items - m.completed_items);
    IF presented = 2 THEN
      SELECT * INTO second_item FROM public.items WHERE machine_id = m.id AND sequence = target + step;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Picking data incomplete';
      END IF;
    END IF;
    UPDATE public.machines SET completed_items = m.completed_items + presented WHERE id = m.id;
    result_data := jsonb_build_object('action', 'next_item', 'machine_complete', false,
      'route_complete', false, 'session_complete', false, 'machine_id', m.id, 'machine_name', m.machine_name,
      'product_name', first_item.product_name, 'quantity', first_item.quantity, 'slot', first_item.slot,
      'inventory_current', first_item.inventory_current, 'inventory_parlevel', first_item.inventory_parlevel,
      'product_name2', second_item.product_name, 'quantity2', second_item.quantity, 'slot2', second_item.slot,
      'inventory_current2', second_item.inventory_current, 'inventory_parlevel2', second_item.inventory_parlevel,
      'items_remaining', m.total_items - m.completed_items - presented, 'items_to_increment', presented,
      'new_completed_items', m.completed_items + presented, 'total_items', m.total_items,
      'new_item_index', target + (presented - 1) * step);
  END IF;
  result_data := result_data || jsonb_build_object('session_record_id', s.id, 'operation_id', p_operation_id);
  INSERT INTO public.picking_operations(user_id, operation_id, session_id, request, result)
    VALUES (p_user_id, p_operation_id, s.id, request_data, result_data);
  RETURN result_data;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_picking(uuid, uuid[], uuid, uuid, uuid, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_picking(uuid, uuid[], uuid, uuid, uuid, integer, integer, text)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
