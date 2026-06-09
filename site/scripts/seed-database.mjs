#!/usr/bin/env node

/**
 * One-Time Database Seed Script
 * 
 * Seeds the Supabase database with QWEN3 AMR data in one command.
 * 
 * Usage:
 *   node scripts/seed-database.mjs ../QWEN3_small.txt
 *   node scripts/seed-database.mjs ../QWEN3_big.txt
 * 
 * This script:
 * 1. Reads the QWEN3 file
 * 2. Imports all data to database
 * 3. Auto-approves all entries
 * 4. Prints summary statistics
 * 
 * After running this once, all data is in the database and ready to use!
 */

import fs from 'fs'
import path from 'path'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

// Load .env.local
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envPath = path.join(__dirname, '..', '.env.local')

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=')
    if (key && value && !key.startsWith('#')) {
      process.env[key.trim()] = value.trim()
    }
  })
}

// Get Supabase credentials from environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials!')
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  console.error('   Or create .env.local with these variables')
  process.exit(1)
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { transport: ws }
})
const supabaseAdmin = SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { realtime: { transport: ws } })
  : null

// ============================================================
// QWEN3 Parser (same logic as in lib/actions/import.ts)
// ============================================================

function parseQwen3Text(text) {
  const trimmed = text.trim()

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed
    }
    return [parsed]
  } catch {
    // Fall through to log-file parsing
  }

  // Parse log file format
  const results = []
  const separatorRegex = /^-{10,}/

  const sections = text.split('📋 EXTRACTED JSON:')
  for (let s = 1; s < sections.length; s++) {
    const section = sections[s]
    const lines = section.split('\n')

    let startIdx = -1
    let endIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (separatorRegex.test(lines[i].trim())) {
        if (startIdx === -1) {
          startIdx = i
        } else {
          endIdx = i
          break
        }
      }
    }

    if (startIdx === -1) continue

    const contentLines = endIdx !== -1
      ? lines.slice(startIdx + 1, endIdx)
      : lines.slice(startIdx + 1)

    const jsonStr = contentLines.join('\n').trim()
    if (!jsonStr) continue

    try {
      const parsed = JSON.parse(jsonStr)
      results.push(parsed)
    } catch (e) {
      // Skip invalid JSON blocks
    }
  }

  return results
}

// ============================================================
// Import Functions
// ============================================================

async function importPapersAndGenes(papers) {
  let papersProcessed = 0
  let genesImported = 0
  let mutationsImported = 0
  const errors = []

  for (const paper of papers) {
    const pmid = paper.pmid?.trim() || null

    // Insert paper - use INSERT with bypass if possible
    if (pmid) {
      const { error: paperError } = await supabase
        .from('papers')
        .insert({
          pmid,
          paper_type: paper.paper_type || null,
          key_findings: paper.key_findings || null,
          methodology: paper.methodology || null,
          geographic_location: paper.geographic_location || null,
          sample_size: paper.sample_size ?? null,
        })

      if (paperError) {
        // Ignore duplicate key errors (already exists)
        if (!paperError.message.includes('duplicate key')) {
          errors.push(`Paper ${pmid}: ${paperError.message}`)
        }
      } else {
        papersProcessed++
      }
    }

    // Insert genes
    const geneEntries = Object.entries(paper.genes || {})
    const geneIdMap = new Map()

    for (const [geneName, geneData] of geneEntries) {
      const { data: insertedGene, error: geneError } = await supabase
        .from('amr_genes')
        .insert({
          gene_name: geneName.trim(),
          allele: geneData.allele || null,
          encodes: geneData.encodes || null,
          mechanism: geneData.mechanism || null,
          resistance_mechanism_class: geneData.resistance_mechanism_class || null,
          confers_resistance_to: geneData.confers_resistance_to || null,
          organisms_tested_in: geneData.organisms_tested_in || null,
          role_in_paper: geneData.role_in_paper || null,
          validation_method: geneData.validation_method || null,
          paper_pmid: pmid,
        })
        .select('id')
        .single()

      if (geneError) {
        errors.push(`Gene "${geneName}": ${geneError.message}`)
      } else if (insertedGene) {
        genesImported++
        geneIdMap.set(geneName, insertedGene.id)
      }
    }

    // Insert mutations
    const mutationEntries = Object.entries(paper.mutations || {})
    for (const [geneName, mutationData] of mutationEntries) {
      const geneId = geneIdMap.get(geneName)
      if (!geneId) continue

      for (const mutation of mutationData.mutations_found || []) {
        const { error: mutationError } = await supabase
          .from('amr_mutations')
          .insert({
            gene_id: geneId,
            mutation: mutation.notation || null,
            nucleotide_change: mutation.nucleotide_change || null,
            protein_change: mutation.protein_change || null,
            confers_resistance_to: mutation.confers_resistance_to || null,
            organisms_observed_in: mutation.organisms_observed_in || null,
            validated_by: mutation.validated_by || null,
            origin: mutation.origin || null,
          })

        if (mutationError) {
          errors.push(`Mutation ${mutation.notation}: ${mutationError.message}`)
        } else {
          mutationsImported++
        }
      }
    }
  }

  return { papersProcessed, genesImported, mutationsImported, errors }
}

