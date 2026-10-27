#!/usr/bin/env node

/**
 * Quick database check
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

async function check() {
  console.log('\n📊 Database Contents:\n')

  // Check papers
  const { data: papers, error: papersError } = await supabase
    .from('papers')
    .select('pmid')
  
  if (papersError) {
    console.log('❌ Papers error:', papersError.message)
  } else {
    console.log(`✓ Papers: ${papers?.length || 0}`)
    papers?.slice(0, 5).forEach(p => console.log(`  - ${p.pmid}`))
  }

  // Check genes
  const { data: genes, error: genesError } = await supabase
    .from('amr_genes')
    .select('gene_name')
    .limit(5)
  
  if (genesError) {
    console.log('❌ Genes error:', genesError.message)
  } else {
    console.log(`✓ Genes: ${genes?.length || 0} (first 5)`)
    genes?.forEach(g => console.log(`  - ${g.gene_name}`))
  }

  // Check mutations
  const { data: mutations, error: mutationsError } = await supabase
    .from('amr_mutations')
    .select('mutation, gene_name')
    .limit(5)
  
  if (mutationsError) {
    console.log('❌ Mutations error:', mutationsError.message)
  } else {
    console.log(`✓ Mutations: ${mutations?.length || 0} (first 5)`)
    mutations?.forEach(m => console.log(`  - ${m.mutation} (${m.gene_name})`))
  }

  console.log()
}

check()
