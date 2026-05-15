-- ─────────────────────────────────────────────────────────────────────────────
-- study_log: per-user-per-day card review tally.
-- Source of truth for streaks and group scoreboards.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS study_log (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day_key text NOT NULL,            -- 'YYYY-MM-DD' in the user's local time
  cards_reviewed integer NOT NULL DEFAULT 0,
  updated_at bigint NOT NULL,       -- epoch ms; used for tiebreakers
  PRIMARY KEY (user_id, day_key)
);

CREATE INDEX IF NOT EXISTS study_log_user_id_day_key_idx
  ON study_log(user_id, day_key DESC);

ALTER TABLE study_log ENABLE ROW LEVEL SECURITY;

-- A user can read/write their own rows.
DROP POLICY IF EXISTS "study_log: own" ON study_log;
CREATE POLICY "study_log: own" ON study_log
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Any user can read rows belonging to people who share a group with them.
-- Used to power group scoreboards.
CREATE OR REPLACE FUNCTION shares_group_with(other_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid() AND gm2.user_id = other_id
  )
$$;

DROP POLICY IF EXISTS "study_log: read group members" ON study_log;
CREATE POLICY "study_log: read group members" ON study_log
  FOR SELECT
  USING (shares_group_with(user_id));

NOTIFY pgrst, 'reload schema';
