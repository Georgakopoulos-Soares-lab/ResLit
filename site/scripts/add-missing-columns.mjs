#!/usr/bin/env node

/**
 * Add missing columns to amr_genes and amr_mutations
 * Run this after the main migration if needed
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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials!')
  console.error('   Set SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws }
})

async function addMissingColumns() {
  console.log('\n📋 Adding missing columns to amr_genes and amr_mutations...\n')

  try {
    // Add columns to amr_genes
    const { error: genesError } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE amr_genes
          ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS isolation_country TEXT,
          ADD COLUMN IF NOT EXISTS year INTEGER;
      `
    })

    if (genesError && !genesError.message.includes('does not exist')) {
      console.error('❌ Error adding columns to amr_genes:', genesError)
    } else {
      console.log('✓ Added columns to amr_genes')
    }

    // Add columns to amr_mutations
    const { error: mutError } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE amr_mutations
          ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS mutation_name TEXT,
          ADD COLUMN IF NOT EXISTS effect TEXT,
          ADD COLUMN IF NOT EXISTS country TEXT;
      `
    })

    if (mutError && !mutError.message.includes('does not exist')) {
      console.error('❌ Error adding columns to amr_mutations:', mutError)
    } else {
      console.log('✓ Added columns to amr_mutations')
    }

    console.log('\n✅ Column migration complete!\n')
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.log('\n⚠️  Note: Supabase might not have an exec RPC function.')
    console.log('   Please run the supabase_migration.sql in Supabase SQL Editor instead.\n')
    process.exit(1)
  }
}

addMissingColumns()
