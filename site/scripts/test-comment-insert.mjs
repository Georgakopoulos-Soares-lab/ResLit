#!/usr/bin/env node

/**
 * Test Adding a Comment
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

async function testAddComment() {
  console.log('\n📝 Testing comment insertion...\n')

  const testComment = {
    target_type: 'gene',
    target_id: '1',
    user_id: null,
    user_email: 'test@example.com',
    user_name: 'Test User',
    content: 'This is a test comment from script',
  }

  console.log('📋 Inserting comment:')
  console.log(JSON.stringify(testComment, null, 2))
  console.log()

  const start = Date.now()
  const { data, error, status } = await supabase
    .from('comments')
    .insert([testComment])
    .select()

  const elapsed = Date.now() - start

  if (error) {
    console.log('❌ FAILED:', error.message)
    console.log('   Status:', status)
    console.log('   Elapsed:', elapsed, 'ms')
    return false
  }

  console.log('✅ SUCCESS: Comment inserted!')
  console.log('   Rows created:', data?.length || 0)
  console.log('   Elapsed:', elapsed, 'ms')
  console.log('   Response:', JSON.stringify(data, null, 2))
  return true
}

testAddComment()
