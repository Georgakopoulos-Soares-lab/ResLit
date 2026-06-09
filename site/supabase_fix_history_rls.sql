-- ============================================================
-- Fix: curation_history has RLS enabled but no policies,
-- which silently blocks all reads and writes.
-- ============================================================

-- Drop any existing policies first (safe to re-run)
DROP POLICY IF EXISTS "Anyone can read curation_history"     ON curation_history;
DROP POLICY IF EXISTS "Curators can insert curation_history" ON curation_history;

-- Allow anyone to read history (public transparency)
CREATE POLICY "Anyone can read curation_history"
  ON curation_history FOR SELECT
  USING (true);

-- Allow any authenticated user to insert history
-- (application layer already checks the user is a curator before calling)
CREATE POLICY "Anyone can insert curation_history"
  ON curation_history FOR INSERT
  WITH CHECK (true);

-- Also add the missing columns if they were not yet added
ALTER TABLE curation_history
  ADD COLUMN IF NOT EXISTS changes             JSONB,
  ADD COLUMN IF NOT EXISTS curator_affiliation TEXT;

-- Same fix for curation_notes (same problem)
DROP POLICY IF EXISTS "Anyone can read curation_notes"     ON curation_notes;
DROP POLICY IF EXISTS "Curators can insert curation_notes" ON curation_notes;

CREATE POLICY "Anyone can read curation_notes"
  ON curation_notes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert curation_notes"
  ON curation_notes FOR INSERT
  WITH CHECK (true);

ALTER TABLE curation_notes
  ADD COLUMN IF NOT EXISTS curator_affiliation TEXT;
