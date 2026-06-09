-- Add affiliation column to curators table
ALTER TABLE curators
ADD COLUMN IF NOT EXISTS affiliation TEXT;

-- Add affiliation columns to curation tracking tables
ALTER TABLE curation_history
ADD COLUMN IF NOT EXISTS curator_affiliation TEXT;

ALTER TABLE curation_notes
ADD COLUMN IF NOT EXISTS curator_affiliation TEXT;
