-- ─────────────────────────────────────────────────────────────────────────────
-- Lyrico — Consolidated schema audit + idempotent fix
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor on any Lyrico project. Every statement is
-- idempotent (IF NOT EXISTS / DROP+CREATE) so it's safe to re-run.
--
-- It ensures:
--   1. All columns referenced by the app exist on every table.
--   2. Every table has the full set of CRUD RLS policies the app expects.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── songs ────────────────────────────────────────────────────────────────────
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_known boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "songs: own rows" ON songs;
DROP POLICY IF EXISTS "songs: select" ON songs;
DROP POLICY IF EXISTS "songs: insert" ON songs;
DROP POLICY IF EXISTS "songs: update" ON songs;
DROP POLICY IF EXISTS "songs: delete" ON songs;
CREATE POLICY "songs: select" ON songs FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "songs: insert" ON songs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "songs: update" ON songs FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "songs: delete" ON songs FOR DELETE
  USING (auth.uid() = user_id);

-- ── practice_lists ───────────────────────────────────────────────────────────
ALTER TABLE practice_lists ADD COLUMN IF NOT EXISTS list_type text NOT NULL DEFAULT 'concert';
ALTER TABLE practice_lists ADD COLUMN IF NOT EXISTS concert_date bigint;

DROP POLICY IF EXISTS "practice_lists: read if member" ON practice_lists;
DROP POLICY IF EXISTS "practice_lists: insert if member" ON practice_lists;
DROP POLICY IF EXISTS "practice_lists: update if creator" ON practice_lists;
DROP POLICY IF EXISTS "practice_lists: delete if creator" ON practice_lists;
CREATE POLICY "practice_lists: read if member" ON practice_lists
  FOR SELECT USING (is_group_member(group_id));
CREATE POLICY "practice_lists: insert if member" ON practice_lists
  FOR INSERT WITH CHECK (is_group_member(group_id) AND auth.uid() = created_by);
CREATE POLICY "practice_lists: update if creator" ON practice_lists
  FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "practice_lists: delete if creator" ON practice_lists
  FOR DELETE USING (auth.uid() = created_by);

-- ── user_lists ───────────────────────────────────────────────────────────────
ALTER TABLE user_lists ADD COLUMN IF NOT EXISTS list_type text NOT NULL DEFAULT 'standard';
ALTER TABLE user_lists ADD COLUMN IF NOT EXISTS concert_date bigint;
ALTER TABLE user_lists ADD COLUMN IF NOT EXISTS source_practice_list_id text
  REFERENCES practice_lists(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS user_lists_source_practice_list_id_idx
  ON user_lists(source_practice_list_id);

-- user_lists already had a single FOR ALL policy; keep it but ensure it exists
DROP POLICY IF EXISTS "user_lists: own" ON user_lists;
CREATE POLICY "user_lists: own" ON user_lists
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── profiles ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles: read authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles: insert own" ON profiles;
DROP POLICY IF EXISTS "profiles: update own" ON profiles;
CREATE POLICY "profiles: read authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles: insert own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles: update own" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ── groups ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "groups: read authenticated" ON groups;
DROP POLICY IF EXISTS "groups: insert" ON groups;
DROP POLICY IF EXISTS "groups: update if creator" ON groups;
DROP POLICY IF EXISTS "groups: delete if creator" ON groups;
CREATE POLICY "groups: read authenticated" ON groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups: insert" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups: update if creator" ON groups
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "groups: delete if creator" ON groups
  FOR DELETE USING (auth.uid() = created_by);

-- ── group_members ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "group_members: read authenticated" ON group_members;
DROP POLICY IF EXISTS "group_members: insert own" ON group_members;
DROP POLICY IF EXISTS "group_members: delete own" ON group_members;
CREATE POLICY "group_members: read authenticated" ON group_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_members: insert own" ON group_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_members: delete own" ON group_members
  FOR DELETE USING (auth.uid() = user_id);
-- NOTE: no UPDATE policy here on purpose. Roles are set at insert time.
-- If/when an admin-promotion feature ships, add a creator-or-admin UPDATE policy.

-- ── Make sure PostgREST sees all schema changes immediately ─────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification helper: run this to inspect current state.
-- (commented out — uncomment to inspect)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('songs', 'cards', 'profiles', 'feedback',
--                      'groups', 'group_members', 'practice_lists',
--                      'practice_list_songs', 'user_lists', 'user_list_songs')
--  ORDER BY tablename, cmd;
