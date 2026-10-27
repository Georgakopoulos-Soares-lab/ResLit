#!/usr/bin/env node

/**
 * Verify Comments Table Exists
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'

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

async function checkTable() {
  console.log('\n📋 Checking for comments table...\n')

  // Try to query the comments table
  const { data, error, status } = await supabase
    .from('comments')
    .select('*')
    .limit(1)

  if (error) {
    console.log('❌ ERROR:', error.message)
    console.log('   Status:', status)
    console.log('\n📊 This means:')
    console.log('   • Comments table does NOT exist')
    console.log('   • OR RLS policies are blocking access\n')
    return false
  }

  console.log('✅ SUCCESS: Comments table exists!')
  console.log('   Rows found:', data?.length || 0)
  console.log('\n📊 Table is working properly!\n')
  return true
}

checkTable()
