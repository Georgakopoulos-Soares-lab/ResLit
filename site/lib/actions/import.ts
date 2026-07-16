'use server'

import { eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { papers, amrGenes, amrMutations } from '@/lib/db/schema'
import { getCurrentCurator } from '@/lib/actions/curator'
import { parseQwen3Text } from '@/lib/utils/parse'
export type { Qwen3GeneData, Qwen3MutationEntry, Qwen3MutationData, Qwen3PaperJson } from '@/lib/utils/parse'

// ------------------------------------------------------------
// Flat import row types (manual CSV/JSON import)
// ------------------------------------------------------------

interface GeneImportRow {
  gene_name: string
  antibiotic?: string // single value; mapped to confers_resistance_to array
  resistance_mechanism_class?: string
  organisms_tested_in?: string // single value; mapped to organisms_tested_in array
  encodes?: string
  mechanism?: string
  validation_method?: string
  role_in_paper?: string
  isolation_location?: string
  isolation_country?: string
  year?: number | string
  pmid?: string
}

interface MutationImportRow {
  gene_name: string // used to link to gene
  mutation_name: string
  position?: number | string
  mutation_type?: string
  wild_type?: string
  mutant?: string
  effect?: string
  nucleotide_change?: string
  origin?: string
  validated_by?: string
  pmid?: string
}

export interface ImportResult {
  success: boolean
  message: string
  imported: number
  errors: string[]
}

export interface Qwen3ImportResult extends ImportResult {
  papersProcessed: number
  genesImported: number
  mutationsImported: number
}

// ------------------------------------------------------------
// importQwen3 – server action
// Upserts papers, genes, and mutations from QWEN3 output text
// ------------------------------------------------------------

export async function importQwen3(text: string): Promise<Qwen3ImportResult> {
  const curator = await getCurrentCurator()
  if (!curator) {
    return {
      success: false,
      message: 'Not authorized',
      imported: 0,
      errors: ['Only curators can import data'],
      papersProcessed: 0,
      genesImported: 0,
      mutationsImported: 0,
    }
  }

  const parsedPapers = parseQwen3Text(text)
  if (parsedPapers.length === 0) {
    return {
      success: false,
      message: 'No valid QWEN3 records found',
      imported: 0,
      errors: ['Could not parse any paper records from input'],
      papersProcessed: 0,
      genesImported: 0,
      mutationsImported: 0,
    }
  }

  const errors: string[] = []
  let papersProcessed = 0
  let genesImported = 0
  let mutationsImported = 0

  const mutationNotationRegex = /^([A-Za-z*]+)(\d+)([A-Za-z*]+)$/

  for (const paper of parsedPapers) {
    const pmid = paper.pmid?.trim() || null

    // 1. Upsert into papers table (if we have a pmid)
    if (pmid) {
      try {
        await db
          .insert(papers)
          .values({
            pmid,
            title: paper.title || null,
            year: paper.year ?? null,
            paperType: paper.paper_type || null,
            keyFindings: paper.key_findings || null,
            methodology: paper.methodology || null,
            geographicLocation: paper.geographic_location || null,
            sampleSize: paper.sample_size ?? null,
          })
          .onConflictDoUpdate({
            target: papers.pmid,
            set: {
              title: paper.title || null,
              year: paper.year ?? null,
              paperType: paper.paper_type || null,
              keyFindings: paper.key_findings || null,
              methodology: paper.methodology || null,
              geographicLocation: paper.geographic_location || null,
              sampleSize: paper.sample_size ?? null,
            },
          })
        papersProcessed++
      } catch (err) {
        errors.push(`Paper ${pmid}: ${err instanceof Error ? err.message : 'insert failed'}`)
      }
    }

    // 2. Insert genes
    const geneEntries = Object.entries(paper.genes || {})
    const geneIdMap = new Map<string, number>() // gene_name → inserted id

    for (const [geneName, geneData] of geneEntries) {
      try {
        const [insertedGene] = await db
          .insert(amrGenes)
          .values({
            geneName: geneName.trim(),
            allele: geneData.allele || null,
            encodes: geneData.encodes || null,
            mechanism: geneData.mechanism || null,
            resistanceMechanismClass: geneData.resistance_mechanism_class || null,
            confersResistanceTo: geneData.confers_resistance_to || null,
            organismsTestedIn: geneData.organisms_tested_in || null,
            roleInPaper: geneData.role_in_paper || null,
            validationMethod: geneData.validation_method || null,
            paperPmid: pmid,
            pmid,
            status: 'pending',
          })
          .returning({ id: amrGenes.id })

        genesImported++
        geneIdMap.set(geneName, insertedGene.id)
      } catch (err) {
        errors.push(`Gene "${geneName}" (paper ${pmid || 'unknown'}): ${err instanceof Error ? err.message : 'insert failed'}`)
      }
    }

    // 3. Insert mutations linked to gene IDs
    const mutationEntries = Object.entries(paper.mutations || {})

    for (const [geneName, mutationData] of mutationEntries) {
      let resolvedGeneId = geneIdMap.get(geneName) ?? null

      // If the gene wasn't just inserted, try to find it in the DB
      if (!resolvedGeneId && geneName) {
        const [existingGene] = await db
          .select({ id: amrGenes.id })
          .from(amrGenes)
          .where(eq(amrGenes.geneName, geneName.trim()))
          .orderBy(desc(amrGenes.createdAt))
          .limit(1)
        resolvedGeneId = existingGene?.id ?? null
      }

      const mutationsFound = mutationData.mutations_found || []

      for (const mut of mutationsFound) {
        const notation = mut.notation || mut.protein_change || ''

        // Parse notation into wild_type / position / mutant
        let wildType: string | null = null
        let position: number | null = null
        let mutant: string | null = null

        const match = mutationNotationRegex.exec(notation)
        if (match) {
          wildType = match[1]
          position = parseInt(match[2], 10)
          mutant = match[3]
        }

        const validMutationTypes = ['substitution', 'insertion', 'deletion', 'frameshift', 'other'] as const
        let mutationType = mut.mutation_type?.toLowerCase().trim() || null
        if (mutationType && !validMutationTypes.includes(mutationType as (typeof validMutationTypes)[number])) {
          mutationType = 'other'
        }

        try {
          await db.insert(amrMutations).values({
            geneId: resolvedGeneId,
            geneName,
            mutationName: notation || `mutation_${mutationsImported + 1}`,
            position,
            mutationType: mutationType as (typeof validMutationTypes)[number] | null,
            wildType,
            mutant,
            effect: mut.effect_on_function || null,
            nucleotideChange: mut.nucleotide_change || null,
            proteinChange: mut.protein_change || null,
            confersResistanceTo: mut.confers_resistance_to || null,
            organismsObservedIn: mut.organisms_observed_in || null,
            validatedBy: mut.validated_by || null,
            origin: mut.origin || null,
            pmid,
            status: 'pending',
          })
          mutationsImported++
        } catch (err) {
          errors.push(
            `Mutation "${notation}" for gene "${geneName}" (paper ${pmid || 'unknown'}): ${err instanceof Error ? err.message : 'insert failed'}`
          )
        }
      }
    }
  }

  revalidatePath('/browse/genes')
  revalidatePath('/browse/mutations')
  revalidatePath('/curator/dashboard')

  const totalImported = genesImported + mutationsImported
  return {
    success: totalImported > 0 || papersProcessed > 0,
    message: `Processed ${papersProcessed} papers, imported ${genesImported} genes and ${mutationsImported} mutations`,
    imported: totalImported,
    errors,
    papersProcessed,
    genesImported,
    mutationsImported,
  }
}

// ------------------------------------------------------------
// importGenes – flat manual import (CSV/JSON)
// Maps single antibiotic/organism values to new array columns
// ------------------------------------------------------------

export async function importGenes(data: GeneImportRow[]): Promise<ImportResult> {
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, message: 'Not authorized', imported: 0, errors: ['Only curators can import data'] }
  }

  const errors: string[] = []
  let imported = 0

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    if (!row.gene_name || row.gene_name.trim() === '') {
      errors.push(`Row ${i + 1}: gene_name is required`)
      continue
    }

    let year: number | null = null
    if (row.year) {
      year = typeof row.year === 'string' ? parseInt(row.year, 10) : row.year
      if (isNaN(year)) year = null
    }

    const confersResistanceTo = row.antibiotic?.trim() ? [row.antibiotic.trim()] : null
    const organismsTestedIn = row.organisms_tested_in?.trim() ? [row.organisms_tested_in.trim()] : null

    try {
      await db.insert(amrGenes).values({
        geneName: row.gene_name.trim(),
        encodes: row.encodes?.trim() || null,
        mechanism: row.mechanism?.trim() || null,
        resistanceMechanismClass: row.resistance_mechanism_class?.trim() || null,
        confersResistanceTo,
        organismsTestedIn,
        roleInPaper: row.role_in_paper?.trim() || null,
        validationMethod: row.validation_method?.trim() || null,
        isolationLocation: row.isolation_location?.trim() || null,
        isolationCountry: row.isolation_country?.trim() || null,
        year,
        pmid: row.pmid?.trim() || null,
        status: 'pending',
      })
      imported++
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'insert failed'}`)
    }
  }

  revalidatePath('/browse/genes')
  revalidatePath('/curator/dashboard')

  return { success: imported > 0, message: `Imported ${imported} of ${data.length} genes`, imported, errors }
}

// ------------------------------------------------------------
// importMutations – flat manual import (CSV/JSON)
// ------------------------------------------------------------

export async function importMutations(data: MutationImportRow[]): Promise<ImportResult> {
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, message: 'Not authorized', imported: 0, errors: ['Only curators can import data'] }
  }

  // Get all gene names and IDs for linking
  const genes = await db.select({ id: amrGenes.id, geneName: amrGenes.geneName }).from(amrGenes)
  const geneMap = new Map<string, number>()
  genes.forEach((g) => {
    if (g.geneName) geneMap.set(g.geneName.toLowerCase(), g.id)
  })

  const errors: string[] = []
  let imported = 0

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    if (!row.mutation_name || row.mutation_name.trim() === '') {
      errors.push(`Row ${i + 1}: mutation_name is required`)
      continue
    }

    if (!row.gene_name || row.gene_name.trim() === '') {
      errors.push(`Row ${i + 1}: gene_name is required to link mutation`)
      continue
    }

    const geneId = geneMap.get(row.gene_name.toLowerCase().trim())
    if (!geneId) {
      errors.push(`Row ${i + 1}: Gene "${row.gene_name}" not found in database`)
      continue
    }

    let position: number | null = null
    if (row.position) {
      position = typeof row.position === 'string' ? parseInt(row.position, 10) : row.position
      if (isNaN(position)) position = null
    }

    const validTypes = ['substitution', 'insertion', 'deletion', 'frameshift', 'other'] as const
    let mutationType = row.mutation_type?.toLowerCase().trim() || null
    if (mutationType && !validTypes.includes(mutationType as (typeof validTypes)[number])) {
      mutationType = 'other'
    }

    try {
      await db.insert(amrMutations).values({
        geneId,
        mutationName: row.mutation_name.trim(),
        position,
        mutationType: mutationType as (typeof validTypes)[number] | null,
        wildType: row.wild_type?.trim() || null,
        mutant: row.mutant?.trim() || null,
        effect: row.effect?.trim() || null,
        nucleotideChange: row.nucleotide_change?.trim() || null,
        validatedBy: row.validated_by?.trim() || null,
        origin: row.origin?.trim() || null,
        pmid: row.pmid?.trim() || null,
        status: 'pending',
      })
      imported++
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'insert failed'}`)
    }
  }

  revalidatePath('/browse/mutations')
  revalidatePath('/curator/dashboard')

  return { success: imported > 0, message: `Imported ${imported} of ${data.length} mutations`, imported, errors }
}
