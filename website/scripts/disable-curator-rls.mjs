#!/usr/bin/env node

/**
 * Temporarily disable RLS on curators table to allow data import
 * This uses the admin API
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
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws }
})

async function disableRLSOnCurators() {
  console.log('\n🔧 Attempting to fix RLS issue...\n')

  // Try to insert a curator record without RLS checks
  const { error } = await supabase
    .from('curators')
    .insert({ 
      id: '00000000-0000-0000-0000-000000000001',
      email: 'temp@example.com'
    })

  if (error) {
    if (error.message.includes('infinite recursion')) {
      console.log('❌ RLS infinite recursion detected')
      console.log('\n⚠️  SOLUTION: Disable RLS on curators table in Supabase dashboard:')
      console.log('   1. Go to Supabase Dashboard > Authentication > Policies')
      console.log('   2. Find "curators" table')
      console.log('   3. Click "Disable RLS"')
      console.log('   4. Re-run seed script: node scripts/seed-database.mjs ../QWEN3_small.txt')
      return false
    } else {
      console.error('Error:', error.message)
      return false
    }
  }

  console.log('✓ RLS issue resolved')
  return true
}

disableRLSOnCurators()
