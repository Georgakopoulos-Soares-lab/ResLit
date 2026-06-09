-- ============================================================
-- Add curation tracking tables to existing schema
-- ============================================================

-- First, add the name column to curators if it doesn't exist
ALTER TABLE curators
ADD COLUMN IF NOT EXISTS name TEXT;

-- Curation history table
CREATE TABLE IF NOT EXISTS curation_history (
  id                SERIAL PRIMARY KEY,
  target_type       TEXT NOT NULL,                 -- 'gene' or 'mutation'
  target_id         TEXT NOT NULL,                 -- gene ID or mutation ID
  curator_id        UUID NOT NULL REFERENCES curators(id) ON DELETE SET NULL,
  curator_email     TEXT,                          -- email of curator at time of action
  curator_name      TEXT,                          -- name of curator at time of action
  action            TEXT NOT NULL,                 -- 'approve' or 'reject'
  previous_status   TEXT,                          -- previous status before change
  new_status        TEXT,                          -- new status after change
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on curation_history
ALTER TABLE curation_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Anyone can read curation_history" ON curation_history;
CREATE POLICY "Anyone can read curation_history"
  ON curation_history FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Curators can insert curation_history" ON curation_history;
CREATE POLICY "Curators can insert curation_history"
  ON curation_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM curators WHERE id = auth.uid()
    )
  );

-- Index for lookups
CREATE INDEX IF NOT EXISTS curation_history_target_idx 
  ON curation_history(target_type, target_id);

CREATE INDEX IF NOT EXISTS curation_history_curator_idx 
  ON curation_history(curator_id);

-- Curation notes table
CREATE TABLE IF NOT EXISTS curation_notes (
  id                SERIAL PRIMARY KEY,
  target_type       TEXT NOT NULL,                 -- 'gene' or 'mutation'
  target_id         TEXT NOT NULL,                 -- gene ID or mutation ID
  curator_id        UUID NOT NULL REFERENCES curators(id) ON DELETE SET NULL,
  curator_email     TEXT,                          -- email of curator at time of note
  curator_name      TEXT,                          -- name of curator at time of note
  note              TEXT NOT NULL,                 -- curation note/comment
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on curation_notes
ALTER TABLE curation_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Anyone can read curation_notes" ON curation_notes;
CREATE POLICY "Anyone can read curation_notes"
  ON curation_notes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Curators can insert curation_notes" ON curation_notes;
CREATE POLICY "Curators can insert curation_notes"
  ON curation_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM curators WHERE id = auth.uid()
    )
  );

-- Index for lookups
CREATE INDEX IF NOT EXISTS curation_notes_target_idx 
  ON curation_notes(target_type, target_id);

CREATE INDEX IF NOT EXISTS curation_notes_curator_idx 
  ON curation_notes(curator_id);

-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop and recreate trigger for curation_notes
DROP TRIGGER IF EXISTS curation_notes_updated_at ON curation_notes;
CREATE TRIGGER curation_notes_updated_at
  BEFORE UPDATE ON curation_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- End of migration
-- ============================================================
