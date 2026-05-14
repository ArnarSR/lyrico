CREATE TABLE IF NOT EXISTS feedback (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('bug', 'suggestion', 'other')),
  message text NOT NULL,
  user_agent text,
  created_at bigint NOT NULL
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback; nobody can read via client
CREATE POLICY "Users can submit feedback"
  ON feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
