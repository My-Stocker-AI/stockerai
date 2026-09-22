-- Apply after 20260922000000. Existing endpoints remain for staged rollout.
BEGIN;
ALTER TABLE public.routes ADD COLUMN picking_revision uuid NOT NULL DEFAULT gen_random_uuid();

-- Observe legacy writers too. A reset to identical counts still invalidates old intent.
CREATE FUNCTION public.invalidate_picking_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_route uuid; new_route uuid;
BEGIN
  IF TG_TABLE_NAME = 'machines' THEN
    IF TG_OP <> 'INSERT' THEN old_route := OLD.route_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_route := NEW.route_id; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_route := OLD.current_route_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_route := NEW.current_route_id; END IF;
  END IF;
  UPDATE public.routes SET picking_revision = gen_random_uuid()
    WHERE id IN (old_route, new_route);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_picking_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER picking_machine_revision AFTER INSERT OR UPDATE OR DELETE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_picking_revision();
CREATE TRIGGER picking_session_revision AFTER INSERT OR UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.invalidate_picking_revision();

CREATE FUNCTION public.picking_context(p_user_id uuid, p_team_user_ids uuid[], p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.sessions%ROWTYPE; r public.routes%ROWTYPE; ms jsonb;
BEGIN
  SELECT * INTO s FROM public.sessions WHERE id=p_session_id AND user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.'; END IF;
  SELECT * INTO r FROM public.routes WHERE id=s.current_route_id AND user_id=ANY(p_team_user_ids) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.'; END IF;
  SELECT * INTO s FROM public.sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF s.current_route_id IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id',id,'completedItems',completed_items,'status',status) ORDER BY sequence)
    INTO ms FROM public.machines WHERE route_id=r.id;
  RETURN jsonb_build_object('session_id',s.id,'route_id',r.id,'picking_revision',r.picking_revision,
    'current_machine_id',s.current_machine_id,'pick_direction',s.pick_direction,'status',s.status,'machines',ms);
END;
$$;
REVOKE ALL ON FUNCTION public.picking_context(uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.picking_context(uuid,uuid[],uuid) TO service_role;

CREATE FUNCTION public.transition_picking(p_user_id uuid, p_team_user_ids uuid[], p_session_id uuid,
  p_operation_id uuid, p_revision uuid, p_machine_id uuid, p_action text,
  p_count integer, p_direction text, p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.sessions%ROWTYPE; r public.routes%ROWTYPE; m public.machines%ROWTYPE;
  dest public.machines%ROWTYPE; i1 public.items%ROWTYPE; i2 public.items%ROWTYPE;
  saved public.picking_operations%ROWTYPE; request_data jsonb; answer jsonb;
  base integer; shown integer; target integer; step integer; remaining integer; revision uuid;
BEGIN
  IF p_operation_id IS NULL OR p_revision IS NULL OR p_machine_id IS NULL
    OR p_action IS NULL OR p_action NOT IN ('next','start','skip','back','reset')
    OR p_count IS NULL OR p_count NOT IN (1,2)
    OR p_direction IS NULL OR p_direction NOT IN ('forward','reverse') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid picking request';
  END IF;
  request_data := jsonb_build_object('protocol',3,'session',p_session_id,'revision',p_revision,
    'machine',p_machine_id,'action',p_action,'count',p_count,'direction',p_direction,'expected',p_expected);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_operation_id::text,0));
  SELECT * INTO s FROM public.sessions WHERE id=p_session_id AND user_id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.'; END IF;
  -- All new transitions serialize at the route, including different team sessions.
  SELECT * INTO r FROM public.routes WHERE id=s.current_route_id AND user_id=ANY(p_team_user_ids) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.'; END IF;
  SELECT * INTO s FROM public.sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF s.current_route_id IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
  SELECT * INTO saved FROM public.picking_operations WHERE user_id=p_user_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF saved.request <> request_data THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
    RETURN saved.result;
  END IF;
  IF r.picking_revision <> p_revision OR s.current_machine_id IS DISTINCT FROM p_machine_id
    OR (s.status <> 'stocking' AND NOT (p_action='reset' AND s.status='completed')) THEN
    RAISE EXCEPTION 'Picking state conflict';
  END IF;
  SELECT * INTO m FROM public.machines WHERE id=p_machine_id AND route_id=r.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
  IF p_expected IS DISTINCT FROM jsonb_build_object('completed_items',m.completed_items,
    'status',m.status,'direction',s.pick_direction) THEN RAISE EXCEPTION 'Picking state conflict'; END IF;

  IF p_action='next' THEN
    -- Reuse reviewed advancement inside this transaction, then replace its receipt
    -- with the versioned request/result. A failure rolls back both nested writes.
    answer := public.advance_picking(p_user_id,p_team_user_ids,p_session_id,p_operation_id,
      m.id,m.completed_items,p_count,p_direction);
  ELSIF p_action='start' THEN
    IF m.status NOT IN ('pending','skipped','in_progress') THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
    base := CASE WHEN m.skipped_at_item IS NOT NULL AND s.pick_direction=p_direction
      THEN m.completed_items ELSE 0 END;
    IF m.status='in_progress' THEN
      IF s.pick_direction <> p_direction OR m.completed_items <= 0 THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
      -- Route selection may return an already-started machine. Reannounce without
      -- advancing it, including a mode switch from one to two items.
      base := GREATEST(0,m.completed_items-p_count);
    ELSIF base=m.total_items AND base>0 THEN
      -- A skip after the final presentation must remain recoverable. Reannounce
      -- the final window; the explicit next command performs completion.
      base := GREATEST(0,base-p_count);
    END IF;
    IF base >= m.total_items OR base < 0 THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
    shown := LEAST(p_count,m.total_items-base);
    IF m.status='in_progress' THEN shown := m.completed_items-base; END IF;
    step := CASE WHEN p_direction='forward' THEN 1 ELSE -1 END;
    target := CASE WHEN step=1 THEN base+1 ELSE m.total_items-base END;
    SELECT * INTO i1 FROM public.items WHERE machine_id=m.id AND sequence=target;
    IF NOT FOUND THEN RAISE EXCEPTION 'Picking data incomplete'; END IF;
    IF shown=2 THEN
      SELECT * INTO i2 FROM public.items WHERE machine_id=m.id AND sequence=target+step;
      IF NOT FOUND THEN RAISE EXCEPTION 'Picking data incomplete'; END IF;
    END IF;
    UPDATE public.machines SET status='in_progress',completed_items=base+shown,skipped_at_item=NULL WHERE id=m.id;
    UPDATE public.sessions SET pick_direction=p_direction WHERE id=s.id;
    answer := jsonb_build_object('action','item_ready','machine_id',m.id,'machine_name',m.machine_name,
      'new_completed_items',base+shown,'total_items',m.total_items,'items_remaining',m.total_items-base-shown,
      'new_item_index',target,'direction',p_direction,'product_name',i1.product_name,'quantity',i1.quantity,
      'slot',i1.slot,'inventory_current',i1.inventory_current,'inventory_parlevel',i1.inventory_parlevel,
      'product_name2',i2.product_name,'quantity2',i2.quantity,'slot2',i2.slot,
      'inventory_current2',i2.inventory_current,'inventory_parlevel2',i2.inventory_parlevel);
  ELSIF p_action='skip' THEN
    IF m.status='completed' THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
    IF m.status <> 'skipped' THEN UPDATE public.machines SET status='skipped' WHERE id=m.id; END IF;
    SELECT * INTO dest FROM public.machines WHERE route_id=r.id AND id<>m.id
      AND status NOT IN ('completed','skipped') ORDER BY (sequence>m.sequence) DESC,sequence LIMIT 1;
    IF FOUND THEN
      UPDATE public.sessions SET current_machine_id=dest.id WHERE id=s.id;
      answer := jsonb_build_object('action','next_machine','skipped_machine_id',m.id,'skipped_machine',m.machine_name,
        'next_machine_id',dest.id,'next_machine',dest.machine_name,'next_machine_number',dest.machine_number,
        'next_location',dest.location_name,'spoken',format('Skipped %s. Next is %s at %s. Where would you like to begin?',m.machine_name,dest.machine_name,dest.location_name));
    ELSE
      SELECT count(*) INTO remaining FROM public.machines WHERE route_id=r.id AND status='skipped';
      answer := jsonb_build_object('action','offer_go_back','skipped_machine_id',m.id,'skipped_machine',m.machine_name,
        'remaining_skipped',remaining,'spoken','Skipped work remains. Your route is still open. What would you like to do?');
    END IF;
  ELSIF p_action='back' THEN
    SELECT * INTO dest FROM public.machines WHERE route_id=r.id AND status='skipped' ORDER BY sequence LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Picking state conflict'; END IF;
    UPDATE public.machines SET status='pending' WHERE id=dest.id;
    UPDATE public.sessions SET current_machine_id=dest.id WHERE id=s.id;
    answer := jsonb_build_object('action','machine_ready','machine_id',dest.id,'machine_name',dest.machine_name,
      'machine_number',dest.machine_number,'location',dest.location_name,'total_items',dest.total_items,
      'completed_items',dest.completed_items,'spoken',format('Returning to %s at %s. Where would you like to begin?',dest.machine_name,dest.location_name));
  ELSE
    IF r.user_id <> p_user_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not available on this account.';
    END IF;
    -- Reset is explicit and route-wide; never reset another active driver's route.
    IF EXISTS(SELECT 1 FROM public.sessions WHERE current_route_id=r.id AND id<>s.id AND status='stocking') THEN
      RAISE EXCEPTION 'Picking state conflict';
    END IF;
    SELECT * INTO dest FROM public.machines WHERE route_id=r.id ORDER BY sequence LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Picking data incomplete'; END IF;
    UPDATE public.machines SET status='pending',completed_items=0,skipped_at_item=NULL WHERE route_id=r.id;
    UPDATE public.sessions SET current_machine_id=dest.id,pick_direction='forward',status='stocking',completed_at=NULL WHERE id=s.id;
    answer := jsonb_build_object('action','route_reset','machine_id',dest.id,'spoken','Route progress reset. Choose where to begin.');
  END IF;
  -- Even a no-op deferral consumes a revision, so another old command conflicts.
  UPDATE public.routes SET picking_revision=gen_random_uuid() WHERE id=r.id RETURNING picking_revision INTO revision;
  answer := answer || jsonb_build_object('picking_revision',revision,'session_id',s.id,'operation_id',p_operation_id);
  IF p_action='next' THEN
    UPDATE public.picking_operations SET request=request_data,result=answer WHERE user_id=p_user_id AND operation_id=p_operation_id;
  ELSE
    INSERT INTO public.picking_operations(user_id,operation_id,session_id,request,result)
      VALUES(p_user_id,p_operation_id,s.id,request_data,answer);
  END IF;
  RETURN answer;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_picking(uuid,uuid[],uuid,uuid,uuid,uuid,text,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_picking(uuid,uuid[],uuid,uuid,uuid,uuid,text,integer,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
