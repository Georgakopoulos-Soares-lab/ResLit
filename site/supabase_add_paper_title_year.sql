-- Add title and year columns to the papers table
-- title: paper title (populated from QWEN3 extraction or manual import)
-- year: publication year of the paper

ALTER TABLE papers ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS year  INTEGER;

-- Full-text index on title
CREATE INDEX IF NOT EXISTS papers_title_fts
  ON papers USING gin(to_tsvector('english', coalesce(title, '')));

-- Scalar index for year filtering
CREATE INDEX IF NOT EXISTS papers_year_idx ON papers(year);
