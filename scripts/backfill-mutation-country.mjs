#!/usr/bin/env node

/**
 * Backfills the `country` column on amr_mutations from the CSV's geographic_location.
 * Matches rows by nucleotide_change + paper_pmid.
 *
 * Usage:
 *   node scripts/backfill-mutation-country.mjs path/to/mutations.csv
 */

import fs from 'fs'
import path from 'path'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'

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

const csvFile = process.argv[2]
if (!csvFile) {
  console.error('Usage: node scripts/backfill-mutation-country.mjs path/to/mutations.csv')
  process.exit(1)
}

const content = fs.readFileSync(csvFile, 'utf-8')
const records = parse(content, { columns: true, skip_empty_lines: true, trim: true })

console.log(`\n📖 Parsed ${records.length} rows from CSV`)
console.log('🔄 Backfilling country...\n')

let updated = 0
let skipped = 0
const errors = []

for (const record of records) {
  const country = record.geographic_location?.trim() || null
  const nucleotideChange = record.nucleotide_change?.trim() || null
  const paperPmid = record.paper_pmid?.trim() || null

  if (!country || !nucleotideChange || !paperPmid) {
    skipped++
    continue
  }

  const { error } = await supabase
    .from('amr_mutations')
    .update({ country })
    .eq('nucleotide_change', nucleotideChange)
    .eq('paper_pmid', paperPmid)
    .is('country', null)

  if (error) {
    errors.push(`${nucleotideChange} / ${paperPmid}: ${error.message}`)
    console.log(`  ❌ ${nucleotideChange}`)
  } else {
    updated++
    console.log(`  ✓ ${nucleotideChange} → ${country}`)
  }
}

console.log(`\n✅ Done: ${updated} updated, ${skipped} skipped (no country/key)`)
if (errors.length > 0) {
  console.log(`\n⚠️  ${errors.length} errors:`)
  errors.forEach(e => console.log(`  - ${e}`))
}
