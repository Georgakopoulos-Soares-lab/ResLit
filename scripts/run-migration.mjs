#!/usr/bin/env node

/**
 * Run Supabase Migration SQL
 * 
 * Executes SQL statements from supabase_migration.sql
 * Note: This uses raw SQL execution through Supabase
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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials!')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { transport: ws }
})

async function runMigration() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║               RUNNING SUPABASE MIGRATION                       ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  try {
    // Read the migration file
    const migrationPath = path.resolve('../supabase_migration.sql')
    const fullSql = fs.readFileSync(migrationPath, 'utf-8')
    
    console.log('📝 Executing migration SQL...\n')
    
    // Split SQL into individual statements and execute them
    // This is necessary because Supabase may not support multiple statements in a single query
    const statements = fullSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    console.log(`Found ${statements.length} SQL statements to execute\n`)
    
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ';'
      console.log(`[${i + 1}/${statements.length}] Executing statement...`)
      
      try {
        const { error } = await supabase.rpc('exec', { sql: stmt })
        
        if (error) {
          console.log(`  ⚠️  Warning: ${error.message}`)
          errorCount++
        } else {
          console.log(`  ✓ Success`)
          successCount++
        }
      } catch (err) {
        // Some statements might fail due to RLS policies - that's okay
        if (err.message && err.message.includes('permission')) {
          console.log(`  ℹ️  Permission issue (expected for some statements)`)
        } else {
          console.log(`  ⚠️  ${err.message}`)
        }
        errorCount++
      }
    }
    
    console.log(`\n✅ Migration completed!`)
    console.log(`   ✓ Successful: ${successCount}`)
    console.log(`   ⚠️  Warnings/Errors: ${errorCount}\n`)
    
  } catch (error) {
    console.error('❌ Error reading migration file:', error.message)
    process.exit(1)
  }
}

runMigration()

