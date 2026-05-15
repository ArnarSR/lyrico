-- ─────────────────────────────────────────────────────────────────────────────
-- Single source of truth refactor
--
-- Before: each user has a cloned copy of every song they study.
-- After:  songs exist once; user_song_library maps (user, song) with is_known.
--         Cards still carry user_id so each user has their own SM-2 state.
--
-- Run order matters — do not reorder steps.
-- Safe to inspect with SELECT previews before running deletes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Create user_song_library ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_song_library (
  user_id  uuid    REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  song_id  text    REFERENCES songs(id)      ON DELETE CASCADE NOT NULL,
  is_known boolean NOT NULL DEFAULT false,
  added_at bigint  NOT NULL,
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS user_song_library_user_id_idx
  ON user_song_library(user_id);

ALTER TABLE user_song_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library: own" ON user_song_library;
CREATE POLICY "library: own" ON user_song_library
  USING   (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Step 2: Populate library for song owners (non-clones) ────────────────────

INSERT INTO user_song_library (user_id, song_id, is_known, added_at)
SELECT user_id, id, is_known, created_at
FROM   songs
WHERE  source_song_id IS NULL
ON CONFLICT DO NOTHING;

-- ── Step 3: Populate library for clone owners → source songs ─────────────────

INSERT INTO user_song_library (user_id, song_id, is_known, added_at)
SELECT s.user_id, s.source_song_id, s.is_known, s.created_at
FROM   songs s
WHERE  s.source_song_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── Step 4: Re-point clone cards to source song ───────────────────────────────

UPDATE cards
SET    song_id = s.source_song_id
FROM   songs s
WHERE  cards.song_id = s.id
  AND  s.source_song_id IS NOT NULL;

-- ── Step 5a: Remove user_list_songs entries for clones where the source is
--             already in the same list (would violate PK after the update) ────

DELETE FROM user_list_songs uls
USING  songs s, user_list_songs uls2
WHERE  uls.song_id    = s.id
  AND  s.source_song_id IS NOT NULL
  AND  uls2.list_id   = uls.list_id
  AND  uls2.song_id   = s.source_song_id;

-- ── Step 5b: Re-point remaining clone entries to source ───────────────────────

UPDATE user_list_songs
SET    song_id = s.source_song_id
FROM   songs s
WHERE  user_list_songs.song_id = s.id
  AND  s.source_song_id IS NOT NULL;

-- ── Step 6: Delete clone song rows ───────────────────────────────────────────
-- Cards and library entries have already been re-pointed; this is safe.

DELETE FROM songs WHERE source_song_id IS NOT NULL;

-- ── Step 7: Drop columns no longer needed on songs ───────────────────────────

ALTER TABLE songs DROP COLUMN IF EXISTS is_known;
ALTER TABLE songs DROP COLUMN IF EXISTS source_song_id;

-- ── Step 8: Update songs SELECT policy to include library members ─────────────

DROP POLICY IF EXISTS "songs: select" ON songs;
CREATE POLICY "songs: select" ON songs
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_public = true
    OR is_in_shared_practice_list(id)
    OR EXISTS (
      SELECT 1 FROM user_song_library
      WHERE  song_id  = songs.id
        AND  user_id  = auth.uid()
    )
  );

-- ── Step 9: Trigger — sync card text when song lyrics are edited ──────────────
-- When the owner edits a song's lyrics, update the text of matching cards for
-- all users (matched by line_index among non-section-label lines).
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

  -- Update cards whose line still exists in the new lyrics and whose text changed.
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

NOTIFY pgrst, 'reload schema';
