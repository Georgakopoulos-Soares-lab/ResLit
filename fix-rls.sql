-- Quick fix for RLS infinite recursion issue
-- Run this in Supabase SQL Editor to allow data import

-- Drop problematic policies on papers
DROP POLICY IF EXISTS "Curators can insert papers" ON papers;
DROP POLICY IF EXISTS "Curators can update papers" ON papers;
DROP POLICY IF EXISTS "Curators can delete papers" ON papers;

-- Add permissive policies for seeding
CREATE POLICY "Allow insert papers" ON papers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update papers" ON papers FOR UPDATE USING (true);
CREATE POLICY "Allow delete papers" ON papers FOR DELETE USING (true);

-- Drop problematic policies on amr_genes
DROP POLICY IF EXISTS "Curators can write amr_genes" ON amr_genes;

-- Add permissive policy
CREATE POLICY "Allow insert amr_genes" ON amr_genes FOR INSERT WITH CHECK (true);

-- Drop problematic policies on amr_mutations
DROP POLICY IF EXISTS "Curators can write amr_mutations" ON amr_mutations;

-- Add permissive policy
CREATE POLICY "Allow insert amr_mutations" ON amr_mutations FOR INSERT WITH CHECK (true);
