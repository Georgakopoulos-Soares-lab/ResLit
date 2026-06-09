-- Add missing columns to curation_history table
-- The 'changes' column stores field-level diffs for edit actions (JSON)
-- The 'curator_affiliation' column stores the curator's institution at time of action

ALTER TABLE curation_history
  ADD COLUMN IF NOT EXISTS changes           JSONB,
  ADD COLUMN IF NOT EXISTS curator_affiliation TEXT;
