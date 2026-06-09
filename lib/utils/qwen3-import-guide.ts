/**
 * QWEN3 Data Import Utility
 * 
 * This utility helps import QWEN3 extraction output from text files into the database.
 * 
 * Usage:
 * 1. Copy the content of QWEN3_small.txt or QWEN3_big.txt
 * 2. Go to http://localhost:3000/curator/import
 * 3. Paste into the "Import QWEN3 Data" tab
 * 4. Click "Import Data"
 * 5. Review results
 * 6. Approve entries in curator dashboard
 */

import fs from 'fs'
import path from 'path'

/**
 * Read QWEN3 extraction file
 */
export function readQwen3File(filePath: string): string {
  try {
    const absolutePath = path.resolve(filePath)
    const content = fs.readFileSync(absolutePath, 'utf-8')
    console.log(`✓ Successfully read file: ${absolutePath}`)
    console.log(`  File size: ${(content.length / 1024).toFixed(2)} KB`)
    return content
  } catch (error) {
    console.error(`✗ Failed to read file: ${filePath}`)
    throw error
  }
}

/**
 * Count papers in QWEN3 output
 */
export function countPapersInQwen3(content: string): number {
  const pmidMatches = content.match(/Processing \d+\/\d+: PMID (\d+)/g) || []
  return pmidMatches.length
}

/**
 * Extract PMID from QWEN3 output
 */
export function extractPmidsFromQwen3(content: string): string[] {
  const regex = /Processing \d+\/\d+: PMID (\d+)/g
  const pmids: string[] = []
  let match

  while ((match = regex.exec(content)) !== null) {
    pmids.push(match[1])
  }

  return pmids
}

/**
 * Get import instructions
 */
export function getImportInstructions(): string {
  return `
╔════════════════════════════════════════════════════════════════════════════╗
║                  QWEN3 DATA IMPORT INSTRUCTIONS                           ║
╚════════════════════════════════════════════════════════════════════════════╝

STEP 1: Start the Development Server
  $ cd /home/argis/Desktop/austin/reslit/site/b_KNfmUgaXkR6
  $ pnpm dev
  → Server runs at http://localhost:3000

STEP 2: Prepare Your QWEN3 Data
  Your files are located at:
  - /home/argis/Desktop/austin/reslit/site/QWEN3_small.txt  (Test data)
  - /home/argis/Desktop/austin/reslit/site/QWEN3_big.txt    (Full data)

STEP 3: Set Up Supabase Database
  a) Go to your Supabase dashboard: https://app.supabase.com
  b) Select your project
  c) Go to SQL Editor
  d) Create a new query
  e) Copy the entire contents of: b_KNfmUgaXkR6/supabase_migration.sql
  f) Paste and run the query
  g) Wait for completion (creates tables, indexes, RLS policies)

STEP 4: Authenticate as Curator
  a) Go to http://localhost:3000/curator/login
  b) Sign in with your Supabase email
  c) The system will check if you're a curator in the database
  
  NOTE: To add yourself as a curator in Supabase:
    - Go to SQL Editor
    - Run this query:
      INSERT INTO curators (id, name, email, institution, role)
      VALUES (
        '<YOUR_USER_ID_FROM_AUTH>',
        'Your Name',
        'your@email.com',
        'Your Institution',
        'curator'
      )

STEP 5: Import Data
  a) After logging in, go to http://localhost:3000/curator/import
  b) Click the "QWEN3 Data" tab
  c) Open QWEN3_small.txt in a text editor
  d) Copy ALL the content (entire file)
  e) Paste into the textarea in the import page
  f) Click "Import Data"
  g) Wait for processing
  h) Review the results (papers, genes, mutations imported)

STEP 6: Verify Import
  a) Go to http://localhost:3000/curator/dashboard
  b) You'll see all pending entries
  c) Click on entries to review details
  d) Click "Approve" to make them visible to public users
  e) (Or "Reject" if there are issues)

STEP 7: View Data
  a) Go to http://localhost:3000/browse/genes
  b) Or http://localhost:3000/browse/mutations
  c) You'll see only curated (approved) entries
  d) Use filters to browse the data
  e) Click PubMed links to see original papers

═══════════════════════════════════════════════════════════════════════════

WHAT THE IMPORT DOES:

1. Parses QWEN3 JSON extraction from papers
2. Creates entries in these tables (all marked as "pending"):
   - papers: Paper metadata and methodology
   - amr_genes: Gene information and resistance mechanisms
   - amr_mutations: Specific mutations and their effects
   
3. All imported data starts as "pending" and requires curator approval

4. Only "curated" entries are visible to regular users

═══════════════════════════════════════════════════════════════════════════

DATA STRUCTURE AFTER IMPORT:

Each Paper can contain:
  ├─ Paper metadata (PMID, type, findings, methodology)
  ├─ Multiple genes (with alleles, mechanisms, resistance targets)
  └─ Multiple mutations per gene (positions, types, effects)

Example:
  PMID: 22660700
  ├─ aac(2')-IIa gene
  │  ├─ Mechanism: enzymatic_inactivation
  │  ├─ Confers resistance to: kasugamycin
  │  └─ S146T mutation
  │     ├─ Type: substitution
  │     └─ Effect: increases MIC

═══════════════════════════════════════════════════════════════════════════

TROUBLESHOOTING:

Problem: "Not authenticated" error
  → Go to /curator/login and sign in

Problem: "Not authorized" / "Only curators can import"
  → You need to be added as a curator in the curators table
  → Contact your admin or add yourself via SQL query (see STEP 4)

Problem: "No valid QWEN3 records found"
  → Make sure you copied the entire QWEN3 file
  → File should contain "Processing X/X: PMID" sections
  → Check the file format

Problem: Database connection fails
  → Check your .env.local file has correct Supabase credentials
  → Verify migration.sql was run successfully
  → Check RLS policies allow curator access

═══════════════════════════════════════════════════════════════════════════

FILES INVOLVED:

  Frontend:
    app/curator/import/page.tsx - Import interface
    app/curator/dashboard/page.tsx - Curation interface
    app/browse/genes/page.tsx - Public gene browser
    app/browse/mutations/page.tsx - Public mutation browser

  Backend:
    lib/actions/import.ts - Import functions
    lib/actions/curator.ts - Curation approval/rejection
    lib/supabase/server.ts - Database connection

  Database:
    supabase_migration.sql - Schema and RLS policies
    .env.local - Supabase credentials

═══════════════════════════════════════════════════════════════════════════
`
}

// If this file is run directly
if (require.main === module) {
  console.log(getImportInstructions())
  
  // Try to read and analyze QWEN3_small.txt
  try {
    const smallFile = '/home/argis/Desktop/austin/reslit/site/QWEN3_small.txt'
    const content = readQwen3File(smallFile)
    const pmidCount = countPapersInQwen3(content)
    const pmids = extractPmidsFromQwen3(content)
    
    console.log(`\n📊 QWEN3_small.txt Analysis:`)
    console.log(`   Papers found: ${pmidCount}`)
    console.log(`   PMIDs: ${pmids.join(', ')}`)
  } catch (error) {
    console.error('Could not analyze QWEN3 file')
  }
}

export default getImportInstructions
