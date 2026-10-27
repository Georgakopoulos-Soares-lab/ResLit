#!/usr/bin/env node

/**
 * Complete Database Rebuild
 * 
 * Rebuilds the entire database from scratch using only 2 CSV files:
 * 1. genes_extracted.csv
 * 2. mutations_extracted.csv
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
// Utilities
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
// Main Workflow
// ============================================================

async function rebuild() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║               DATABASE COMPLETE REBUILD                       ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  // Step 1: Clear everything
  console.log('📋 Step 1: Clearing database...\n')
  
  let result = await supabase.from('amr_mutations').delete().gte('id', 0)
  console.log(`  ✓ Mutations cleared`)
  
  result = await supabase.from('amr_genes').delete().gte('id', 0)
  console.log(`  ✓ Genes cleared`)
  
  result = await supabase.from('papers').delete().gte('pmid', 0)
  console.log(`  ✓ Papers cleared\n`)

  // Step 2: Parse CSV files
  console.log('📖 Step 2: Parsing CSV files...\n')
  
  const genesRecords = parseCSVFile(path.resolve('../genes_extracted.csv'))
  console.log(`  ✓ Parsed ${genesRecords.length} genes`)
  
  const mutationsRecords = parseCSVFile(path.resolve('../mutations_extracted.csv'))
  console.log(`  ✓ Parsed ${mutationsRecords.length} mutations\n`)

  // Step 3: Extract unique PMIDs and create papers
  console.log('📰 Step 3: Creating papers...\n')
  
  const uniquePMIDs = new Set()
  genesRecords.forEach(r => uniquePMIDs.add(r.paper_pmid))
  mutationsRecords.forEach(r => uniquePMIDs.add(r.paper_pmid))
  
  const pmidArray = Array.from(uniquePMIDs)
  console.log(`  Found ${pmidArray.length} unique papers: ${pmidArray.join(', ')}\n`)
  
  for (const pmid of pmidArray) {
    const { error } = await supabase
      .from('papers')
      .insert({
        pmid: String(pmid),
        paper_type: 'research',
        key_findings: `Paper ${pmid}`,
      })
    
    if (error) {
      console.log(`  ❌ Paper ${pmid}: ${error.message}`)
    } else {
      console.log(`  ✓ Paper ${pmid}`)
    }
  }
  
  console.log()

  // Step 4: Import genes
  console.log('🧬 Step 4: Importing genes...\n')
  
  let genesImported = 0
  let genesErrors = []
  
  for (const record of genesRecords) {
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
        isolation_country: record.geographic_location || null,
      })

    if (error) {
      genesErrors.push(`${record.gene_name}: ${error.message}`)
      console.log(`  ❌ ${record.gene_name}`)
    } else {
      genesImported++
      console.log(`  ✓ ${record.gene_name}`)
    }
  }
  
  console.log(`\n  Summary: ${genesImported}/${genesRecords.length} genes imported\n`)

  // Step 5: Import mutations
  console.log('🧬 Step 5: Importing mutations...\n')
  
  let mutationsImported = 0
  let mutationsErrors = []
  
  for (const record of mutationsRecords) {
    // Try to get gene_id if the gene exists
    let geneId = null
    const { data: geneData } = await supabase
      .from('amr_genes')
      .select('id')
      .eq('gene_name', record.gene_name)
      .limit(1)
      .single()

    if (geneData) {
      geneId = geneData.id
    }

    const { error } = await supabase
      .from('amr_mutations')
      .insert({
        gene_id: geneId,  // Can be null if gene doesn't exist
        gene_name: record.gene_name,  // Always store gene name
        mutation: record.notation || null,
        nucleotide_change: record.nucleotide_change || null,
        protein_change: record.protein_change || null,
        confers_resistance_to: stringToArray(record.confers_resistance_to),
        organisms_observed_in: stringToArray(record.organisms_observed_in),
        validated_by: record.validated_by || null,
        origin: record.origin || null,
      })

    if (error) {
      mutationsErrors.push(`${record.notation}: ${error.message}`)
      console.log(`  ❌ ${record.notation} (${record.gene_name})`)
    } else {
      mutationsImported++
      const geneStatus = geneId ? 'with gene_id' : 'standalone'
      console.log(`  ✓ ${record.notation} (${geneStatus})`)
    }
  }
  
  console.log(`\n  Summary: ${mutationsImported}/${mutationsRecords.length} mutations imported\n`)

  // Final summary
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║                    REBUILD COMPLETE ✓                         ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  console.log('📊 Final Statistics:')
  console.log(`   Papers:    ${pmidArray.length}`)
  console.log(`   Genes:     ${genesImported}/${genesRecords.length}`)
  console.log(`   Mutations: ${mutationsImported}/${mutationsRecords.length}`)
  
  if (genesErrors.length > 0 || mutationsErrors.length > 0) {
    console.log('\n⚠️  Errors:')
    if (genesErrors.length > 0) {
      console.log('\n  Genes:')
      genesErrors.slice(0, 3).forEach(e => console.log(`    - ${e}`))
      if (genesErrors.length > 3) console.log(`    ... and ${genesErrors.length - 3} more`)
    }
    if (mutationsErrors.length > 0) {
      console.log('\n  Mutations:')
      mutationsErrors.slice(0, 3).forEach(e => console.log(`    - ${e}`))
      if (mutationsErrors.length > 3) console.log(`    ... and ${mutationsErrors.length - 3} more`)
    }
  } else {
    console.log('\n✅ All data imported successfully!\n')
  }
}

rebuild().catch(console.error)
