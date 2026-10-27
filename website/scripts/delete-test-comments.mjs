#!/usr/bin/env node

/**
 * Delete Test Comments
 * Removes comments used for testing
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

async function deleteTestComments() {
  console.log('\n🗑️  Deleting test comments...\n')

  // Get all comments
  const { data: allComments, error: fetchError } = await supabase
    .from('comments')
    .select('*')

  if (fetchError) {
    console.error('❌ Error fetching comments:', fetchError.message)
    return
  }

  if (!allComments || allComments.length === 0) {
    console.log('✅ No comments to delete\n')
    return
  }

  console.log(`📊 Found ${allComments.length} total comments\n`)

  // Test comments to delete
  const testPatterns = [
    'This is a test comment from script',
    'this is not an amr gene',
    'Test User',
  ]

  let deleted = 0

  for (const comment of allComments) {
    const isTest = testPatterns.some(
      pattern =>
        comment.content.includes(pattern) ||
        comment.user_name === pattern
    )

    if (isTest) {
      console.log(`🗑️  Deleting: "${comment.content.substring(0, 50)}..." by ${comment.user_name}`)
      
      const { error: deleteError } = await supabase
        .from('comments')
        .delete()
        .eq('id', comment.id)

      if (deleteError) {
        console.log(`   ❌ Failed: ${deleteError.message}`)
      } else {
        console.log(`   ✅ Deleted`)
        deleted++
      }
    }
  }

  console.log(`\n✅ Deleted ${deleted} test comments\n`)

  // Show remaining comments
  const { data: remaining } = await supabase
    .from('comments')
    .select('*')

  console.log(`📊 Remaining comments: ${remaining?.length || 0}\n`)
  if (remaining && remaining.length > 0) {
    console.log('Current comments:')
    remaining.forEach(c => {
      console.log(`  • "${c.content.substring(0, 50)}..." by ${c.user_name}`)
    })
  }
}

deleteTestComments()
