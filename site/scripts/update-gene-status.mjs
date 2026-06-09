#!/usr/bin/env node

/**
 * Update Gene Status and Gene-Level Status
 *
 * status (allele-level):
 *   'curated' if this row's source_database is a known DB, OR a curator manually validated it
 *
 * gene_status (gene-level):
 *   'curated' if the gene_name has >=5 total papers across all alleles,
 *   OR any allele of the gene has status='curated' (known DB or curator-validated)
 *
 * Usage:
 *   node scripts/update-gene-status.mjs
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

const KNOWN_DATABASES = ['CARD', 'Resfinder', 'Reference Gene Catalog Database']

async function updateGeneStatus() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║           Update Gene Status and Gene-Level Status            ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  // Fetch all rows to compute status logic
  const { data: genes, error: fetchError } = await supabase
    .from('amr_genes')
    .select('gene_name, source_database, validated_by')

  if (fetchError) {
    console.error(`❌ Failed to fetch genes: ${fetchError.message}`)
    process.exit(1)
  }

  console.log(`📊 Processing ${genes.length} gene records...\n`)

  // Determine allele-level status for each row
  // (from known DB or curator-validated)
  const geneStats = {}
  for (const row of genes) {
    const rowCurated =
      (row.source_database && KNOWN_DATABASES.includes(row.source_database)) ||
      !!row.validated_by

    if (!geneStats[row.gene_name]) {
      geneStats[row.gene_name] = { count: 0, hasCuratedAllele: false }
    }
    geneStats[row.gene_name].count++
    if (rowCurated) {
      geneStats[row.gene_name].hasCuratedAllele = true
    }
  }

  // Step 1: Reset all rows to pending (both fields)
  const { error: resetError } = await supabase
    .from('amr_genes')
    .update({ status: 'pending', gene_status: 'pending' })
    .not('id', 'is', null)

  if (resetError) {
    console.error(`❌ Failed to reset statuses: ${resetError.message}`)
    process.exit(1)
  }
  console.log('🔄 Reset all rows to pending\n')

  // Step 2: Set status='curated' for rows from known databases
  for (const db of KNOWN_DATABASES) {
    const { error } = await supabase
      .from('amr_genes')
      .update({ status: 'curated' })
      .eq('source_database', db)

    if (error) {
      console.error(`❌ status update failed for ${db}: ${error.message}`)
    } else {
      console.log(`  ✓ status=curated  rows from "${db}"`)
    }
  }

  // Step 3: Restore status='curated' for curator-validated rows
  const { error: curatorError } = await supabase
    .from('amr_genes')
    .update({ status: 'curated' })
    .not('validated_by', 'is', null)

  if (curatorError) {
    console.error(`❌ Failed to restore curator-validated statuses: ${curatorError.message}`)
  } else {
    console.log(`  ✓ status=curated  curator-validated rows`)
  }

  // Step 4: Set gene_status='curated' for all rows of validated genes
  // A gene is validated if it has >5 total papers OR any allele is curated
  console.log()
  let geneErrors = 0
  for (const [geneName, stats] of Object.entries(geneStats)) {
    const geneValidated = stats.count >= 5 || stats.hasCuratedAllele
    if (!geneValidated) continue

    const { error } = await supabase
      .from('amr_genes')
      .update({ gene_status: 'curated' })
      .eq('gene_name', geneName)

    if (error) {
      console.log(`  ❌ gene_status update failed for ${geneName}: ${error.message}`)
      geneErrors++
    } else {
      const reasons = []
      if (stats.count > 5) reasons.push(`${stats.count} papers`)
      if (stats.hasCuratedAllele) reasons.push('curated allele')
      console.log(`  ✓ gene_status=curated  ${geneName} (${reasons.join(', ')})`)
    }
  }

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`)
  console.log(`║                    UPDATE COMPLETE ✓                         ║`)
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`)
  if (geneErrors > 0) {
    console.log(`   Errors: ${geneErrors}`)
  }
}

updateGeneStatus()
