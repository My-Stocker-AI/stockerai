-- Fix functions with mutable search_path

-- 1. generate_demo_discount_code
CREATE OR REPLACE FUNCTION public.generate_demo_discount_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := 'DEMO-';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$function$;

-- 2. set_demo_discount_code
CREATE OR REPLACE FUNCTION public.set_demo_discount_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF NEW.discount_code IS NULL THEN
        NEW.discount_code := generate_demo_discount_code();
    END IF;
    RETURN NEW;
END;
$function$;

-- 3. update_demo_progress
CREATE OR REPLACE FUNCTION public.update_demo_progress(p_email text, p_items_completed integer, p_machines_completed integer, p_demo_completed boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    UPDATE demo_leads
    SET
        items_completed = p_items_completed,
        machines_completed = p_machines_completed,
        demo_completed = p_demo_completed,
        updated_at = NOW()
    WHERE email = p_email;
END;
$function$;