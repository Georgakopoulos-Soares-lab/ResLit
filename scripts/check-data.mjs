#!/usr/bin/env node

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

async function checkData() {
  console.log('\n📊 Checking database contents...\n')

  // Check genes
  const { data: genes, error: genesError } = await supabase
    .from('amr_genes')
    .select('*')
    .limit(5)

  if (genesError) {
    console.error('❌ Error fetching genes:', genesError.message)
  } else {
    console.log(`✓ Found ${genes?.length || 0} genes (showing first 5)`)
    if (genes && genes.length > 0) {
      genes.forEach(g => {
        console.log(`  - ${g.gene_name} (ID: ${g.id})`)
      })
    }
  }

  // Check mutations
  const { data: mutations, error: mutationsError } = await supabase
    .from('amr_mutations')
    .select('*')
    .limit(5)

  if (mutationsError) {
    console.error('❌ Error fetching mutations:', mutationsError.message)
  } else {
    console.log(`✓ Found ${mutations?.length || 0} mutations (showing first 5)`)
  }

  // Check papers
  const { data: papers, error: papersError } = await supabase
    .from('papers')
    .select('*')
    .limit(5)

  if (papersError) {
    console.error('❌ Error fetching papers:', papersError.message)
  } else {
    console.log(`✓ Found ${papers?.length || 0} papers (showing first 5)`)
    if (papers && papers.length > 0) {
      papers.forEach(p => {
        console.log(`  - ${p.pmid}`)
      })
    }
  }

  console.log('\n')
}

checkData()
