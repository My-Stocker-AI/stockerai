-- Read-only metadata verification. Does not list or open customer files.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'route-pdfs';

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
