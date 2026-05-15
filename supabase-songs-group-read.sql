-- ─────────────────────────────────────────────────────────────────────────────
-- Allow group members to read songs that are in any of their groups'
-- practice lists, even if the song isn't marked public globally.
--
-- Root cause: before this fix, when member A added a non-public song to a
-- group practice list, member B could read the practice_list_songs row
-- (group RLS allowed it) but the follow-up songs query was filtered out
-- by the existing songs RLS. The song would silently vanish from B's view.
--
-- Safe to run on any environment; only expands read access.
-- ─────────────────────────────────────────────────────────────────────────────

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

DROP POLICY IF EXISTS "songs: select" ON songs;
CREATE POLICY "songs: select" ON songs
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR is_public = true
    OR is_in_shared_practice_list(id)
  );

NOTIFY pgrst, 'reload schema';
