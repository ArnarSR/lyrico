-- ─────────────────────────────────────────────────────────────────────────────
-- lyric_reports: choir members flag suspected errors in song lyrics.
-- Group admins can review, approve (apply the correction), or dismiss.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lyric_reports (
  id            text    PRIMARY KEY,
  reporter_id   uuid    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  song_id       text    REFERENCES songs(id)      ON DELETE CASCADE NOT NULL,
  line_index    integer NOT NULL,
  current_text  text    NOT NULL,
  suggested_text text,
  status        text    NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'dismissed'
  created_at    bigint  NOT NULL
);

ALTER TABLE lyric_reports ENABLE ROW LEVEL SECURITY;

-- Reporters can insert and read their own reports
DROP POLICY IF EXISTS "lyric_reports: insert" ON lyric_reports;
CREATE POLICY "lyric_reports: insert" ON lyric_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "lyric_reports: read own" ON lyric_reports;
CREATE POLICY "lyric_reports: read own" ON lyric_reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- Group admins can read reports for songs in their group's practice lists
DROP POLICY IF EXISTS "lyric_reports: admin read" ON lyric_reports;
CREATE POLICY "lyric_reports: admin read" ON lyric_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM   practice_list_songs pls
      JOIN   practice_lists pl  ON pl.id  = pls.practice_list_id
      JOIN   group_members  gm  ON gm.group_id = pl.group_id
      WHERE  pls.song_id    = lyric_reports.song_id
        AND  gm.user_id     = auth.uid()
        AND  gm.role        = 'admin'
    )
  );

-- Group admins can update (approve / dismiss) those reports
DROP POLICY IF EXISTS "lyric_reports: admin update" ON lyric_reports;
CREATE POLICY "lyric_reports: admin update" ON lyric_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM   practice_list_songs pls
      JOIN   practice_lists pl  ON pl.id  = pls.practice_list_id
      JOIN   group_members  gm  ON gm.group_id = pl.group_id
      WHERE  pls.song_id    = lyric_reports.song_id
        AND  gm.user_id     = auth.uid()
        AND  gm.role        = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Allow group admins to update songs that are in their groups' practice lists.
-- This lets admins apply approved lyric corrections without owning the song.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "songs: update" ON songs;
CREATE POLICY "songs: update" ON songs
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM   practice_list_songs pls
      JOIN   practice_lists pl  ON pl.id  = pls.practice_list_id
      JOIN   group_members  gm  ON gm.group_id = pl.group_id
      WHERE  pls.song_id    = songs.id
        AND  gm.user_id     = auth.uid()
        AND  gm.role        = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM   practice_list_songs pls
      JOIN   practice_lists pl  ON pl.id  = pls.practice_list_id
      JOIN   group_members  gm  ON gm.group_id = pl.group_id
      WHERE  pls.song_id    = songs.id
        AND  gm.user_id     = auth.uid()
        AND  gm.role        = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
