-- Track which original song a cloned song was copied from.
-- This lets us prevent duplicate clones when a song appears in multiple practice lists.

ALTER TABLE songs ADD COLUMN IF NOT EXISTS source_song_id TEXT REFERENCES songs(id) ON DELETE SET NULL;
