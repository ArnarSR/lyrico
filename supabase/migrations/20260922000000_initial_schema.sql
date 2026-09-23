-- ─────────────────────────────────────────────────────────────────────────────
-- Lyrico — consolidated schema (current end state)
--
-- This flattens the historical supabase-*.sql scripts in the repo root into a
-- single bootstrap migration for a fresh database (local dev, staging).
-- Columns that were added and later dropped (songs.is_known, songs.source_song_id)
-- are intentionally absent; only the final policy version of each table is kept.
--
-- The root-level supabase-*.sql files remain as the record of what was applied
-- to production, in order, over time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  user_id      uuid   REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name text   NOT NULL,
  created_at   bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id          text   PRIMARY KEY,
  name        text   NOT NULL,
  description text,
  created_by  uuid   REFERENCES auth.users(id) NOT NULL,
  invite_code text   UNIQUE NOT NULL,
  created_at  bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id  text   REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id   uuid   REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role      text   NOT NULL DEFAULT 'member',  -- 'admin' | 'approver' | 'member'
  joined_at bigint NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS songs (
  id           text    PRIMARY KEY,
  user_id      uuid    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        text    NOT NULL,
  composer     text,
  voice_part   text,
  lyrics       text    NOT NULL,
  audio_url    text,
  audio_name   text,
  concert_date bigint,
  created_at   bigint  NOT NULL,
  is_public    boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS cards (
  id            text    PRIMARY KEY,
  song_id       text    REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  line_index    integer NOT NULL,
  text          text    NOT NULL,
  interval_days real    NOT NULL,
  repetitions   integer NOT NULL,
  ease_factor   real    NOT NULL,
  next_due      bigint  NOT NULL,
  last_quality  integer,
  difficulty    integer NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_lists (
  id           text   PRIMARY KEY,
  group_id     text   REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  name         text   NOT NULL,
  created_by   uuid   REFERENCES auth.users(id) NOT NULL,
  created_at   bigint NOT NULL,
  list_type    text   NOT NULL DEFAULT 'concert',  -- 'concert' | 'standard'
  concert_date bigint
);

CREATE TABLE IF NOT EXISTS practice_list_songs (
  practice_list_id text   REFERENCES practice_lists(id) ON DELETE CASCADE NOT NULL,
  song_id          text   REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
  added_by         uuid   REFERENCES auth.users(id) NOT NULL,
  added_at         bigint NOT NULL,
  status           text   NOT NULL DEFAULT 'approved',  -- 'approved' | 'pending'
  PRIMARY KEY (practice_list_id, song_id)
);

CREATE TABLE IF NOT EXISTS user_song_library (
  user_id  uuid    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  song_id  text    REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
  is_known boolean NOT NULL DEFAULT false,
  added_at bigint  NOT NULL,
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS user_song_library_user_id_idx
  ON user_song_library(user_id);

CREATE TABLE IF NOT EXISTS user_lists (
  id                      text   PRIMARY KEY,
  user_id                 uuid   REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                    text   NOT NULL,
  created_at              bigint NOT NULL,
  list_type               text   NOT NULL DEFAULT 'standard',
  concert_date            bigint,
  source_practice_list_id text   REFERENCES practice_lists(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS user_lists_source_practice_list_id_idx
  ON user_lists(source_practice_list_id);

CREATE TABLE IF NOT EXISTS user_list_songs (
  list_id  text   REFERENCES user_lists(id) ON DELETE CASCADE NOT NULL,
  song_id  text   REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
  added_at bigint NOT NULL,
  PRIMARY KEY (list_id, song_id)
);

CREATE TABLE IF NOT EXISTS lyric_reports (
  id             text    PRIMARY KEY,
  reporter_id    uuid    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  song_id        text    REFERENCES songs(id) ON DELETE CASCADE NOT NULL,
  line_index     integer NOT NULL,
  current_text   text    NOT NULL,
  suggested_text text,
  status         text    NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'dismissed'
  created_at     bigint  NOT NULL
);

CREATE TABLE IF NOT EXISTS study_log (
  user_id        uuid    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day_key        text    NOT NULL,  -- 'YYYY-MM-DD' in the user's local time
  cards_reviewed integer NOT NULL DEFAULT 0,
  updated_at     bigint  NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

CREATE INDEX IF NOT EXISTS study_log_user_id_day_key_idx
  ON study_log(user_id, day_key DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id         text   PRIMARY KEY,
  user_id    uuid   REFERENCES auth.users(id) ON DELETE SET NULL,
  type       text   NOT NULL CHECK (type IN ('bug', 'suggestion', 'other')),
  message    text   NOT NULL,
  user_agent text,
  created_at bigint NOT NULL
);

-- ── Helper functions ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can consult other tables without RLS recursion.

CREATE OR REPLACE FUNCTION is_group_member(gid text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = gid AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION practice_list_group(plid text)
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT group_id FROM practice_lists WHERE id = plid
$$;

CREATE OR REPLACE FUNCTION is_group_admin_or_approver(p_group_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'approver')
  )
$$;

CREATE OR REPLACE FUNCTION is_in_shared_practice_list(sid text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM practice_list_songs pls
    JOIN practice_lists pl ON pl.id = pls.practice_list_id
    JOIN group_members gm ON gm.group_id = pl.group_id
    WHERE pls.song_id = sid
      AND gm.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION shares_group_with(other_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid() AND gm2.user_id = other_id
  )
$$;

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_list_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_library   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_lists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_list_songs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lyric_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback            ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: read authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles: insert own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles: update own" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- groups
CREATE POLICY "groups: read authenticated" ON groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups: insert" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups: update if creator" ON groups
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "groups: delete if creator" ON groups
  FOR DELETE USING (auth.uid() = created_by);

-- group_members
CREATE POLICY "group_members: read authenticated" ON group_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_members: insert own" ON group_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Admins may change other members' roles, but never their own row, never
-- another admin's row, and never grant admin (no privilege escalation).
CREATE POLICY "group_members: update" ON group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role = 'admin'
    )
    AND group_members.user_id <> auth.uid()
    AND group_members.role <> 'admin'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role = 'admin'
    )
    AND group_members.user_id <> auth.uid()
    AND role IN ('member', 'approver')
  );
CREATE POLICY "group_members: delete" ON group_members
  FOR DELETE USING (
    auth.uid() = user_id
    OR (
      EXISTS (
        SELECT 1 FROM group_members gm2
        WHERE gm2.group_id = group_members.group_id
          AND gm2.user_id = auth.uid()
          AND gm2.role = 'admin'
      )
      AND group_members.role <> 'admin'
      AND group_members.user_id <> auth.uid()
    )
  );

-- songs
CREATE POLICY "songs: select" ON songs
  FOR SELECT USING (
    auth.uid() = user_id
    OR is_public = true
    OR is_in_shared_practice_list(id)
    OR EXISTS (
      SELECT 1 FROM user_song_library
      WHERE song_id = songs.id AND user_id = auth.uid()
    )
  );
CREATE POLICY "songs: insert" ON songs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Owners, plus group admins applying approved lyric corrections to songs in
-- their groups' practice lists.
CREATE POLICY "songs: update" ON songs
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM practice_list_songs pls
      JOIN practice_lists pl ON pl.id = pls.practice_list_id
      JOIN group_members gm  ON gm.group_id = pl.group_id
      WHERE pls.song_id = songs.id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM practice_list_songs pls
      JOIN practice_lists pl ON pl.id = pls.practice_list_id
      JOIN group_members gm  ON gm.group_id = pl.group_id
      WHERE pls.song_id = songs.id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  );
CREATE POLICY "songs: delete" ON songs
  FOR DELETE USING (auth.uid() = user_id);

-- cards: each user owns their own SM-2 state
CREATE POLICY "cards: own rows" ON cards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- practice_lists
CREATE POLICY "practice_lists: read if member" ON practice_lists
  FOR SELECT USING (is_group_member(group_id));
CREATE POLICY "practice_lists: insert if member" ON practice_lists
  FOR INSERT WITH CHECK (is_group_member(group_id) AND auth.uid() = created_by);
CREATE POLICY "practice_lists: update if creator" ON practice_lists
  FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "practice_lists: delete if creator" ON practice_lists
  FOR DELETE USING (auth.uid() = created_by);

-- practice_list_songs
-- Members see approved songs plus their own pending ones; admins/approvers see all.
CREATE POLICY "practice_list_songs: select" ON practice_list_songs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM practice_lists pl
      JOIN group_members gm ON gm.group_id = pl.group_id
      WHERE pl.id = practice_list_songs.practice_list_id
        AND gm.user_id = auth.uid()
        AND (
          gm.role IN ('admin', 'approver')
          OR practice_list_songs.status = 'approved'
          OR practice_list_songs.added_by = auth.uid()
        )
    )
  );
CREATE POLICY "practice_list_songs: insert if member" ON practice_list_songs
  FOR INSERT WITH CHECK (
    is_group_member(practice_list_group(practice_list_id)) AND auth.uid() = added_by
  );
CREATE POLICY "practice_list_songs: update" ON practice_list_songs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM practice_lists pl
      JOIN group_members gm ON gm.group_id = pl.group_id
      WHERE pl.id = practice_list_songs.practice_list_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'approver')
    )
  );
