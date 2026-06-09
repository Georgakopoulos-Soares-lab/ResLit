-- ============================================================
-- AMR Database Schema Redesign Migration
-- Implements rich QWEN3 extraction output schema
-- ============================================================

-- Define the auto-update function first (used by all tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ------------------------------------------------------------
-- 0. Create the curators table (required for RLS policies)
-- Stores authorized curator accounts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curators (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  name              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on curators
ALTER TABLE curators ENABLE ROW LEVEL SECURITY;

-- All users can see curator list (needed for RLS policies to work)
CREATE POLICY "Anyone can read curator list"
  ON curators FOR SELECT
  USING (true);

-- Only curators can insert new curators (admin function)
CREATE POLICY "Curators can insert curators"
  ON curators FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM curators WHERE id = auth.uid()
    )
  );

-- Index on email for lookups
CREATE INDEX IF NOT EXISTS curators_email_idx ON curators(email);

-- Auto-update updated_at on curator changes
CREATE TRIGGER curators_updated_at
  BEFORE UPDATE ON curators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 1. Create the papers table
-- Stores paper-level metadata extracted from scientific papers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS papers (
  pmid              TEXT PRIMARY KEY,
  paper_type        TEXT,                      -- e.g. 'single_gene', 'multi_gene', 'review'
  key_findings      TEXT,
  methodology       TEXT,
  geographic_location TEXT[],                  -- array of countries/regions mentioned
  sample_size       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on papers
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;

-- Public read access - ALLOW ALL for now (curator verification done at app level)
CREATE POLICY "Anyone can read papers"
  ON papers FOR SELECT
  USING (true);

-- Allow public inserts for seeding (curator verification done at app level)
CREATE POLICY "Anyone can insert papers"
  ON papers FOR INSERT
  WITH CHECK (true);

-- Full-text search index on papers
CREATE INDEX IF NOT EXISTS papers_key_findings_fts
  ON papers USING gin(to_tsvector('english', coalesce(key_findings, '')));

CREATE TRIGGER papers_updated_at
  BEFORE UPDATE ON papers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 1.5. Create amr_genes table if it doesn't exist
-- Stores antimicrobial resistance genes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS amr_genes (
  id                SERIAL PRIMARY KEY,
  gene_name         TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER amr_genes_updated_at
  BEFORE UPDATE ON amr_genes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on amr_genes
ALTER TABLE amr_genes ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read amr_genes"
  ON amr_genes FOR SELECT
  USING (true);

-- Allow public inserts for seeding
CREATE POLICY "Anyone can insert amr_genes"
  ON amr_genes FOR INSERT
  WITH CHECK (true);

-- Create amr_mutations table if it doesn't exist
CREATE TABLE IF NOT EXISTS amr_mutations (
  id                SERIAL PRIMARY KEY,
  gene_id           INTEGER REFERENCES amr_genes(id) ON DELETE CASCADE,
  gene_name         TEXT,                      -- Store gene name for independent mutations
  mutation          TEXT NOT NULL,
  nucleotide_change TEXT,
  protein_change    TEXT,
  confers_resistance_to TEXT[],               -- Array of antibiotics
  organisms_observed_in TEXT[],               -- Array of organisms
  validated_by      TEXT,                      -- Validation method
  origin            TEXT,                      -- e.g., 'naturally_occurring', 'laboratory'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER amr_mutations_updated_at
  BEFORE UPDATE ON amr_mutations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on amr_mutations
ALTER TABLE amr_mutations ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read amr_mutations"
  ON amr_mutations FOR SELECT
  USING (true);

-- Allow public inserts for seeding
CREATE POLICY "Anyone can insert amr_mutations"
  ON amr_mutations FOR INSERT
  WITH CHECK (true);

-- ------------------------------------------------------------
-- 2. Alter amr_genes table
-- Drop old flat columns; add rich QWEN3 schema columns
-- ------------------------------------------------------------

-- Drop old flat columns that are replaced by array / structured fields
ALTER TABLE amr_genes
  DROP COLUMN IF EXISTS antibiotic,
  DROP COLUMN IF EXISTS antibiotic_class,
  DROP COLUMN IF EXISTS organism,
  DROP COLUMN IF EXISTS description;

-- Add new columns from QWEN3 extraction schema
ALTER TABLE amr_genes
  ADD COLUMN IF NOT EXISTS allele                  TEXT,
  ADD COLUMN IF NOT EXISTS encodes                 TEXT,           -- protein encoded (e.g. enzyme name)
  ADD COLUMN IF NOT EXISTS mechanism               TEXT,           -- mechanism of action text
  ADD COLUMN IF NOT EXISTS resistance_mechanism_class TEXT,        -- e.g. 'enzymatic_inactivation', 'efflux', 'target_modification'
  ADD COLUMN IF NOT EXISTS confers_resistance_to   TEXT[],         -- array of antibiotics
  ADD COLUMN IF NOT EXISTS organisms_tested_in     TEXT[],         -- array of organism names
  ADD COLUMN IF NOT EXISTS role_in_paper           TEXT,           -- e.g. 'experimentally_characterized', 'mentioned'
  ADD COLUMN IF NOT EXISTS validation_method       TEXT,           -- free-text validation description
  ADD COLUMN IF NOT EXISTS paper_pmid              TEXT REFERENCES papers(pmid) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status                  TEXT DEFAULT 'pending',  -- 'pending', 'curated', 'rejected'
  ADD COLUMN IF NOT EXISTS isolation_country       TEXT,           -- country of isolation
  ADD COLUMN IF NOT EXISTS year                    INTEGER;        -- year of study/publication

-- Indexes for array containment queries (used in filters)
CREATE INDEX IF NOT EXISTS amr_genes_confers_resistance_to_gin
  ON amr_genes USING gin(confers_resistance_to);

CREATE INDEX IF NOT EXISTS amr_genes_organisms_tested_in_gin
  ON amr_genes USING gin(organisms_tested_in);

CREATE INDEX IF NOT EXISTS amr_genes_resistance_mechanism_class_idx
  ON amr_genes (resistance_mechanism_class);

-- Full-text search on text columns
CREATE INDEX IF NOT EXISTS amr_genes_mechanism_fts
  ON amr_genes USING gin(to_tsvector('english',
    coalesce(gene_name, '') || ' ' ||
    coalesce(mechanism, '') || ' ' ||
    coalesce(encodes, '')
  ));

-- ------------------------------------------------------------
-- 3. Alter amr_mutations table
-- Add new QWEN3 mutation fields
-- ------------------------------------------------------------
ALTER TABLE amr_mutations
  ADD COLUMN IF NOT EXISTS nucleotide_change     TEXT,             -- e.g. 'T436A'
  ADD COLUMN IF NOT EXISTS protein_change        TEXT,             -- e.g. 'S146T' (explicit protein notation)
  ADD COLUMN IF NOT EXISTS confers_resistance_to TEXT[],           -- array of antibiotics this mutation confers resistance to
  ADD COLUMN IF NOT EXISTS organisms_observed_in TEXT[],           -- array of organisms where this mutation was observed
  ADD COLUMN IF NOT EXISTS validated_by          TEXT,             -- validation method string
  ADD COLUMN IF NOT EXISTS origin                TEXT;             -- 'naturally_occurring', 'laboratory', 'clinical', etc.

-- Indexes for array containment queries on mutations
CREATE INDEX IF NOT EXISTS amr_mutations_confers_resistance_to_gin
  ON amr_mutations USING gin(confers_resistance_to);

CREATE INDEX IF NOT EXISTS amr_mutations_organisms_observed_in_gin
  ON amr_mutations USING gin(organisms_observed_in);

-- Add additional columns needed by browse queries
ALTER TABLE amr_mutations
  ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'pending',  -- 'pending', 'curated', 'rejected'
  ADD COLUMN IF NOT EXISTS mutation_name         TEXT,                   -- mutation identifier
  ADD COLUMN IF NOT EXISTS effect                TEXT,                   -- effect description
  ADD COLUMN IF NOT EXISTS country               TEXT;                   -- country of observation

-- ------------------------------------------------------------
-- 4. Views for filter dropdowns
-- These unnest arrays so the UI can populate select options
-- ------------------------------------------------------------

-- Distinct antibiotics across all genes (from array column)
CREATE OR REPLACE VIEW distinct_antibiotics AS
  SELECT DISTINCT unnest(confers_resistance_to) AS antibiotic
  FROM amr_genes
  WHERE confers_resistance_to IS NOT NULL
  ORDER BY antibiotic;

-- Distinct organisms tested in (from array column)
CREATE OR REPLACE VIEW distinct_organisms AS
  SELECT DISTINCT unnest(organisms_tested_in) AS organism
  FROM amr_genes
  WHERE organisms_tested_in IS NOT NULL
  ORDER BY organism;

-- Distinct resistance mechanism classes (simple scalar column)
CREATE OR REPLACE VIEW distinct_mechanism_classes AS
  SELECT DISTINCT resistance_mechanism_class
  FROM amr_genes
  WHERE resistance_mechanism_class IS NOT NULL
  ORDER BY resistance_mechanism_class;

-- ------------------------------------------------------------
-- 5. Comments table for public annotations
-- Allows users to add comments on genes and mutations
-- ------------------------------------------------------------
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

-- Create trigger for updated_at
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. Curation tracking tables
-- Stores curation history and notes for genes/mutations
-- ============================================================

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

-- Public read access (for transparency)
CREATE POLICY "Anyone can read curation_history"
  ON curation_history FOR SELECT
  USING (true);

-- Only curators can insert
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

-- Public read access
CREATE POLICY "Anyone can read curation_notes"
  ON curation_notes FOR SELECT
  USING (true);

-- Only curators can insert
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

CREATE TRIGGER curation_notes_updated_at
  BEFORE UPDATE ON curation_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- End of migration
-- ============================================================
