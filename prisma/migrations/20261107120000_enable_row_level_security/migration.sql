-- Audit P1-7: every table in the `public` schema is reachable through
-- Supabase's auto-generated REST API (PostgREST) by anyone holding the
-- project's anon key — a key designed to be public. Nothing in this app uses
-- that API: the backend talks to Postgres directly, as the owner role.
--
-- 1) Row Level Security on, with NO policies = the anon / authenticated API
--    roles see nothing. The backend's role owns the tables, and an owner
--    bypasses RLS (FORCE is not set), so it is unaffected.
-- 2) Belt and braces: take the anon / authenticated API roles' table rights
--    away, and stop Supabase's default grants from reaching tables created
--    LATER by this role (a future migration that forgets step 1 stays closed).
--
-- Guarded so it also runs on a plain Postgres (CI, shadow database) where
-- the Supabase roles don't exist, and never fails the deploy over rights.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tableowner = current_user
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      BEGIN
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'could not change rights of % — RLS alone still applies', r;
      END;
    END IF;
  END LOOP;
END $$;
