#!/usr/bin/env node

/**
 * Update Mutations Schema
 * Adds missing columns to amr_mutations table to support independent mutations
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

async function updateSchema() {
  console.log('\n🔧 Updating amr_mutations schema...\n')

  // Execute raw SQL to alter the table
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE amr_mutations
      ADD COLUMN IF NOT EXISTS gene_name TEXT,
      ADD COLUMN IF NOT EXISTS nucleotide_change TEXT,
      ADD COLUMN IF NOT EXISTS protein_change TEXT,
      ADD COLUMN IF NOT EXISTS confers_resistance_to TEXT[],
      ADD COLUMN IF NOT EXISTS organisms_observed_in TEXT[],
      ADD COLUMN IF NOT EXISTS validated_by TEXT,
      ADD COLUMN IF NOT EXISTS origin TEXT;
      
      ALTER TABLE amr_mutations
      ALTER COLUMN gene_id DROP NOT NULL;
    `
  })

  if (error) {
    console.error('❌ Error:', error.message)
    console.log('\n⚠️  This is expected if the RPC function doesn\'t exist.')
    console.log('    You need to run the SQL manually in Supabase:\n')
    console.log(`    ALTER TABLE amr_mutations
    ADD COLUMN IF NOT EXISTS gene_name TEXT,
    ADD COLUMN IF NOT EXISTS nucleotide_change TEXT,
    ADD COLUMN IF NOT EXISTS protein_change TEXT,
    ADD COLUMN IF NOT EXISTS confers_resistance_to TEXT[],
    ADD COLUMN IF NOT EXISTS organisms_observed_in TEXT[],
    ADD COLUMN IF NOT EXISTS validated_by TEXT,
    ADD COLUMN IF NOT EXISTS origin TEXT;
    
    ALTER TABLE amr_mutations
    ALTER COLUMN gene_id DROP NOT NULL;`)
  } else {
    console.log('✅ Schema updated successfully!')
  }
}

updateSchema()
