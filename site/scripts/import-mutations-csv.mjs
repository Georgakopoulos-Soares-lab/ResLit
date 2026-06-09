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
  
  console.log(`✓ Parsed ${records.length} mutations\n`)
  console.log('💾 Importing to database...\n')
  
  let imported = 0
  const errors = []

  for (const record of records) {
    const { error } = await supabase
      .from('amr_mutations')
      .insert({
        gene_name: record.gene_name || null,
        notation: record.notation || null,
        nucleotide_change: record.nucleotide_change || null,
        protein_change: record.protein_change || null,
        position_in_molecule: record.position_in_molecule || null,
        confers_resistance_to: stringToArray(record.confers_resistance_to),
        organisms_observed_in: stringToArray(record.organisms_observed_in),
        effect_on_function: record.effect_on_function || null,
        mutation_type: record.mutation_type || null,
        validated_by: record.validated_by || null,
        origin: record.origin || null,
        paper_pmid: record.paper_pmid || null,
        key_findings: record.key_findings || null,
        country: record.geographic_location || null,
        title_pmid: record.Title_PMID || null,
        year_pmid: record.YEAR_PMID ? parseInt(record.YEAR_PMID) : null,
        status: 'pending',
      })

    if (error) {
      errors.push(`${record.notation}: ${error.message}`)
      console.log(`  ❌ ${record.notation}`)
    } else {
      imported++
      console.log(`  ✓ ${record.notation}`)
    }
  }

  return { imported, total: records.length, errors }
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

  const { imported, total, errors } = await importMutations(filePath)

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`)
  console.log(`║                    IMPORT COMPLETE ✓                         ║`)
  console.log(`╚════════════════════════════════════════════════════════════════╝`)

  console.log(`\n📊 Results:`)
  console.log(`   Imported: ${imported}/${total}`)
  
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
