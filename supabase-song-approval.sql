-- ── Song approval flow + member role management ──────────────────────────────
-- Run this in the Supabase SQL editor.
-- The 'approver' role is plain text — no constraint needs changing.

-- ── 1. Add status column to practice_list_songs ────────────────────────────────
ALTER TABLE practice_list_songs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
-- Existing rows implicitly approved (DEFAULT handles backfill on ALTER TABLE).

-- ── 2. Helper: is any member admin or approver for a group ────────────────────
CREATE OR REPLACE FUNCTION is_group_admin_or_approver(p_group_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'approver')
  )
$$;

-- ── 3. practice_list_songs SELECT policy ──────────────────────────────────────
-- Members see approved songs + own pending; admins/approvers see everything.
DROP POLICY IF EXISTS "practice_list_songs: select" ON practice_list_songs;
DROP POLICY IF EXISTS "practice_list_songs: read if member" ON practice_list_songs;
DROP POLICY IF EXISTS "Members can view practice list songs" ON practice_list_songs;

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

-- ── 4. practice_list_songs UPDATE (approve / reject status change) ────────────
DROP POLICY IF EXISTS "practice_list_songs: update" ON practice_list_songs;
DROP POLICY IF EXISTS "practice_list_songs: update if approver" ON practice_list_songs;

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

-- ── 5. practice_list_songs DELETE ─────────────────────────────────────────────
-- Adder can remove their own; admins/approvers can reject/remove any.
DROP POLICY IF EXISTS "practice_list_songs: delete" ON practice_list_songs;
DROP POLICY IF EXISTS "practice_list_songs: delete if adder" ON practice_list_songs;

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

-- ── 6. group_members UPDATE (role changes — admins only) ─────────────────────
DROP POLICY IF EXISTS "group_members: update" ON group_members;
DROP POLICY IF EXISTS "group_members: update role if admin" ON group_members;

CREATE POLICY "group_members: update" ON group_members
  FOR UPDATE
  USING (
    -- Actor is admin of this group
    EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role = 'admin'
    )
    -- Cannot change own row or another admin's row
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
    -- New role cannot be admin (prevents privilege escalation)
    AND role IN ('member', 'approver')
  );

-- ── 7. group_members DELETE (leave self + admin removes non-admin) ────────────
DROP POLICY IF EXISTS "group_members: delete" ON practice_list_songs;
DROP POLICY IF EXISTS "group_members: delete own" ON group_members;
DROP POLICY IF EXISTS "group_members: delete own or admin" ON group_members;

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

NOTIFY pgrst, 'reload schema';
