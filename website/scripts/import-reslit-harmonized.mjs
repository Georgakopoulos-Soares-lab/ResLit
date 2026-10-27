#!/usr/bin/env node

/**
 * CSV Importer for the harmonized Reslit gene list
 *
 * Maps columns from Full_list_genes_Reslit_harmonized.csv:
 *   Database, Gene, Allele, Encodes, Mechanism, Resistance, Organism,
 *   Sequence_accession, Protein_accession, Validation_method, PMID,
 *   Paper_title, Publication_year, Key_findings, Geographic_location, Notes
 *
 * Usage:
 *   node scripts/import-reslit-harmonized.mjs <path-to-csv>
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
    const [key, ...rest] = line.split('=')
    const value = rest.join('=')
    if (key && value && !key.startsWith('#')) {
      process.env[key.trim()] = value.trim()
    }
  })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { transport: ws }
})

function parseCSVFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
}

function pipeToArray(value) {
  if (!value || value === '') return null
  return value.split('|').map(v => v.trim()).filter(Boolean)
}

function parseYear(value) {
  if (!value || value === '') return null
  const n = parseInt(value)
  return isNaN(n) ? null : n
}

const BATCH_SIZE = 50

async function importGenes(csvFile) {
  console.log(`\n📖 Reading: ${csvFile}`)

  let records
  try {
    records = parseCSVFile(csvFile)
  } catch (error) {
    console.error(`❌ Failed to parse CSV: ${error.message}`)
    process.exit(1)
  }

  console.log(`✓ Parsed ${records.length} rows\n`)
  console.log('💾 Importing to database...\n')

  let imported = 0
  const errors = []

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    const rows = batch.map(r => ({
      gene_name:              r.Gene || null,
      allele:                 r.Allele || null,
      encodes:                r.Encodes || null,
      mechanism:              r.Mechanism || null,
      confers_resistance_to:  pipeToArray(r.Resistance),
      organisms_tested_in:    pipeToArray(r.Organism),
      validation_method:      r.Validation_method || null,
      paper_pmid:             r.PMID || null,
      title_pmid:             r.Paper_title || null,
      year_pmid:              parseYear(r.Publication_year),
      year:                   parseYear(r.Publication_year),
      key_findings:           r.Key_findings || null,
      geographic_location:    r.Geographic_location || null,
      source_database:        r.Database || 'Reslit',
      sequence_accession:     r.Sequence_accession || null,
      protein_accession:      r.Protein_accession || null,
      notes:                  r.Notes || null,
      status:                 'pending',
    }))

    const { error } = await supabase.from('amr_genes').insert(rows)

    if (error) {
      const start = i + 1
      const end = i + batch.length
      errors.push(`Rows ${start}-${end}: ${error.message}`)
      console.log(`  ❌ Rows ${start}-${end}: ${error.message}`)
    } else {
      imported += batch.length
      console.log(`  ✓ Rows ${i + 1}-${i + batch.length} (${imported}/${records.length})`)
    }
  }

  return { imported, total: records.length, errors }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗')
  console.log('║        Import Harmonized Reslit Genes CSV               ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')

  const csvFile = process.argv[2]
  if (!csvFile) {
    console.error('\n❌ Usage: node scripts/import-reslit-harmonized.mjs <path-to-csv>')
    process.exit(1)
  }

  const filePath = path.resolve(csvFile)
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ File not found: ${filePath}`)
    process.exit(1)
  }

  const { imported, total, errors } = await importGenes(filePath)

  console.log(`\n╔═══════════════════════════════════════════════════════════╗`)
  console.log(`║                    IMPORT COMPLETE                       ║`)
  console.log(`╚═══════════════════════════════════════════════════════════╝`)
  console.log(`\n📊 Results:  ${imported}/${total} imported`)

  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`)
    errors.slice(0, 10).forEach(e => console.log(`   - ${e}`))
    if (errors.length > 10) console.log(`   ... and ${errors.length - 10} more`)
  } else {
    console.log(`\n✅ All genes imported successfully!`)
  }
  console.log('')
}

main()
