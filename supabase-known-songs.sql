-- Add is_known column to songs table
ALTER TABLE songs ADD COLUMN IF NOT EXISTS is_known boolean NOT NULL DEFAULT false;
