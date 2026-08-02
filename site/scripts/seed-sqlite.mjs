#!/usr/bin/env -S npx tsx
/**
 * Seeds the local SQLite database from the pipeline's harmonized CSV output.
 * Sources (all under scripts/seed-data/):
 *   Full_list_genes_Reslit_harmonized_antib_bact.csv       — your own extraction pipeline ("Reslit")
 *   Full_list_mutations_Reslit_antib_bact.csv               — your own extraction pipeline ("Reslit")
 *   Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv
 *                                                            — CARD / ResFinder / Reference Gene Catalog
 *   Full_list_mutations_otherDatabases_clean.csv             — CARD / ResFinder / AMRFinder
 *
 * The "other databases" files exist so the validation-tier system (see
 * lib/actions/browse.ts EXTERNAL_DATABASES) can mark a gene/mutation
 * "Confirmed"/"Established" when it's independently reported outside your
 * own pipeline — without them, every entry is capped at "Supported"/
 * "Candidate" since there's nothing to cross-reference against.
 *
 * The other-databases mutations file uses different source-database labels
 * (AMRFinder/CARD/ResFinder) than the genes file (Reference Gene
 * Catalog/Card Database/ResFinder Database). Both are normalized to the
 * genes file's three canonical names here, since that's what
 * EXTERNAL_DATABASES checks against.
 *
 * Column mapping ported from the original Supabase importers
 * (scripts/import-reslit-harmonized.mjs, scripts/import-mutations-csv.mjs,
 * scripts/import-genes-csv.mjs).
 *
 * amr_genes.paper_pmid is a real FK to papers.pmid, but none of these CSVs
 * are a papers export — paper metadata is denormalized onto every
 * gene/mutation row instead. So papers rows are derived here (deduplicated
 * by PMID, across all four CSVs) and inserted first to satisfy the FK and
 * to populate the papers table for getPaperDetail().
 *
 * Re-running this script is safe: it clears papers/amr_genes/amr_mutations
 * first, so editing the source CSVs and re-running always gives a clean
 * replace rather than duplicate rows. It does NOT touch curators, comments,
 * curation_history, or curation_notes — those are live app state, not
 * sourced from the CSV. Note that a reseed does orphan any existing
 * comments/curation history tied to specific gene/mutation IDs, since
 * autoincrement IDs are reassigned on reinsert — not a concern before any
 * real curator activity exists, but worth knowing later.
 *
 * Usage: pnpm db:seed
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'csv-parse/sync'
import { db, sqlite } from '@/lib/db/client'
import { papers, amrGenes, amrMutations } from '@/lib/db/schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_DATA_DIR = path.join(__dirname, 'seed-data')
const GENES_CSV = path.join(SEED_DATA_DIR, 'Full_list_genes_Reslit_harmonized_antib_bact.csv')
const MUTATIONS_CSV = path.join(SEED_DATA_DIR, 'Full_list_mutations_Reslit_antib_bact.csv')
const GENES_OTHER_CSV = path.join(SEED_DATA_DIR, 'Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv')
const MUTATIONS_OTHER_CSV = path.join(SEED_DATA_DIR, 'Full_list_mutations_otherDatabases_clean.csv')

// Canonical source-database names, matching lib/actions/browse.ts's EXTERNAL_DATABASES
const MUTATION_DB_NAME_MAP = {
  AMRFinder: 'Reference Gene Catalog',
  CARD: 'Card Database',
  ResFinder: 'ResFinder Database',
}

function parseCSVFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  return parse(content, { columns: true, skip_empty_lines: true, trim: true })
}

function pipeToArray(value) {
  if (!value || value === '') return null
  return value.split('|').map((v) => v.trim()).filter(Boolean)
}

function parseYear(value) {
  if (!value || value === '') return null
  const n = parseInt(value, 10)
  return isNaN(n) ? null : n
}

function insertInTransaction(table, rows) {
  db.transaction((tx) => {
    for (const row of rows) tx.insert(table).values(row).run()
  })
}

function seedPapers(geneRecordSets, mutationRecordSets) {
  const byPmid = new Map()

  for (const records of geneRecordSets) {
    for (const r of records) {
      const pmid = r.PMID?.trim()
      if (!pmid) continue
      if (!byPmid.has(pmid)) byPmid.set(pmid, {})
      const entry = byPmid.get(pmid)
      entry.title ??= r.Paper_title || null
      entry.year ??= parseYear(r.Publication_year)
      entry.keyFindings ??= r.Key_findings || null
      entry.geographicLocation ??= r.Geographic_location || null
    }
  }

  for (const records of mutationRecordSets) {
    for (const r of records) {
      const pmid = r.PMID?.trim()
      if (!pmid) continue
      if (!byPmid.has(pmid)) byPmid.set(pmid, {})
      const entry = byPmid.get(pmid)
      entry.title ??= r.Paper_title || null
      entry.year ??= parseYear(r.Publication_year)
      entry.keyFindings ??= r.Notes || null
    }
  }

  const rows = [...byPmid.entries()].map(([pmid, v]) => ({
    pmid,
    title: v.title,
    year: v.year,
    keyFindings: v.keyFindings,
    geographicLocation: v.geographicLocation ? [v.geographicLocation] : null,
  }))

  insertInTransaction(papers, rows)
  console.log(`Inserted ${rows.length} papers (derived from ${byPmid.size} unique PMIDs)`)
  return rows.length
}

function seedGenes(records) {
  const rows = records.map((r) => ({
    geneName: r.Gene || '',
    allele: r.Allele || null,
    encodes: r.Encodes || null,
    mechanism: r.Mechanism || null,
    confersResistanceTo: pipeToArray(r.Resistance),
    organismsTestedIn: pipeToArray(r.Organism),
    validationMethod: r.Validation_method || null,
    paperPmid: r.PMID || null,
    pmid: r.PMID || null,
    titlePmid: r.Paper_title || null,
    yearPmid: parseYear(r.Publication_year),
    year: parseYear(r.Publication_year),
    keyFindings: r.Key_findings || null,
    geographicLocation: r.Geographic_location || null,
    sourceDatabase: r.Database || 'Reslit',
    sequenceAccession: r.Sequence_accession || null,
    proteinAccession: r.Protein_accession || null,
    notes: r.Notes || null,
    status: 'pending',
  }))

  insertInTransaction(amrGenes, rows)
  console.log(`Inserted ${rows.length} genes`)
  return rows.length
}

function seedMutations(records, { normalizeDbName = false } = {}) {
  let skipped = 0
  const rows = []
  for (const r of records) {
    const geneName = r.Gene?.trim() || null
    const nucleotideChange = r.Nucleotide_Change?.trim() || null
    const proteinChange = r.Protein_Change?.trim() || null

    if (!geneName && !nucleotideChange && !proteinChange) {
      skipped++
      continue
    }

    const rawDb = r.Database?.trim() || 'Reslit'
    const sourceDatabase = normalizeDbName ? MUTATION_DB_NAME_MAP[rawDb] || rawDb : rawDb

    rows.push({
      geneName,
      nucleotideChange: nucleotideChange || '',
      proteinChange,
      geneEncodes: r.Encodes?.trim() || null,
      geneMechanism: r.Mechanism?.trim() || null,
      paperPmid: r.PMID?.trim() || null,
      pmid: r.PMID?.trim() || null,
      confersResistanceTo: r.Resistance?.trim() ? [r.Resistance.trim()] : null,
      organismsObservedIn: r.Organism?.trim() ? [r.Organism.trim()] : null,
      keyFindings: r.Notes?.trim() || null,
      effectOnFunction: r.Mechanism?.trim() || null,
      validatedBy: r.Validated_by?.trim() || null,
      origin: r.Origin?.trim() || null,
      titlePmid: r.Paper_title?.trim() || null,
      yearPmid: parseYear(r.Publication_year),
      sourceDatabase,
      status: 'pending',
    })
  }

  insertInTransaction(amrMutations, rows)
  console.log(`Inserted ${rows.length} mutations (skipped ${skipped} empty rows)`)
  return rows.length
}

function clearExisting() {
  const genesBefore = db.select().from(amrGenes).all().length
  const mutationsBefore = db.select().from(amrMutations).all().length
  const papersBefore = db.select().from(papers).all().length

  if (genesBefore === 0 && mutationsBefore === 0 && papersBefore === 0) return

  console.log(`Clearing existing data: ${papersBefore} papers, ${genesBefore} genes, ${mutationsBefore} mutations`)
  db.transaction((tx) => {
    tx.delete(amrMutations).run()
    tx.delete(amrGenes).run()
    tx.delete(papers).run()
  })
}

function main() {
  console.log('Seeding SQLite database from pipeline CSV output...')

  clearExisting()

  console.log(`\nReading genes (Reslit): ${GENES_CSV}`)
  const geneRecords = parseCSVFile(GENES_CSV)
  console.log(`Parsed ${geneRecords.length} gene rows`)

  console.log(`\nReading mutations (Reslit): ${MUTATIONS_CSV}`)
  const mutationRecords = parseCSVFile(MUTATIONS_CSV)
  console.log(`Parsed ${mutationRecords.length} mutation rows`)

  console.log(`\nReading genes (other databases): ${GENES_OTHER_CSV}`)
  const geneOtherRecords = parseCSVFile(GENES_OTHER_CSV)
  console.log(`Parsed ${geneOtherRecords.length} gene rows`)

  console.log(`\nReading mutations (other databases): ${MUTATIONS_OTHER_CSV}`)
  const mutationOtherRecords = parseCSVFile(MUTATIONS_OTHER_CSV)
  console.log(`Parsed ${mutationOtherRecords.length} mutation rows`)

  console.log()
  const paperCount = seedPapers([geneRecords, geneOtherRecords], [mutationRecords, mutationOtherRecords])
  const geneCount = seedGenes([...geneRecords, ...geneOtherRecords])
  const mutationCount =
    seedMutations(mutationRecords) + seedMutations(mutationOtherRecords, { normalizeDbName: true })

  console.log(`\nDone. ${paperCount} papers, ${geneCount} genes, ${mutationCount} mutations.`)
  sqlite.close()
}

main()