CREATE POLICY "practice_list_songs: delete" ON practice_list_songs
  FOR DELETE USING (
    auth.uid() = added_by
    OR EXISTS (
      SELECT 1 FROM practice_lists pl
      JOIN group_members gm ON gm.group_id = pl.group_id
      WHERE pl.id = practice_list_songs.practice_list_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'approver')
    )
  );

-- user_song_library / user_lists / user_list_songs
CREATE POLICY "library: own" ON user_song_library
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_lists: own" ON user_lists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_list_songs: own" ON user_list_songs
  FOR ALL
  USING (EXISTS (SELECT 1 FROM user_lists WHERE id = list_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM user_lists WHERE id = list_id AND user_id = auth.uid()));

-- lyric_reports
CREATE POLICY "lyric_reports: insert" ON lyric_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "lyric_reports: read own" ON lyric_reports
  FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "lyric_reports: admin read" ON lyric_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM practice_list_songs pls
      JOIN practice_lists pl ON pl.id = pls.practice_list_id
      JOIN group_members gm  ON gm.group_id = pl.group_id
      WHERE pls.song_id = lyric_reports.song_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  );
CREATE POLICY "lyric_reports: admin update" ON lyric_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM practice_list_songs pls
      JOIN practice_lists pl ON pl.id = pls.practice_list_id
      JOIN group_members gm  ON gm.group_id = pl.group_id
      WHERE pls.song_id = lyric_reports.song_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
  );

