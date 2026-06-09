#!/usr/bin/env node

/**
 * CSV to Database Importer
 * 
 * Simple one-time import from genes.csv to database
 * 
 * Usage:
 *   node scripts/import-csv.mjs genes.csv
 */

import fs from 'fs'
import path from 'path'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

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

function parseCSV(content) {
  const lines = content.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Simple CSV parsing (handles pipe-separated arrays)
    const values = line.split(',').map(v => v.trim())
    const record = {}
    
    headers.forEach((header, idx) => {
      let value = values[idx]
      
      if (!value || value === '') {
        record[header] = null
      } else if (header.includes('resistance') || header.includes('organisms')) {
        // Convert pipe-separated values to arrays
        record[header] = value.split('|')
      } else {
        record[header] = value
      }
    })
    
    records.push(record)
  }
  
  return records
}

// ============================================================
// Import Function
// ============================================================

async function importGenes(genes) {
  console.log(`\n📂 Importing ${genes.length} genes...\n`)
  
  let imported = 0
  const errors = []

  for (const gene of genes) {
    const { error } = await supabase
      .from('amr_genes')
      .insert({
        gene_name: gene.gene_name,
        allele: gene.allele || null,
        encodes: gene.encodes || null,
        mechanism: gene.mechanism || null,
        resistance_mechanism_class: gene.resistance_mechanism_class || null,
        confers_resistance_to: gene.confers_resistance_to || null,
        organisms_tested_in: gene.organisms_tested_in || null,
        role_in_paper: gene.role_in_paper || null,
        validation_method: gene.validation_method || null,
        paper_pmid: gene.paper_pmid || null,
      })

    if (error) {
      errors.push(`${gene.gene_name}: ${error.message}`)
    } else {
      imported++
      console.log(`✓ ${gene.gene_name}`)
    }
  }

  return { imported, errors }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║              CSV to Database Importer                         ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  const csvFile = process.argv[2] || 'genes.csv'
  const filePath = path.resolve(csvFile)

  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ File not found: ${filePath}`)
    process.exit(1)
  }

  console.log(`\n📖 Reading: ${csvFile}`)
  const content = fs.readFileSync(filePath, 'utf-8')
  const genes = parseCSV(content)
  console.log(`✓ Parsed ${genes.length} genes\n`)

  const { imported, errors } = await importGenes(genes)

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`)
  console.log(`║                      IMPORT COMPLETE ✓                        ║`)
  console.log(`╚════════════════════════════════════════════════════════════════╝`)

  console.log(`\n📊 Results:`)
  console.log(`   Imported: ${imported}/${genes.length}`)
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors:`)
    errors.forEach(e => console.log(`   - ${e}`))
  } else {
    console.log(`\n✅ All genes imported successfully!`)
  }

  console.log('\n')
}

main()
