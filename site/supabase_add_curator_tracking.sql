-- Add curation tracking columns to amr_genes and amr_mutations tables
ALTER TABLE amr_genes
ADD COLUMN IF NOT EXISTS validated_by UUID,
ADD COLUMN IF NOT EXISTS curator_name TEXT,
ADD COLUMN IF NOT EXISTS curator_email TEXT,
ADD COLUMN IF NOT EXISTS curator_affiliation TEXT,
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

ALTER TABLE amr_mutations
ADD COLUMN IF NOT EXISTS validated_by UUID,
ADD COLUMN IF NOT EXISTS curator_name TEXT,
ADD COLUMN IF NOT EXISTS curator_email TEXT,
ADD COLUMN IF NOT EXISTS curator_affiliation TEXT,
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS amr_genes_validated_by_idx ON amr_genes(validated_by);
CREATE INDEX IF NOT EXISTS amr_mutations_validated_by_idx ON amr_mutations(validated_by);
