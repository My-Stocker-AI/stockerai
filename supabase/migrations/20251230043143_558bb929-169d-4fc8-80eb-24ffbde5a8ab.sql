-- Fix search_path for existing functions to address security warnings

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$function$;

-- Fix update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- Fix get_routes_for_date function
CREATE OR REPLACE FUNCTION public.get_routes_for_date(p_user_id uuid, p_date date)
RETURNS TABLE(route_id uuid, route_name text, total_machines integer, total_items integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN QUERY
    SELECT r.id, r.route_name, r.total_machines, r.total_items
    FROM routes r
    WHERE r.user_id = p_user_id AND r.delivery_date = p_date
    ORDER BY r.route_name;
END;
$function$;

-- Fix get_next_item function
CREATE OR REPLACE FUNCTION public.get_next_item(p_session_key text)
RETURNS TABLE(session_id uuid, session_status text, route_name text, machine_name text, location_name text, machine_number integer, product_name text, quantity integer, slot text, items_remaining integer, machine_complete boolean, route_complete boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_session RECORD;
    v_current_item RECORD;
    v_items_in_machine INTEGER;
    v_machines_in_route INTEGER;
BEGIN
    -- Get session with all related data in one query
    SELECT
        s.id as session_id,
        s.status as session_status,
        s.current_route_id,
        s.current_machine_id,
        s.current_item_index,
        r.route_name,
        m.machine_name,
        m.location_name,
        m.machine_number,
        m.sequence as machine_sequence
    INTO v_session
    FROM sessions s
    LEFT JOIN routes r ON s.current_route_id = r.id
    LEFT JOIN machines m ON s.current_machine_id = m.id
    WHERE s.session_key = p_session_key;

    IF v_session IS NULL THEN
        RETURN;
    END IF;

    -- Get current item
    SELECT i.* INTO v_current_item
    FROM items i
    WHERE i.machine_id = v_session.current_machine_id
    AND i.sequence = v_session.current_item_index;

    -- Count remaining items in machine
    SELECT COUNT(*) INTO v_items_in_machine
    FROM items i
    WHERE i.machine_id = v_session.current_machine_id
    AND i.sequence > v_session.current_item_index;

    -- Count remaining machines in route
    SELECT COUNT(*) INTO v_machines_in_route
    FROM machines m
    WHERE m.route_id = v_session.current_route_id
    AND m.sequence > v_session.machine_sequence
    AND m.status != 'skipped';

    RETURN QUERY SELECT
        v_session.session_id,
        v_session.session_status,
        v_session.route_name,
        v_session.machine_name,
        v_session.location_name,
        v_session.machine_number,
        v_current_item.product_name,
        v_current_item.quantity,
        v_current_item.slot,
        v_items_in_machine::INTEGER,
        (v_items_in_machine = 0)::BOOLEAN,
        (v_items_in_machine = 0 AND v_machines_in_route = 0)::BOOLEAN;
END;
$function$;