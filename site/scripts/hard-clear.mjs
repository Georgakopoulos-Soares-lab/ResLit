#!/usr/bin/env node

/**
 * Hard Clear - Completely empties all tables
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

async function hardClear() {
  console.log('\n🔥 HARD CLEAR - Removing ALL records...\n')

  // Count before
  const { count: mutCount } = await supabase
    .from('amr_mutations')
    .select('*', { count: 'exact', head: true })
  
  const { count: geneCount } = await supabase
    .from('amr_genes')
    .select('*', { count: 'exact', head: true })

  const { count: paperCount } = await supabase
    .from('papers')
    .select('*', { count: 'exact', head: true })

  console.log(`Before:`)
  console.log(`  Mutations: ${mutCount}`)
  console.log(`  Genes: ${geneCount}`)
  console.log(`  Papers: ${paperCount}\n`)

  // Delete all mutations (bulk)
  console.log('Deleting mutations...')
  const { error: mutError } = await supabase
    .from('amr_mutations')
    .delete()
    .gte('id', 0)
  console.log(`  ✓ Mutations deleted`)

  // Delete all genes (bulk)
  console.log('Deleting genes...')
  const { error: geneError } = await supabase
    .from('amr_genes')
    .delete()
    .gte('id', 0)
  console.log(`  ✓ Genes deleted`)

  // Delete all papers (bulk)
  console.log('Deleting papers...')
  const { error: paperError } = await supabase
    .from('papers')
    .delete()
    .gte('pmid', '0')
  console.log(`  ✓ Papers deleted`)

  // Verify empty
  const { count: finalMutCount } = await supabase
    .from('amr_mutations')
    .select('*', { count: 'exact', head: true })
  
  const { count: finalGeneCount } = await supabase
    .from('amr_genes')
    .select('*', { count: 'exact', head: true })

  const { count: finalPaperCount } = await supabase
    .from('papers')
    .select('*', { count: 'exact', head: true })

  console.log(`\nAfter:`)
  console.log(`  Mutations: ${finalMutCount}`)
  console.log(`  Genes: ${finalGeneCount}`)
  console.log(`  Papers: ${finalPaperCount}\n`)

  if (finalMutCount === 0 && finalGeneCount === 0 && finalPaperCount === 0) {
    console.log('✅ Database completely cleared!\n')
  } else {
    console.log('⚠️  Warning: Some records remain\n')
  }
}

hardClear()
