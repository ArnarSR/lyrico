-- Adds a nullable link from a personal user_list to the group practice_list
-- it was copied from. Used to prevent duplicate "Add to my practice list"
-- adds in GroupDetail.
--
-- Backwards compatible: existing rows keep source_practice_list_id = NULL.

ALTER TABLE user_lists
  ADD COLUMN IF NOT EXISTS source_practice_list_id text
  REFERENCES practice_lists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_lists_source_practice_list_id_idx
  ON user_lists(source_practice_list_id);
