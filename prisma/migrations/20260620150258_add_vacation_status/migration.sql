-- Extend UserStatus with a vacation option (🌴). Treated identically to
-- BUSY/SLEEP for push purposes — they all silence banners — but rendered
-- with its own palm-tree icon on every client. Postgres needs ALTER TYPE
-- in its own statement (no value can be used in the same transaction it's
-- introduced in); standalone migration keeps it safe.
ALTER TYPE "UserStatus" ADD VALUE 'VACATION';
