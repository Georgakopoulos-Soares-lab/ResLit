-- Migrate existing amr_mutations table to new schema
-- Add missing columns to the existing table

-- Add missing columns if they don't exist
ALTER TABLE amr_mutations
  ADD COLUMN IF NOT EXISTS gene_name TEXT,
  ADD COLUMN IF NOT EXISTS notation TEXT,
  ADD COLUMN IF NOT EXISTS nucleotide_change TEXT,
  ADD COLUMN IF NOT EXISTS protein_change TEXT,
  ADD COLUMN IF NOT EXISTS position_in_molecule TEXT,
  ADD COLUMN IF NOT EXISTS confers_resistance_to TEXT[],
  ADD COLUMN IF NOT EXISTS organisms_observed_in TEXT[],
  ADD COLUMN IF NOT EXISTS effect_on_function TEXT,
  ADD COLUMN IF NOT EXISTS mutation_type TEXT,
  ADD COLUMN IF NOT EXISTS validated_by TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS paper_pmid TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create or replace trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS amr_mutations_updated_at ON amr_mutations;
CREATE TRIGGER amr_mutations_updated_at
  BEFORE UPDATE ON amr_mutations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add constraints if table is being recreated
ALTER TABLE amr_mutations
  ADD CONSTRAINT amr_mutations_status_check CHECK (status IN ('pending', 'curated', 'rejected')) NOT VALID;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS amr_mutations_gene_name_idx ON amr_mutations(gene_name);
CREATE INDEX IF NOT EXISTS amr_mutations_nucleotide_change_idx ON amr_mutations(nucleotide_change);
CREATE INDEX IF NOT EXISTS amr_mutations_status_idx ON amr_mutations(status);
CREATE INDEX IF NOT EXISTS amr_mutations_confers_resistance_to_gin ON amr_mutations USING gin(confers_resistance_to);
CREATE INDEX IF NOT EXISTS amr_mutations_organisms_observed_in_gin ON amr_mutations USING gin(organisms_observed_in);
CREATE INDEX IF NOT EXISTS amr_mutations_paper_pmid_idx ON amr_mutations(paper_pmid);

-- Enable RLS
ALTER TABLE amr_mutations ENABLE ROW LEVEL SECURITY;

-- Create or replace RLS policies
DROP POLICY IF EXISTS "Anyone can read amr_mutations" ON amr_mutations;
CREATE POLICY "Anyone can read amr_mutations"
  ON amr_mutations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert amr_mutations" ON amr_mutations;
CREATE POLICY "Anyone can insert amr_mutations"
  ON amr_mutations FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update amr_mutations" ON amr_mutations;
CREATE POLICY "Anyone can update amr_mutations"
  ON amr_mutations FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Anyone can delete amr_mutations" ON amr_mutations;
CREATE POLICY "Anyone can delete amr_mutations"
  ON amr_mutations FOR DELETE
  USING (true);