-- study_log
CREATE POLICY "study_log: own" ON study_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "study_log: read group members" ON study_log
  FOR SELECT USING (shares_group_with(user_id));

-- feedback: submit only, no client-side reads
CREATE POLICY "Users can submit feedback" ON feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── Trigger: keep card text in sync when a song's lyrics are edited ──────────
-- Section-label pattern mirrors isSectionLabel() in src/lib/stanzas.ts.

CREATE OR REPLACE FUNCTION sync_cards_on_lyrics_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_lines text[] := ARRAY[]::text[];
  line      text;
BEGIN
  IF NEW.lyrics = OLD.lyrics THEN RETURN NEW; END IF;

  FOREACH line IN ARRAY string_to_array(NEW.lyrics, E'\n')
  LOOP
    line := trim(line);
    IF length(line) > 0
      AND NOT (line ~* '^(vers(e)?|chorus|refrain|refreng|bridge|pre-?chorus|outro|intro|hook|coda|interlude|tag|strofe)[\s\d]*$')
    THEN
      new_lines := array_append(new_lines, line);
    END IF;
  END LOOP;

  -- PostgreSQL arrays are 1-indexed, line_index is 0-indexed → +1.
  UPDATE cards
  SET    text = new_lines[line_index + 1]
  WHERE  song_id = NEW.id
    AND  line_index < array_length(new_lines, 1)
    AND  text IS DISTINCT FROM new_lines[line_index + 1];

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_cards_lyrics ON songs;
CREATE TRIGGER sync_cards_lyrics
  AFTER UPDATE OF lyrics ON songs
  FOR EACH ROW EXECUTE FUNCTION sync_cards_on_lyrics_change();

-- ── RPC: per-member practice progress for group admins/approvers ────────────
-- Mastery mirrors cardMastery() + masteryPercent() in src/hooks/useSM2.ts.

CREATE OR REPLACE FUNCTION get_group_member_progress(p_group_id text)
RETURNS TABLE (
  member_user_id  text,
  song_id         text,
  song_title      text,
  in_library      boolean,
  is_known        boolean,
  mastery_percent integer,
  last_active_day text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'approver')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id                         AS member_user_id,
    gs.song_id,
    gs.song_title,
    (usl.user_id IS NOT NULL)::boolean AS in_library,
    COALESCE(usl.is_known, false)      AS is_known,
    COALESCE(
      ROUND(
        AVG(
          CASE
            WHEN c.repetitions = 0 THEN 0
            WHEN c.difficulty   = 0 THEN 25
            WHEN c.difficulty   = 1 THEN 50
            WHEN c.difficulty   = 2 AND c.interval_days >= 21 THEN 100
            ELSE 75
          END
        )
      )::integer,
      0
    )                                  AS mastery_percent,
    last_log.day_key                   AS last_active_day
  FROM group_members gm
  CROSS JOIN (
    SELECT DISTINCT pls.song_id, s.title AS song_title
    FROM practice_list_songs pls
    JOIN practice_lists pl ON pl.id = pls.practice_list_id
    JOIN songs s           ON s.id  = pls.song_id
    WHERE pl.group_id = p_group_id
      AND pls.status  = 'approved'
  ) gs
  LEFT JOIN user_song_library usl
    ON usl.user_id = gm.user_id AND usl.song_id = gs.song_id
  LEFT JOIN cards c
    ON c.user_id = gm.user_id AND c.song_id = gs.song_id
  LEFT JOIN LATERAL (
    SELECT day_key
    FROM study_log
    WHERE user_id = gm.user_id
    ORDER BY day_key DESC
    LIMIT 1
  ) last_log ON true
  WHERE gm.group_id = p_group_id
  GROUP BY gm.user_id, gs.song_id, gs.song_title,
           usl.user_id, usl.is_known, last_log.day_key;
END;
$$;
