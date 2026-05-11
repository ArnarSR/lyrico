-- ── Personal lists (My Songs organisation) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_lists (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at bigint NOT NULL
);
ALTER TABLE user_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_lists: own" ON user_lists;
CREATE POLICY "user_lists: own" ON user_lists
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS user_list_songs (
  list_id text REFERENCES user_lists(id) ON DELETE CASCADE NOT NULL,
  song_id text REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
  added_at bigint NOT NULL,
  PRIMARY KEY (list_id, song_id)
);
ALTER TABLE user_list_songs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_list_songs: own" ON user_list_songs;
CREATE POLICY "user_list_songs: own" ON user_list_songs
  USING (EXISTS (SELECT 1 FROM user_lists WHERE id = list_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM user_lists WHERE id = list_id AND user_id = auth.uid()));
