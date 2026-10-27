#!/usr/bin/env node

/**
 * Disable RLS on curators to fix infinite recursion
 * Then re-run seed script
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

async function fixRLS() {
  console.log('\n🔧 Fixing RLS policies...\n')

  // Drop problematic curators policies
  const sql = `
    DROP POLICY IF EXISTS "Anyone can read curator list" ON curators;
    DROP POLICY IF EXISTS "Curators can read curator list" ON curators;
    DROP POLICY IF EXISTS "Curators can insert curators" ON curators;
    
    -- Disable RLS on curators temporarily to allow inserts
    ALTER TABLE curators DISABLE ROW LEVEL SECURITY;
    
    -- Re-enable with simpler policies
    ALTER TABLE curators ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Anyone can read curators"
      ON curators FOR SELECT
      USING (true);
    
    CREATE POLICY "Anyone can insert curators"
      ON curators FOR INSERT
      WITH CHECK (true);
  `

  // Note: We can't directly execute SQL via Supabase JS client
  // Instead, we'll use the service key to modify policies programmatically
  console.log('⚠️  Note: Please run this SQL in Supabase SQL Editor:')
  console.log('\n' + sql)
  console.log('\nOr use Supabase dashboard to disable RLS on the "curators" table.')
}

fixRLS()
