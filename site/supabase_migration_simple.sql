-- ============================================================
-- Minimal migration - only create missing tables
-- ============================================================

-- First, add the name column to curators if it doesn't exist
ALTER TABLE curators
ADD COLUMN IF NOT EXISTS name TEXT;

-- Curation history table
CREATE TABLE IF NOT EXISTS curation_history (
  id                SERIAL PRIMARY KEY,
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  curator_id        UUID NOT NULL REFERENCES curators(id) ON DELETE SET NULL,
  curator_email     TEXT,
  curator_name      TEXT,
  action            TEXT NOT NULL,
  previous_status   TEXT,
  new_status        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on curation_history
ALTER TABLE curation_history ENABLE ROW LEVEL SECURITY;

-- Index for lookups
CREATE INDEX IF NOT EXISTS curation_history_target_idx 
  ON curation_history(target_type, target_id);

CREATE INDEX IF NOT EXISTS curation_history_curator_idx 
  ON curation_history(curator_id);

-- Curation notes table
CREATE TABLE IF NOT EXISTS curation_notes (
  id                SERIAL PRIMARY KEY,
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  curator_id        UUID NOT NULL REFERENCES curators(id) ON DELETE SET NULL,
  curator_email     TEXT,
  curator_name      TEXT,
  note              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on curation_notes
ALTER TABLE curation_notes ENABLE ROW LEVEL SECURITY;

-- Index for lookups
CREATE INDEX IF NOT EXISTS curation_notes_target_idx 
  ON curation_notes(target_type, target_id);

CREATE INDEX IF NOT EXISTS curation_notes_curator_idx 
  ON curation_notes(curator_id);

-- ============================================================
-- End of migration
-- ============================================================
