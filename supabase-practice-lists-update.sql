-- Add UPDATE policy on practice_lists so creators can edit concert dates,
-- names, and list types. The original schema only included SELECT/INSERT/
-- DELETE policies, which caused all UPDATE attempts to silently fail.
--
-- Safe to run on production: only adds permission, never restricts.

DROP POLICY IF EXISTS "practice_lists: update if creator" ON practice_lists;
CREATE POLICY "practice_lists: update if creator" ON practice_lists
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);
