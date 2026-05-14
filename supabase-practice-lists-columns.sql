-- Adds list_type and concert_date columns to practice_lists.
-- Same columns already exist on user_lists. The original groups schema
-- shipped without these; this migration backfills them.
--
-- Safe to run on production: nullable / has default, no data loss.

ALTER TABLE practice_lists
  ADD COLUMN IF NOT EXISTS list_type text NOT NULL DEFAULT 'concert';

ALTER TABLE practice_lists
  ADD COLUMN IF NOT EXISTS concert_date bigint;

-- Tell PostgREST to refresh its schema cache so the new columns are
-- recognised immediately (otherwise you may need to wait a minute or
-- reload the Supabase project).
NOTIFY pgrst, 'reload schema';
