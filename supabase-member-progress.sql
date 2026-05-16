-- ── Admin: view member practice progress across group songs ──────────────────
-- Returns per-member, per-song mastery data for group admins/approvers.
-- Mastery mirrors the client-side cardMastery() + masteryPercent() functions.

CREATE OR REPLACE FUNCTION get_group_member_progress(p_group_id text)
RETURNS TABLE (
  member_user_id  text,
  song_id         text,
  song_title      text,
  in_library      boolean,
  is_known        boolean,
  mastery_percent integer,
  last_active_day text   -- most recent study_log day_key for this user (any song)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only group admins and approvers may call this
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
    gm.user_id                                          AS member_user_id,
    gs.song_id,
    gs.song_title,
    (usl.user_id IS NOT NULL)::boolean                  AS in_library,
    COALESCE(usl.is_known, false)                       AS is_known,
    -- Average cardMastery() over all cards for this user+song.
    -- If no cards exist (song not in library), returns 0.
    COALESCE(
      ROUND(
        AVG(
          CASE
            WHEN c.repetitions = 0 THEN 0
            WHEN c.difficulty   = 0 THEN 25
            WHEN c.difficulty   = 1 THEN 50
            WHEN c.difficulty   = 2 AND c.interval_days >= 21 THEN 100
            ELSE 75  -- difficulty 2, not yet mastered
          END
        )
      )::integer,
      0
    )                                                   AS mastery_percent,
    last_log.day_key                                    AS last_active_day
  FROM group_members gm

  -- All approved songs across this group's practice lists
  CROSS JOIN (
    SELECT DISTINCT pls.song_id, s.title AS song_title
    FROM practice_list_songs pls
    JOIN practice_lists pl ON pl.id = pls.practice_list_id
    JOIN songs s           ON s.id  = pls.song_id
    WHERE pl.group_id  = p_group_id
      AND pls.status   = 'approved'
  ) gs

  -- Whether this member has the song in their library
  LEFT JOIN user_song_library usl
    ON usl.user_id = gm.user_id AND usl.song_id = gs.song_id

  -- Their card progress for this song
  LEFT JOIN cards c
    ON c.user_id = gm.user_id AND c.song_id = gs.song_id

  -- Most recent practice day for this member (any song, from study_log)
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
