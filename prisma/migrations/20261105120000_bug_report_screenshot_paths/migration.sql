-- Audit P1-11: bug-report screenshots were stored as ~10-year signed URLs,
-- effectively permanent public links. They are now stored as storage paths
-- and signed when an admin reads the report. This turns the old URLs into
-- paths, e.g.
--   https://<project>.supabase.co/storage/v1/object/sign/is-fleet/bug-reports/<uuid>.jpg?token=…
--   → bug-reports/<uuid>.jpg
-- Data only; order of the screenshots is kept.
UPDATE "BugReport" b
SET "screenshots" = ARRAY(
  SELECT regexp_replace(s.v, '^https?://[^?]*/object/sign/is-fleet/([^?]+)(\?.*)?$', '\1')
  FROM unnest(b."screenshots") WITH ORDINALITY AS s(v, ord)
  ORDER BY s.ord
)
WHERE EXISTS (
  SELECT 1 FROM unnest(b."screenshots") AS u(v) WHERE u.v ~ '^https?://'
);
