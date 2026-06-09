#!/usr/bin/env node

/**
 * Deduplicate Database
 * Removes duplicate genes and keeps only unique entries
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

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { transport: ws }
})

async function deduplicateGenes() {
  console.log('\n🧹 Deduplicating genes...\n')

  // Get all genes
  const { data: allGenes, error: fetchError } = await supabase
    .from('amr_genes')
    .select('*')
    .order('id')

  if (fetchError) {
    console.error('Error fetching genes:', fetchError)
    return
  }

  console.log(`📊 Found ${allGenes.length} total genes\n`)

  // Find duplicates (same gene_name AND paper_pmid)
  const genesByNameAndPaper = {}
  const duplicateIds = []

  allGenes.forEach(gene => {
    const key = `${gene.gene_name}|${gene.paper_pmid}`
    if (!genesByNameAndPaper[key]) {
      genesByNameAndPaper[key] = []
    }
    genesByNameAndPaper[key].push(gene.id)
  })

  // Collect IDs to delete (keep first, delete rest)
  Object.entries(genesByNameAndPaper).forEach(([key, ids]) => {
    if (ids.length > 1) {
      const [name, pmid] = key.split('|')
      console.log(`  Found ${ids.length} duplicates: ${name} (PMID: ${pmid})`)
      duplicateIds.push(...ids.slice(1)) // Keep first, delete rest
    }
  })

  if (duplicateIds.length === 0) {
    console.log('✅ No exact duplicates found!\n')
    console.log(`📊 Keeping ${Object.keys(genesByNameAndPaper).length} gene entries (including legitimate duplicates from different papers)\n`)
    return
  }

  console.log(`\n🗑️  Deleting ${duplicateIds.length} duplicate entries...\n`)

  // Delete duplicates
  for (const id of duplicateIds) {
    const { error } = await supabase
      .from('amr_genes')
      .delete()
      .eq('id', id)

    if (error) {
      console.log(`  ❌ Failed to delete ID ${id}`)
    } else {
      console.log(`  ✓ Deleted duplicate ID ${id}`)
    }
  }

  console.log(`\n✅ Deduplication complete!`)
  console.log(`   Kept: ${Object.keys(genesByNameAndPaper).length} unique gene+paper combinations\n`)
}

async function deduplicateMutations() {
  console.log('🧹 Deduplicating mutations...\n')

  // Get all mutations
  const { data: allMutations, error: fetchError } = await supabase
    .from('amr_mutations')
    .select('*')
    .order('id')

  if (fetchError) {
    console.error('Error fetching mutations:', fetchError)
    return
  }

  console.log(`📊 Found ${allMutations.length} total mutations\n`)

  // Find duplicates (same gene_name + notation)
  const mutationsByKey = {}
  const duplicateIds = []

  allMutations.forEach(mut => {
    const key = `${mut.gene_name}|${mut.mutation}`
    if (!mutationsByKey[key]) {
      mutationsByKey[key] = []
    }
    mutationsByKey[key].push(mut.id)
  })

  // Collect IDs to delete
  Object.entries(mutationsByKey).forEach(([key, ids]) => {
    if (ids.length > 1) {
      console.log(`  Found ${ids.length} duplicates: ${key}`)
      duplicateIds.push(...ids.slice(1))
    }
  })

  if (duplicateIds.length === 0) {
    console.log('✅ No duplicates found!\n')
    return
  }

  console.log(`\n🗑️  Deleting ${duplicateIds.length} duplicate entries...\n`)

  for (const id of duplicateIds) {
    const { error } = await supabase
      .from('amr_mutations')
      .delete()
      .eq('id', id)

    if (error) {
      console.log(`  ❌ Failed to delete ID ${id}`)
    } else {
      console.log(`  ✓ Deleted duplicate ID ${id}`)
    }
  }

  console.log(`\n✅ Deduplication complete!`)
  console.log(`   Kept: ${Object.keys(mutationsByKey).length} unique mutations\n`)
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║                 DATABASE DEDUPLICATION                        ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  await deduplicateGenes()
  await deduplicateMutations()

  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║                    COMPLETE ✓                                 ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
}

main()
