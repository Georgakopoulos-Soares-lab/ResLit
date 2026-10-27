#!/usr/bin/env node

/**
 * Clear All Comments
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

async function clearComments() {
  console.log('\n🗑️  Clearing ALL comments...\n')

  const { error } = await supabase
    .from('comments')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000')

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  console.log('✅ All comments deleted!\n')

  // Verify
  const { data: remaining } = await supabase
    .from('comments')
    .select('*')

  console.log(`📊 Remaining comments: ${remaining?.length || 0}\n`)
}

clearComments()
