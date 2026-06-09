#!/usr/bin/env node

/**
 * CSV Importer - Genes
 * 
 * Imports genes from genes_extracted.csv into the database
 * 
 * Usage:
 *   node scripts/import-genes-csv.mjs genes_extracted.csv
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

async function importGenes(csvFile) {
  console.log(`\n📖 Reading: ${csvFile}`)
  
  let records
  try {
    records = parseCSVFile(csvFile)
  } catch (error) {
    console.error(`❌ Failed to parse CSV: ${error.message}`)
    process.exit(1)
  }
  
  console.log(`✓ Parsed ${records.length} genes\n`)
  console.log('💾 Importing to database...\n')
  
  let imported = 0
  const errors = []

  for (const record of records) {
    const { error } = await supabase
      .from('amr_genes')
      .insert({
        gene_name: record.gene_name,
        allele: record.allele || null,
        encodes: record.encodes || null,
        mechanism: record.mechanism || null,
        resistance_mechanism_class: record.resistance_mechanism_class || null,
        confers_resistance_to: stringToArray(record.confers_resistance_to),
        organisms_tested_in: stringToArray(record.organisms_tested_in),
        role_in_paper: record.role_in_paper || null,
        validation_method: record.validation_method || null,
        paper_pmid: record.paper_pmid || null,
        key_findings: record.key_findings || null,
        geographic_location: record.geographic_location || null,
        title_pmid: record.Title_PMID || null,
        year_pmid: record.YEAR_PMID ? parseInt(record.YEAR_PMID) : null,
        source_database: record.Database || 'Reslit',
        status: 'pending',
      })

    if (error) {
      errors.push(`${record.gene_name}: ${error.message}`)
      console.log(`  ❌ ${record.gene_name}`)
    } else {
      imported++
      console.log(`  ✓ ${record.gene_name}`)
    }
  }

  return { imported, total: records.length, errors }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║              CSV to Database Importer - Genes                 ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  const csvFile = process.argv[2] || 'genes_extracted.csv'
  const filePath = path.resolve(csvFile)

  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ File not found: ${filePath}`)
    process.exit(1)
  }

  const { imported, total, errors } = await importGenes(filePath)

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
    console.log(`\n✅ All genes imported successfully!`)
  }

  console.log('\n')
}

main()
