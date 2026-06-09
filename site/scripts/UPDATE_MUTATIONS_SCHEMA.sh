#!/bin/bash

# Execute SQL via direct Supabase client
# You need to run this SQL in your Supabase dashboard

cat << 'EOF'

╔════════════════════════════════════════════════════════════════╗
║     Run these SQL commands in Supabase SQL Editor              ║
║  (Supabase Dashboard > SQL Editor > New Query)                 ║
╚════════════════════════════════════════════════════════════════╝

-- Drop and recreate amr_mutations table with new columns
DROP TABLE IF EXISTS amr_mutations CASCADE;

CREATE TABLE amr_mutations (
  id                SERIAL PRIMARY KEY,
  gene_id           INTEGER REFERENCES amr_genes(id) ON DELETE CASCADE,
  gene_name         TEXT NOT NULL,                      -- Store gene name for independent mutations
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

-- Create trigger for updated_at
CREATE TRIGGER amr_mutations_updated_at
  BEFORE UPDATE ON amr_mutations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE amr_mutations ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read amr_mutations"
  ON amr_mutations FOR SELECT
  USING (true);

-- Allow public inserts
CREATE POLICY "Anyone can insert amr_mutations"
  ON amr_mutations FOR INSERT
  WITH CHECK (true);

EOF
