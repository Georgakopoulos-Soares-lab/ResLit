-- Add columns that import-genes-csv.mjs and import-mutations-csv.mjs write to directly.
-- These denormalise paper metadata onto each row so no join is needed at query time.

-- amr_genes
ALTER TABLE amr_genes
  ADD COLUMN IF NOT EXISTS key_findings      TEXT,
  ADD COLUMN IF NOT EXISTS geographic_location TEXT,   -- scalar string from CSV
  ADD COLUMN IF NOT EXISTS title_pmid        TEXT,
  ADD COLUMN IF NOT EXISTS year_pmid         INTEGER;

-- amr_mutations
ALTER TABLE amr_mutations
  ADD COLUMN IF NOT EXISTS key_findings  TEXT,
  ADD COLUMN IF NOT EXISTS title_pmid    TEXT,
  ADD COLUMN IF NOT EXISTS year_pmid     INTEGER;
