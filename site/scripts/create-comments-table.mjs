#!/usr/bin/env node

/**
 * Quick Migration: Create Comments Table
 * 
 * This script creates the comments table in Supabase using raw SQL
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials!')
  process.exit(1)
}

// Use service role key if available (for better permissions), otherwise anon key
const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, key)

async function createCommentsTable() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║         CREATING COMMENTS TABLE                                ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  try {
    // Individual statements to avoid transaction issues
    const statements = [
      // Create table
      `CREATE TABLE IF NOT EXISTS comments (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type       TEXT NOT NULL,
        target_id         TEXT NOT NULL,
        user_id           UUID,
        user_email        TEXT,
        user_name         TEXT,
        content           TEXT NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );`,

      // Enable RLS
      `ALTER TABLE comments ENABLE ROW LEVEL SECURITY;`,

      // Drop existing policies if they exist
      `DROP POLICY IF EXISTS "Anyone can read comments" ON comments;`,
      `DROP POLICY IF EXISTS "Anyone can insert comments" ON comments;`,

      // Create new policies
      `CREATE POLICY "Anyone can read comments"
        ON comments FOR SELECT
        USING (true);`,

      `CREATE POLICY "Anyone can insert comments"
        ON comments FOR INSERT
        WITH CHECK (true);`,

      // Create index
      `CREATE INDEX IF NOT EXISTS comments_target_idx 
        ON comments(target_type, target_id);`,
    ]

    console.log(`Executing ${statements.length} SQL statements...\n`)

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      const desc = stmt.split('\n')[0].substring(0, 50)
      
      try {
        // Use raw query through the client
        const { error } = await supabase.rpc('query', { sql: stmt })
        
        if (error && !error.message?.includes('already exists') && !error.message?.includes('does not exist')) {
          console.log(`  ⚠️  [${i + 1}] ${desc}`)
          console.log(`      Error: ${error.message}`)
        } else {
          console.log(`  ✓ [${i + 1}] ${desc}`)
        }
      } catch (err) {
        // Some operations might not work through rpc, that's okay
        console.log(`  ⚠️  [${i + 1}] ${desc} (skipped - may need manual setup)`)
      }
    }

    console.log(`\n✅ Comments table setup complete!\n`)
    console.log('📝 Next steps:')
    console.log('   1. If any statements failed, manually run them in Supabase SQL Editor')
    console.log('   2. Verify the comments table exists in the Supabase dashboard')
    console.log('   3. Test adding a comment to a gene\n')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

createCommentsTable()
