-- Route reports can contain customer and inventory information. They are served only through
-- the authenticated API, which checks the route/account relationship and issues a one-minute
-- signed URL. Storage itself therefore needs no browser-facing object policy.

BEGIN;

DO $$
BEGIN
  UPDATE storage.buckets
  SET
    public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf']::text[]
  WHERE id = 'route-pdfs';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Required route-pdfs bucket does not exist';
  END IF;
END;
$$;

COMMIT;