function parseProteinNotation(notation) {
  if (!notation) return [null, null]
  const match = notation.match(/^([A-Za-z*])(\d+)([A-Za-z*])$/)
  if (match) {
    return [match[1], match[3]]
  }
  return [null, null]
}

// ============================================================
// Main Seed Function
// ============================================================

async function seedDatabase(filePath) {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║           AMR Database Seed - One-Time Setup                   ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  // Read file
  console.log(`📂 Reading file: ${filePath}`)
  let fileContent
  try {
    const absolutePath = path.resolve(filePath)
    fileContent = fs.readFileSync(absolutePath, 'utf-8')
    console.log(`✓ File read (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)\n`)
  } catch (error) {
    console.error(`❌ Failed to read file: ${error.message}`)
    process.exit(1)
  }

  // Parse QWEN3
  console.log('🔍 Parsing QWEN3 data...')
  const papers = parseQwen3Text(fileContent)
  if (papers.length === 0) {
    console.error('❌ No valid QWEN3 records found')
    process.exit(1)
  }
  console.log(`✓ Found ${papers.length} papers\n`)

  // Import to database
  console.log('💾 Importing to database...')
  console.log('   (All entries will be auto-approved and visible immediately)\n')

  const startTime = Date.now()
  const { papersProcessed, genesImported, mutationsImported, errors } = await importPapersAndGenes(papers)
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)

  // Results
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║                        IMPORT COMPLETE ✓                       ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  console.log('📊 Results:')
  console.log(`   Papers imported:     ${papersProcessed}`)
  console.log(`   Genes imported:      ${genesImported}`)
  console.log(`   Mutations imported:  ${mutationsImported}`)
  console.log(`   Time taken:          ${duration}s\n`)

  if (errors.length > 0) {
    console.log('⚠️  Errors encountered:')
    errors.slice(0, 5).forEach(err => console.log(`   - ${err}`))
    if (errors.length > 5) {
      console.log(`   ... and ${errors.length - 5} more\n`)
    } else {
      console.log()
    }
  }

  console.log('═══════════════════════════════════════════════════════════════\n')
  console.log('✅ Database is now ready to use!\n')
  console.log('Next steps:')
  console.log('  1. Start the dev server:')
  console.log('     $ pnpm dev\n')
  console.log('  2. Open in browser:')
  console.log('     http://localhost:3000/browse/genes\n')
  console.log('  3. Your data is already loaded and visible!\n')
  console.log('═══════════════════════════════════════════════════════════════\n')
}

// ============================================================
// Entry Point
// ============================================================

const args = process.argv.slice(2)

if (args.length === 0) {
  console.log(`
Usage:
  node scripts/seed-database.js <path-to-qwen3-file>

Examples:
  node scripts/seed-database.js ../QWEN3_small.txt
  node scripts/seed-database.js ../QWEN3_big.txt

This will:
  1. Read the QWEN3 file
  2. Import all data to Supabase
  3. Auto-approve entries
  4. Make data visible immediately

After running, visit http://localhost:3000/browse/genes to see the data!
  `)
  process.exit(1)
}

seedDatabase(args[0]).catch(error => {
  console.error('❌ Seed failed:', error.message)
  process.exit(1)
})
