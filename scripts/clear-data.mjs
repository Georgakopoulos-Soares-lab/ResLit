#!/usr/bin/env node

/**
 * Clear Data - Deletes all genes and mutations for a fresh start
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

async function clearData() {
  console.log('\n⚠️  Clearing all mutations and genes...\n')

  // Delete all mutations first (because of foreign key constraints)
  const { error: mutError } = await supabase
    .from('amr_mutations')
    .delete()
    .gte('id', 0) // Delete all records

  if (mutError) {
    console.error('❌ Error deleting mutations:', mutError)
  } else {
    console.log('✓ All mutations cleared')
  }

  // Delete all genes
  const { error: geneError } = await supabase
    .from('amr_genes')
    .delete()
    .gte('id', 0) // Delete all records

  if (geneError) {
    console.error('❌ Error deleting genes:', geneError)
  } else {
    console.log('✓ All genes cleared')
  }

  console.log('\n✅ Database cleared! Ready for fresh import.\n')
}

clearData()
