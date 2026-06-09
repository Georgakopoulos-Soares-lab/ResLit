-- ============================================================
-- Comments Table Migration
-- Creates the comments table for storing public annotations
-- ============================================================

CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type       TEXT NOT NULL,                 -- 'gene' or 'mutation'
  target_id         TEXT NOT NULL,                 -- gene ID or mutation ID
  user_id           UUID,                          -- user ID if authenticated, null if anonymous
  user_email        TEXT,                          -- email of commenter
  user_name         TEXT,                          -- name of commenter
  content           TEXT NOT NULL,                 -- comment content
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read comments"
  ON comments FOR SELECT
  USING (true);

-- Allow public inserts for seeding
CREATE POLICY "Anyone can insert comments"
  ON comments FOR INSERT
  WITH CHECK (true);

-- Index on target for efficient lookups
CREATE INDEX IF NOT EXISTS comments_target_idx 
  ON comments(target_type, target_id);

-- Create trigger for updated_at (if the function exists)
-- First check if the function exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE TRIGGER comments_updated_at
      BEFORE UPDATE ON comments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
