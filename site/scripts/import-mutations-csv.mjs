#!/usr/bin/env node

/**
 * CSV Importer - Mutations
 * 
 * Imports mutations from mutations_extracted.csv into the database
 * 
 * Usage:
 *   node scripts/import-mutations-csv.mjs mutations_extracted.csv
 */

import fs from 'fs'
import path from 'path'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials!')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { transport: ws }
})

// ============================================================
// CSV Parser
// ============================================================

function parseCSVFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
  return records
}

function stringToArray(value) {
  if (!value || value === '') return null
  return value.split('|').map(v => v.trim())
}

// ============================================================
// Import Function
// ============================================================

async function importMutations(csvFile) {
  console.log(`\n📖 Reading: ${csvFile}`)

  let records
  try {
    records = parseCSVFile(csvFile)
  } catch (error) {
    console.error(`❌ Failed to parse CSV: ${error.message}`)
    process.exit(1)
  }

  console.log(`✓ Parsed ${records.length} mutations`)

  // Show detected columns
  if (records.length > 0) {
    console.log(`  Columns: ${Object.keys(records[0]).join(', ')}`)
  }

  console.log('\n💾 Importing to database...\n')

  let imported = 0
  let skipped = 0
  const errors = []

  // Build mutation name for display
  const label = (r) => r.Protein_Change || r.Nucleotide_Change || r.Gene || '(unknown)'

  for (const record of records) {
    const geneName = record.Gene?.trim() || null
    const nucleotideChange = record.Nucleotide_Change?.trim() || null
    const proteinChange = record.Protein_Change?.trim() || null

    if (!geneName && !nucleotideChange && !proteinChange) {
      skipped++
      continue
    }

    const { error } = await supabase
      .from('amr_mutations')
      .insert({
        gene_name: geneName,
        nucleotide_change: nucleotideChange || '',
        protein_change: proteinChange,
        paper_pmid: record.PMID?.trim() || null,
        confers_resistance_to: record.Resistance?.trim() ? [record.Resistance.trim()] : null,
        organisms_observed_in: record.Organism?.trim() ? [record.Organism.trim()] : null,
        key_findings: record.Notes?.trim() || null,
        effect_on_function: record.Mechanism?.trim() || null,
        title_pmid: record.Paper_title?.trim() || null,
        year_pmid: record.Publication_year ? parseInt(record.Publication_year) : null,
        source_database: record.Database?.trim() || 'Reslit',
        status: 'pending',
      })

    if (error) {
      errors.push(`${label(record)}: ${error.message}`)
      console.log(`  ❌ ${label(record)}: ${error.message}`)
    } else {
      imported++
      if (imported % 50 === 0) console.log(`  ✓ ${imported} imported...`)
    }
  }

  return { imported, total: records.length, skipped, errors }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║            CSV to Database Importer - Mutations               ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  const csvFile = process.argv[2] || 'mutations_extracted.csv'
  const filePath = path.resolve(csvFile)

  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ File not found: ${filePath}`)
    process.exit(1)
  }

  const { imported, total, skipped, errors } = await importMutations(filePath)

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`)
  console.log(`║                    IMPORT COMPLETE ✓                         ║`)
  console.log(`╚════════════════════════════════════════════════════════════════╝`)

  console.log(`\n📊 Results:`)
  console.log(`   Imported: ${imported}/${total}`)
  if (skipped > 0) console.log(`   Skipped (empty): ${skipped}`)
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`)
    errors.slice(0, 5).forEach(e => console.log(`   - ${e}`))
    if (errors.length > 5) {
      console.log(`   ... and ${errors.length - 5} more`)
    }
  } else {
    console.log(`\n✅ All mutations imported successfully!`)
  }

  console.log('\n')
}

main()
