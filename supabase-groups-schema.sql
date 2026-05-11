-- ── Community songs ────────────────────────────────────────────────────────────
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

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

-- ── Profiles ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name text NOT NULL,
  created_at bigint NOT NULL
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles: read authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles: insert own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles: update own" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ── Groups ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  invite_code text UNIQUE NOT NULL,
  created_at bigint NOT NULL
);
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups: read authenticated" ON groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups: insert" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups: update if creator" ON groups
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "groups: delete if creator" ON groups
  FOR DELETE USING (auth.uid() = created_by);

-- ── Group members ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
  group_id text REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at bigint NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_members: read authenticated" ON group_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_members: insert own" ON group_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_members: delete own" ON group_members
  FOR DELETE USING (auth.uid() = user_id);

-- ── Practice lists ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_lists (
  id text PRIMARY KEY,
  group_id text REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at bigint NOT NULL
);
ALTER TABLE practice_lists ENABLE ROW LEVEL SECURITY;

-- Security definer to check membership without RLS recursion
CREATE OR REPLACE FUNCTION is_group_member(gid text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = gid AND user_id = auth.uid()
  )
$$;

CREATE POLICY "practice_lists: read if member" ON practice_lists
  FOR SELECT USING (is_group_member(group_id));
CREATE POLICY "practice_lists: insert if member" ON practice_lists
  FOR INSERT WITH CHECK (is_group_member(group_id) AND auth.uid() = created_by);
CREATE POLICY "practice_lists: delete if creator" ON practice_lists
  FOR DELETE USING (auth.uid() = created_by);

-- ── Practice list songs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_list_songs (
  practice_list_id text REFERENCES practice_lists(id) ON DELETE CASCADE NOT NULL,
  song_id text REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
  added_by uuid REFERENCES auth.users(id) NOT NULL,
  added_at bigint NOT NULL,
  PRIMARY KEY (practice_list_id, song_id)
);
ALTER TABLE practice_list_songs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION practice_list_group(plid text)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT group_id FROM practice_lists WHERE id = plid
$$;

CREATE POLICY "practice_list_songs: read if member" ON practice_list_songs
  FOR SELECT USING (is_group_member(practice_list_group(practice_list_id)));
CREATE POLICY "practice_list_songs: insert if member" ON practice_list_songs
  FOR INSERT WITH CHECK (
    is_group_member(practice_list_group(practice_list_id)) AND auth.uid() = added_by
  );
CREATE POLICY "practice_list_songs: delete if adder" ON practice_list_songs
  FOR DELETE USING (auth.uid() = added_by);
