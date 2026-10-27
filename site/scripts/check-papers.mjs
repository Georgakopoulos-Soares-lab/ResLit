#!/usr/bin/env node

/**
 * Check Papers - Lists all papers in the database
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

async function checkPapers() {
  console.log('\n📋 Papers in database:\n')
  
  const { data: papers, error } = await supabase
    .from('papers')
    .select('pmid, title')
    .order('pmid')

  if (error) {
    console.error('Error:', error.message)
    return
  }

  if (papers.length === 0) {
    console.log('No papers found!')
    return
  }

  papers.forEach(p => {
    console.log(`  ${p.pmid}: ${p.title ? p.title.substring(0, 60) + '...' : 'N/A'}`)
  })
  
  console.log(`\nTotal: ${papers.length} papers\n`)
}

checkPapers()
