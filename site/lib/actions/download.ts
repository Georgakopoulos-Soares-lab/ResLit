'use server'

import { eq, and, or, like, gte, lte, isNull, isNotNull, inArray, asc, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { amrGenes, amrMutations, curationHistory, comments } from '@/lib/db/schema'
import { jsonContains, toSnakeCase, chunk, alnumLike } from '@/lib/db/helpers'
import { getValidationTiers, getMutationValidationTiers, getGroupedMutationTierCounts } from '@/lib/actions/browse'
import type { AMRGene, AMRMutation, BrowseFilters } from '@/lib/types'

interface GeneEnrichment {
  pmidsByGene: Map<string, Set<string>>
  validatorByGeneId: Map<string, string>
  commentsByGeneId: Map<string, string[]>
}

function genesToCSV(genes: AMRGene[], enrichment: GeneEnrichment): string {
  const headers = [
    'Gene Name',
    'Allele',
    'Encodes',
    'Source Database',
    'Resistance Mechanism Class',
    'Mechanism',
    'Confers Resistance To',
    'Organisms Tested In',
    'Validation Method',
    'Role in Paper',
    'Geographic Location',
    'Isolation Country',
    'Isolation Location',
    'Year',
    'PMID',
    'Paper Title',
    'Key Findings',
    'Sequence Accession',
    'Protein Accession',
    'Notes',
  ]

  const rows = genes.map((gene) => {
    return [
      gene.gene_name,
      gene.allele || '',
      gene.encodes || '',
      gene.source_database || '',
      gene.resistance_mechanism_class || '',
      (gene.mechanism || '').replace(/"/g, '""'),
      (gene.confers_resistance_to || []).join('; '),
      (gene.organisms_tested_in || []).join('; '),
      (gene.validation_method || '').replace(/"/g, '""'),
      gene.role_in_paper || '',
      gene.geographic_location || '',
      gene.isolation_country || '',
      gene.isolation_location || '',
      gene.year_pmid?.toString() || gene.year?.toString() || '',
      gene.paper_pmid || '',
      (gene.title_pmid || '').replace(/"/g, '""'),
      (gene.key_findings || '').replace(/"/g, '""'),
      gene.sequence_accession || '',
      gene.protein_accession || '',
      (gene.notes || '').replace(/"/g, '""'),
    ]
  })

  const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n')

  return csvContent
}

/** Runs one query per chunk (staying under SQLite's bound-parameter limit for
 * potentially huge `IN` lists — e.g. "download all genes") and concatenates. */
async function queryInChunks<T, R>(items: T[], queryFn: (items: T[]) => Promise<R[]>): Promise<R[]> {
  const results: R[] = []
  for (const c of chunk(items)) {
    results.push(...(await queryFn(c)))
  }
  return results
}

async function fetchGeneEnrichment(genes: AMRGene[]): Promise<GeneEnrichment> {
  if (genes.length === 0) {
    return { pmidsByGene: new Map(), validatorByGeneId: new Map(), commentsByGeneId: new Map() }
  }

  const geneNames = [...new Set(genes.map((g) => g.gene_name))]
  const geneIds = genes.map((g) => String(g.id))

  const [pmidsRows, curationRows, commentsRows] = await Promise.all([
    queryInChunks(geneNames, (c) =>
      db
        .select({ geneName: amrGenes.geneName, paperPmid: amrGenes.paperPmid })
        .from(amrGenes)
        .where(and(inArray(amrGenes.geneName, c), isNotNull(amrGenes.paperPmid)))
    ),
    queryInChunks(geneIds, (c) =>
      db
        .select({
          targetId: curationHistory.targetId,
          curatorName: curationHistory.curatorName,
          curatorEmail: curationHistory.curatorEmail,
          createdAt: curationHistory.createdAt,
        })
        .from(curationHistory)
        .where(and(inArray(curationHistory.targetId, c), eq(curationHistory.action, 'approve')))
    ),
    queryInChunks(geneIds, (c) =>
      db
        .select({ targetId: comments.targetId, content: comments.content })
        .from(comments)
        .where(and(eq(comments.targetType, 'gene'), inArray(comments.targetId, c)))
    ),
  ])

  const pmidsByGene = new Map<string, Set<string>>()
  for (const row of pmidsRows) {
    if (!row.geneName || !row.paperPmid) continue
    if (!pmidsByGene.has(row.geneName)) pmidsByGene.set(row.geneName, new Set())
    pmidsByGene.get(row.geneName)!.add(row.paperPmid)
  }

  // Sort across all chunks (not just within each) so "most recent approval
  // wins" holds globally, not just per-chunk.
  curationRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const validatorByGeneId = new Map<string, string>()
  for (const row of curationRows) {
    if (!validatorByGeneId.has(row.targetId)) {
      validatorByGeneId.set(row.targetId, row.curatorName || row.curatorEmail || '')
    }
  }

  const commentsByGeneId = new Map<string, string[]>()
  for (const row of commentsRows) {
    if (!commentsByGeneId.has(row.targetId)) commentsByGeneId.set(row.targetId, [])
    commentsByGeneId.get(row.targetId)!.push(row.content)
  }

  return { pmidsByGene, validatorByGeneId, commentsByGeneId }
}

interface MutationEnrichment {
  pmidsByGene: Map<string, Set<string>>
  validatorByMutationId: Map<string, string>
  commentsByMutationId: Map<string, string[]>
}

function mutationsToCSV(mutations: AMRMutation[], enrichment: MutationEnrichment): string {
  const headers = [
    'Mutation Name',
    'Gene Name',
    'Position',
    'Mutation Type',
    'Wild Type',
    'Mutant',
    'Nucleotide Change',
    'Protein Change',
    'Confers Resistance To',
    'Organisms Observed In',
    'Effect',
    'Origin',
    'Validated By',
    'Country',
    'Year',
    'PMID',
    'Status',
    'Validated',
    'Validated From',
    'Comments',
  ]

  const rows = mutations.map((mutation) => {
    const id = String(mutation.id)
    const allPmids = [...(enrichment.pmidsByGene.get(mutation.gene_name) ?? [])].join('; ')
    const validator = enrichment.validatorByMutationId.get(id) ?? ''
    const comments = (enrichment.commentsByMutationId.get(id) ?? []).map((c) => c.replace(/"/g, '""')).join(' | ')
    const isValidated = mutation.status === 'curated'

    return [
      mutation.notation || mutation.mutation_name || mutation.nucleotide_change || '',
      mutation.gene_name || '',
      mutation.position_in_molecule || '',
      mutation.mutation_type || '',
      mutation.wild_type || '',
      mutation.mutant || '',
      mutation.nucleotide_change || '',
      mutation.protein_change || '',
      (mutation.confers_resistance_to || []).join('; '),
      (mutation.organisms_observed_in || []).join('; '),
      (mutation.effect_on_function || '').replace(/"/g, '""'),
      mutation.origin || '',
      mutation.validated_by || '',
      mutation.country || '',
      mutation.year_pmid?.toString() || '',
      allPmids,
      'Reslit',
      isValidated ? 'Validated' : 'No',
      validator,
      comments,
    ]
  })

  const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n')

  return csvContent
}

async function fetchMutationEnrichment(mutations: AMRMutation[]): Promise<MutationEnrichment> {
  if (mutations.length === 0) {
    return { pmidsByGene: new Map(), validatorByMutationId: new Map(), commentsByMutationId: new Map() }
  }

  const geneNames = [...new Set(mutations.map((m) => m.gene_name).filter(Boolean))]
  const mutationIds = mutations.map((m) => String(m.id))

  const [pmidsRows, curationRows, commentsRows] = await Promise.all([
    queryInChunks(geneNames, (c) =>
      db
        .select({ geneName: amrMutations.geneName, paperPmid: amrMutations.paperPmid })
        .from(amrMutations)
        .where(and(inArray(amrMutations.geneName, c), isNotNull(amrMutations.paperPmid)))
    ),
    queryInChunks(mutationIds, (c) =>
      db
        .select({
          targetId: curationHistory.targetId,
          curatorName: curationHistory.curatorName,
          curatorEmail: curationHistory.curatorEmail,
          createdAt: curationHistory.createdAt,
        })
        .from(curationHistory)
        .where(and(inArray(curationHistory.targetId, c), eq(curationHistory.action, 'approve')))
    ),
    queryInChunks(mutationIds, (c) =>
      db
        .select({ targetId: comments.targetId, content: comments.content })
        .from(comments)
        .where(and(eq(comments.targetType, 'mutation'), inArray(comments.targetId, c)))
    ),
  ])

  const pmidsByGene = new Map<string, Set<string>>()
  for (const row of pmidsRows) {
    if (!row.geneName || !row.paperPmid) continue
    if (!pmidsByGene.has(row.geneName)) pmidsByGene.set(row.geneName, new Set())
    pmidsByGene.get(row.geneName)!.add(row.paperPmid)
  }

  curationRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const validatorByMutationId = new Map<string, string>()
  for (const row of curationRows) {
    if (!validatorByMutationId.has(row.targetId)) {
      validatorByMutationId.set(row.targetId, row.curatorName || row.curatorEmail || '')
    }
  }

  const commentsByMutationId = new Map<string, string[]>()
  for (const row of commentsRows) {
    if (!commentsByMutationId.has(row.targetId)) commentsByMutationId.set(row.targetId, [])
    commentsByMutationId.get(row.targetId)!.push(row.content)
  }

  return { pmidsByGene, validatorByMutationId, commentsByMutationId }
}

export async function downloadGenesByValidation(tier: string): Promise<{ csv: string; count: number }> {
  const tiers = await getValidationTiers()

  const matchingGeneNames = [...tiers.entries()].filter(([, info]) => info.tier === tier).map(([name]) => name)

  if (matchingGeneNames.length === 0) return { csv: '', count: 0 }

  const rows = await queryInChunks(matchingGeneNames, (c) => db.select().from(amrGenes).where(inArray(amrGenes.geneName, c)))
  const allGenes = (rows.map((r) => toSnakeCase(r)) as unknown as AMRGene[]).sort((a, b) => a.gene_name.localeCompare(b.gene_name))

  const enrichment = await fetchGeneEnrichment(allGenes)
  return { csv: genesToCSV(allGenes, enrichment), count: allGenes.length }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function downloadAllGenes(curatedOnly: boolean = false): Promise<{ csv: string; count: number }> {
  const rows = await db.select().from(amrGenes).orderBy(asc(amrGenes.geneName))
  const genes = rows.map((r) => toSnakeCase(r)) as unknown as AMRGene[]
  const enrichment = await fetchGeneEnrichment(genes)

  return { csv: genesToCSV(genes, enrichment), count: genes.length }
}

export async function downloadMutationsByValidation(tier: string): Promise<{ csv: string; count: number }> {
  const mutTiers = await getMutationValidationTiers()

  const matchingIds = [...mutTiers.entries()].filter(([, info]) => info.tier === tier).map(([id]) => Number(id))

  if (matchingIds.length === 0) return { csv: '', count: 0 }

  const rows = await queryInChunks(matchingIds, (c) => db.select().from(amrMutations).where(inArray(amrMutations.id, c)))
  const allMutations = (rows.map((r) => toSnakeCase(r)) as unknown as AMRMutation[]).sort((a, b) =>
    (a.nucleotide_change || '').localeCompare(b.nucleotide_change || '')
  )

  const enrichment = await fetchMutationEnrichment(allMutations)
  return { csv: mutationsToCSV(allMutations, enrichment), count: allMutations.length }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function downloadAllMutations(curatedOnly: boolean = false): Promise<{ csv: string; count: number }> {
  const rows = await db.select().from(amrMutations).orderBy(asc(amrMutations.nucleotideChange))
  const mutations = rows.map((r) => toSnakeCase(r)) as unknown as AMRMutation[]
  const enrichment = await fetchMutationEnrichment(mutations)

  return { csv: mutationsToCSV(mutations, enrichment), count: mutations.length }
}

export async function downloadFilteredGenes(filters: BrowseFilters): Promise<{ csv: string; count: number }> {
  const conditions = []

  if (filters.curatedOnly) conditions.push(eq(amrGenes.status, 'curated'))
  if (filters.search) {
    const p = `%${filters.search}%`
    conditions.push(or(alnumLike(amrGenes.geneName, filters.search), alnumLike(amrGenes.allele, filters.search), like(amrGenes.mechanism, p), like(amrGenes.encodes, p)))
  }
  if (filters.mechanismClass) conditions.push(eq(amrGenes.resistanceMechanismClass, filters.mechanismClass))
  if (filters.antibiotic) conditions.push(jsonContains(amrGenes.confersResistanceTo, filters.antibiotic))
  if (filters.organism) conditions.push(jsonContains(amrGenes.organismsTestedIn, filters.organism))
  if (filters.country) {
    conditions.push(filters.country === '__missing__' ? isNull(amrGenes.geographicLocation) : eq(amrGenes.geographicLocation, filters.country))
  }
  if (filters.yearFrom) conditions.push(gte(amrGenes.year, filters.yearFrom))
  if (filters.yearTo) conditions.push(lte(amrGenes.year, filters.yearTo))

  try {
    const rows = await db
      .select()
      .from(amrGenes)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(amrGenes.geneName))

    const genes = rows.map((r) => toSnakeCase(r)) as unknown as AMRGene[]
    const enrichment = await fetchGeneEnrichment(genes)

    return { csv: genesToCSV(genes, enrichment), count: genes.length }
  } catch (error) {
    console.error('Error fetching filtered genes for download:', error)
    return { csv: '', count: 0 }
  }
}

export async function downloadFilteredMutations(filters: BrowseFilters): Promise<{ csv: string; count: number }> {
  const conditions = []

  if (filters.curatedOnly) conditions.push(eq(amrMutations.status, 'curated'))
  if (filters.search) {
    const p = `%${filters.search}%`
    conditions.push(
      or(
        alnumLike(amrMutations.nucleotideChange, filters.search),
        alnumLike(amrMutations.geneName, filters.search),
        alnumLike(amrMutations.proteinChange, filters.search),
        like(amrMutations.effectOnFunction, p),
        like(amrMutations.paperPmid, p)
      )
    )
  }
  if (filters.geneName) conditions.push(eq(amrMutations.geneName, filters.geneName))
  if (filters.mechanismClass) conditions.push(eq(amrMutations.resistanceMechanismClass, filters.mechanismClass))
  if (filters.antibiotic) conditions.push(jsonContains(amrMutations.confersResistanceTo, filters.antibiotic))
  if (filters.organism) conditions.push(jsonContains(amrMutations.organismsObservedIn, filters.organism))
  if (filters.country) {
    conditions.push(filters.country === '__missing__' ? isNull(amrMutations.country) : eq(amrMutations.country, filters.country))
  }

  try {
    const rows = await db
      .select()
      .from(amrMutations)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(amrMutations.nucleotideChange))

    const mutations = rows.map((r) => toSnakeCase(r)) as unknown as AMRMutation[]
    const enrichment = await fetchMutationEnrichment(mutations)

    return { csv: mutationsToCSV(mutations, enrichment), count: mutations.length }
  } catch (error) {
    console.error('Error fetching filtered mutations for download:', error)
    return { csv: '', count: 0 }
  }
}

// Get download statistics — uses same grouped logic as home page
export async function getDownloadStats(): Promise<{
  totalGenes: number
  totalMutations: number
  confirmedMutations: number
  tierCounts: { Confirmed: number; Established: number; Supported: number; Candidate: number }
}> {
  const [tiers, mutGrouped] = await Promise.all([getValidationTiers(), getGroupedMutationTierCounts()])

  const tierCounts = { Confirmed: 0, Established: 0, Supported: 0, Candidate: 0 }
  for (const info of tiers.values()) {
    tierCounts[info.tier]++
  }

  return {
    totalGenes: tiers.size,
    totalMutations: mutGrouped.total,
    confirmedMutations: mutGrouped.tierCounts.Confirmed || 0,
    tierCounts,
  }
}
