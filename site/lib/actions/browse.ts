'use server'

import { createClient } from '@/lib/supabase/server'
import { getCachedValidationTiers, getCachedMutationValidationTiers, getCachedFilterOptions } from '@/lib/browse-cache'
import type { AMRGene, AMRMutation, FilterOptions, BrowseFilters, PaginatedResult, GeneWithMutationCount, CurationStatus, PaperEntry, ValidationTier, ValidationInfo, ConfirmationReason } from '@/lib/types'

const PAGE_SIZE = 10

const EXTERNAL_DATABASES = ['Card Database', 'ResFinder Database', 'Reference Gene Catalog', 'ResFinder', 'CARD', 'Card']

export async function getValidationTiers(): Promise<Map<string, ValidationInfo>> {
  const cached = await getCachedValidationTiers()
  return new Map(Object.entries(cached))
}

export async function getMutationValidationTiers(): Promise<Map<string, ValidationInfo>> {
  const cached = await getCachedMutationValidationTiers()
  return new Map(Object.entries(cached))
}

export async function getGroupedMutationTierCounts(supabaseClient?: Awaited<ReturnType<typeof createClient>>): Promise<{ total: number; tierCounts: Record<string, number> }> {
  const supabase = supabaseClient ?? await createClient()
  const mutTiers = await getMutationValidationTiers()

  const allRows: { id: string; gene_name: string; protein_change: string | null; nucleotide_change: string | null }[] = []
  const batchSize = 1000
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('amr_mutations')
      .select('id, gene_name, protein_change, nucleotide_change')
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < batchSize) break
    offset += batchSize
  }

  const tierPri: Record<string, number> = { Confirmed: 0, Established: 1, Supported: 2, Candidate: 3 }
  const groups = new Map<string, ValidationTier>()
  for (const r of allRows) {
    const key = mutationGroupKey(r)
    const tier = mutTiers.get(r.id)?.tier ?? 'Candidate'
    const existing = groups.get(key)
    if (!existing || (tierPri[tier] ?? 99) < (tierPri[existing] ?? 99)) {
      groups.set(key, tier)
    }
  }

  const tierCounts: Record<string, number> = { Confirmed: 0, Established: 0, Supported: 0, Candidate: 0 }
  for (const tier of groups.values()) {
    tierCounts[tier]++
  }

  return { total: groups.size, tierCounts }
}

export async function getFilterOptions(): Promise<FilterOptions> {
  return getCachedFilterOptions()
}

export async function browseGenes(
  filters: BrowseFilters,
  page: number = 1
): Promise<PaginatedResult<AMRGene>> {
  const supabase = await createClient()

  const tiers = await getValidationTiers()

  // If filtering by validation tier, resolve matching gene names first
  if (filters.validationTier) {
    const matchingGenes = [...tiers.entries()]
      .filter(([, info]) => info.tier === filters.validationTier)
      .map(([g]) => g)
    if (matchingGenes.length === 0) {
      return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    // Supabase .in() has a practical limit; chunk if needed
  }

  function buildQuery() {
    let q = supabase
      .from('amr_genes')
      .select('*')

    if (filters.search) {
      q = q.or(
        `gene_name.ilike.%${filters.search}%,allele.ilike.%${filters.search}%,mechanism.ilike.%${filters.search}%,encodes.ilike.%${filters.search}%`
      )
    }

    if (filters.geneNameSearch) {
      q = q.ilike('gene_name', `%${filters.geneNameSearch}%`)
    }

    if (filters.alleleSearch) {
      q = q.ilike('allele', `%${filters.alleleSearch}%`)
    }

    if (filters.pmid) {
      q = q.eq('paper_pmid', filters.pmid)
    }

    if (filters.validationTier) {
      const matchingGenes = [...tiers.entries()]
        .filter(([, info]) => info.tier === filters.validationTier)
        .map(([g]) => g)
      q = q.in('gene_name', matchingGenes)
    }

    if (filters.mechanismClass) {
      q = q.eq('mechanism', filters.mechanismClass)
    }

    if (filters.antibiotic) {
      q = q.contains('confers_resistance_to', [filters.antibiotic])
    }

    if (filters.encodes) {
      q = q.eq('encodes', filters.encodes)
    }

    if (filters.organism) {
      q = q.contains('organisms_tested_in', [filters.organism])
    }

    if (filters.country) {
      if (filters.country === '__missing__') {
        q = q.is('geographic_location', null)
      } else {
        q = q.eq('geographic_location', filters.country)
      }
    }

    if (filters.yearFrom) {
      q = q.gte('year', filters.yearFrom)
    }

    if (filters.yearTo) {
      q = q.lte('year', filters.yearTo)
    }

    if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
      const orConditions = filters.sourceDatabases
        .map((db) => `source_database.eq.${db}`)
        .join(',')
      q = q.or(orConditions)
    }

    if (filters.curatedOnly) {
      q = q.eq('gene_status', 'curated')
    }

    return q.order('gene_name', { ascending: true })
  }

  // Step 1: Fetch only gene_name column (lightweight) to determine unique names and total count
  function buildNameQuery() {
    let q = supabase.from('amr_genes').select('gene_name')
    if (filters.search) {
      q = q.or(
        `gene_name.ilike.%${filters.search}%,allele.ilike.%${filters.search}%,mechanism.ilike.%${filters.search}%,encodes.ilike.%${filters.search}%`
      )
    }
    if (filters.geneNameSearch) q = q.ilike('gene_name', `%${filters.geneNameSearch}%`)
    if (filters.alleleSearch) q = q.ilike('allele', `%${filters.alleleSearch}%`)
    if (filters.pmid) q = q.eq('paper_pmid', filters.pmid)
    if (filters.validationTier) {
      const matchingGenes = [...tiers.entries()]
        .filter(([, info]) => info.tier === filters.validationTier)
        .map(([g]) => g)
      q = q.in('gene_name', matchingGenes)
    }
    if (filters.mechanismClass) q = q.eq('mechanism', filters.mechanismClass)
    if (filters.antibiotic) q = q.contains('confers_resistance_to', [filters.antibiotic])
    if (filters.encodes) q = q.eq('encodes', filters.encodes)
    if (filters.organism) q = q.contains('organisms_tested_in', [filters.organism])
    if (filters.country) {
      if (filters.country === '__missing__') q = q.is('geographic_location', null)
      else q = q.eq('geographic_location', filters.country)
    }
    if (filters.yearFrom) q = q.gte('year', filters.yearFrom)
    if (filters.yearTo) q = q.lte('year', filters.yearTo)
    if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
      q = q.or(filters.sourceDatabases.map((db) => `source_database.eq.${db}`).join(','))
    }
    if (filters.curatedOnly) q = q.eq('gene_status', 'curated')
    return q.order('gene_name', { ascending: true })
  }

  const allNames: string[] = []
  let offset = 0
  const BATCH = 1000
  while (true) {
    const { data, error } = await buildNameQuery().range(offset, offset + BATCH - 1)
    if (error) {
      console.error('Error fetching gene names:', error.message, error.details)
      return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    if (!data || data.length === 0) break
    for (const r of data) if (r.gene_name) allNames.push(r.gene_name)
    if (data.length < BATCH) break
    offset += BATCH
  }

  const uniqueNames = [...new Set(allNames)].sort()
  const total = uniqueNames.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pagedNames = uniqueNames.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (pagedNames.length === 0) {
    return { data: [], total, page, pageSize: PAGE_SIZE, totalPages }
  }

  // Step 2: Fetch full data only for the genes on the current page
  const { data: pageData, error: pageError } = await buildQuery()
    .in('gene_name', pagedNames)

  if (pageError || !pageData) {
    return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
  }

  const enriched = pageData.map((row) => ({
    ...row,
    validation_tier: (tiers.get(row.gene_name)?.tier ?? 'Candidate') as ValidationTier,
  }))

  enriched.sort((a, b) => a.gene_name.localeCompare(b.gene_name))

  return {
    data: enriched,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
  }
}

function mutationGroupKey(m: { gene_name: string; protein_change: string | null; nucleotide_change: string | null; id?: string }): string {
  if (m.protein_change) return `${m.gene_name}::p::${m.protein_change}`
  if (m.nucleotide_change) return `${m.gene_name}::n::${m.nucleotide_change}`
  return `${m.gene_name}::id::${m.id ?? ''}`
}

export async function browseMutations(
  filters: BrowseFilters,
  page: number = 1
): Promise<PaginatedResult<AMRMutation>> {
  const supabase = await createClient()

  const mutTiers = await getMutationValidationTiers()

  // Build the base query with all filters (no pagination yet)
  function buildQuery(selectClause: string) {
    let q = supabase.from('amr_mutations').select(selectClause)

    if (filters.pmid) q = q.eq('paper_pmid', filters.pmid)
    if (filters.search) {
      q = q.or(
        `nucleotide_change.ilike.%${filters.search}%,gene_name.ilike.%${filters.search}%,protein_change.ilike.%${filters.search}%,effect_on_function.ilike.%${filters.search}%,paper_pmid.ilike.%${filters.search}%,title_pmid.ilike.%${filters.search}%`
      )
    }
    if (filters.geneName) q = q.eq('gene_name', filters.geneName)
    if (filters.antibiotic) q = q.contains('confers_resistance_to', [filters.antibiotic])
    if (filters.mutationType) q = q.eq('mutation_type', filters.mutationType)
    if (filters.country) {
      if (filters.country === '__missing__') q = q.is('country', null)
      else q = q.eq('country', filters.country)
    }
    if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
      q = q.or(filters.sourceDatabases.map((db) => `source_database.eq.${db}`).join(','))
    }
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    else if (filters.curatedOnly) q = q.eq('status', 'curated')

    return q
  }

  // Fetch all matching mutation identities for grouping
  const allIdentities: { id: string; gene_name: string; protein_change: string | null; nucleotide_change: string | null }[] = []
  const batchSize = 1000
  let offset = 0
  while (true) {
    const q = buildQuery('id, gene_name, protein_change, nucleotide_change')
      .order('gene_name', { ascending: true })
      .range(offset, offset + batchSize - 1)
    const { data } = await q
    if (!data || data.length === 0) break
    allIdentities.push(...data)
    if (data.length < batchSize) break
    offset += batchSize
  }

  // Filter by validation tier if needed
  let filtered = allIdentities
  if (filters.validationTier) {
    filtered = allIdentities.filter((m) => (mutTiers.get(m.id)?.tier ?? 'Candidate') === filters.validationTier)
  }

  // Group by mutation identity (gene + protein_change, or gene + nucleotide_change)
  const groups = new Map<string, string[]>()
  for (const m of filtered) {
    const key = mutationGroupKey(m)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m.id)
  }

  const groupKeys = [...groups.keys()].sort()
  const total = groupKeys.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pagedKeys = groupKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (pagedKeys.length === 0) {
    return { data: [], total, page, pageSize: PAGE_SIZE, totalPages }
  }

  // Collect all IDs for the current page's groups
  const pagedIds = pagedKeys.flatMap((k) => groups.get(k)!)

  // Fetch full mutation data for these IDs
  const allData: AMRMutation[] = []
  const ID_BATCH = 50
  for (let i = 0; i < pagedIds.length; i += ID_BATCH) {
    const batch = pagedIds.slice(i, i + ID_BATCH)
    const { data } = await supabase.from('amr_mutations').select('*').in('id', batch)
    if (data) allData.push(...data)
  }

  const enriched = allData.map((m) => ({
    ...m,
    validation_tier: (mutTiers.get(m.id)?.tier ?? 'Candidate') as ValidationTier,
    all_databases: mutTiers.get(m.id)?.databases ?? [m.source_database].filter(Boolean),
  }))

  // Sort to maintain stable order within the page
  enriched.sort((a, b) => {
    const ka = mutationGroupKey(a)
    const kb = mutationGroupKey(b)
    return ka.localeCompare(kb)
  })

  return {
    data: enriched,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
  }
}

export async function getGeneById(id: string): Promise<AMRGene | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amr_genes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching gene:', error)
    return null
  }

  return data
}

export async function getGeneAllPapers(geneName: string): Promise<AMRGene[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amr_genes')
    .select('*')
    .eq('gene_name', geneName)
    .order('paper_pmid', { ascending: true })

  if (error) {
    console.error('Error fetching gene papers:', error)
    return []
  }

  return data || []
}

export async function getMutationById(id: string): Promise<AMRMutation | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amr_mutations')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching mutation:', error)
    return null
  }

  return data
}

export async function getGeneFamilyData(family: string): Promise<AMRGene[]> {
  const supabase = await createClient()

  const [{ data: byPattern }, { data: byExact }] = await Promise.all([
    // Model 1: gene_name = "blaADC-30" (allele encoded in gene_name)
    supabase
      .from('amr_genes')
      .select('*')
      .like('gene_name', `${family}-%`)
      .order('gene_name', { ascending: true }),
    // Model 2: gene_name = "blaADC", allele = "blaADC-30"
    supabase
      .from('amr_genes')
      .select('*')
      .eq('gene_name', family)
      .order('allele', { ascending: true }),
  ])

  const patternRows = (byPattern || []).filter((g) => /^.+-\d+$/.test(g.gene_name))
  const exactRows = byExact || []

  const seen = new Set<string>()
  return [...patternRows, ...exactRows].filter((g) => {
    if (seen.has(g.id)) return false
    seen.add(g.id)
    return true
  })
}

export async function getMutationsByGeneId(geneId: string): Promise<AMRMutation[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amr_mutations')
    .select('*')
    .eq('gene_id', geneId)
    .order('mutation_name')

  if (error) {
    console.error('Error fetching mutations for gene:', error)
    return []
  }

  return data || []
}

export async function browseGenesWithMutations(
  filters: BrowseFilters,
  page: number = 1
): Promise<PaginatedResult<GeneWithMutationCount>> {
  const supabase = await createClient()

  const tiers = await getValidationTiers()

  // mechanismClass lives on amr_genes — resolve to gene names first
  let allowedGeneNames: string[] | null = null
  if (filters.mechanismClass) {
    const { data: geneRows } = await supabase
      .from('amr_genes')
      .select('gene_name')
      .eq('mechanism', filters.mechanismClass)
    allowedGeneNames = [...new Set((geneRows || []).map((r) => r.gene_name).filter(Boolean))]
  }

  let query = supabase
    .from('amr_mutations')
    .select('gene_name, status, confers_resistance_to, organisms_observed_in, country, mutation_type')
    .not('gene_name', 'is', null)

  if (filters.pmid) {
    query = query.eq('paper_pmid', filters.pmid)
  }
  if (filters.validationTier) {
    const tierGenes = [...tiers.entries()]
      .filter(([, info]) => info.tier === filters.validationTier)
      .map(([g]) => g)
    if (tierGenes.length === 0) {
      return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    query = query.in('gene_name', tierGenes)
  }
  if (filters.search) {
    query = query.ilike('gene_name', `%${filters.search}%`)
  }
  if (allowedGeneNames !== null) {
    if (allowedGeneNames.length === 0) {
      return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    query = query.in('gene_name', allowedGeneNames)
  }
  if (filters.antibiotic) {
    query = query.contains('confers_resistance_to', [filters.antibiotic])
  }
  if (filters.organism) {
    query = query.contains('organisms_observed_in', [filters.organism])
  }
  if (filters.country) {
    if (filters.country === '__missing__') {
      query = query.is('country', null)
    } else {
      query = query.eq('country', filters.country)
    }
  }

  // Apply source database multi-select filter
  if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
    // For multi-select, we need to apply an OR condition for each selected database
    const orConditions = filters.sourceDatabases
      .map((db) => `source_database.eq.${db}`)
      .join(',')
    query = query.or(orConditions)
  }

  if (filters.curatedOnly) {
    query = query.eq('status', 'curated')
  }

  const { data, error } = await query

  if (error || !data) {
    return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
  }

  const statusPriority: Record<string, number> = { curated: 0, pending: 1, rejected: 2 }
  const groups = new Map<string, {
    count: number
    statuses: CurationStatus[]
    mutationTypes: Set<string>
    resistances: Set<string>
  }>()

  for (const m of data) {
    if (!m.gene_name) continue
    const existing = groups.get(m.gene_name)
    if (existing) {
      existing.count++
      if (m.status) existing.statuses.push(m.status as CurationStatus)
      if (m.mutation_type) existing.mutationTypes.add(m.mutation_type)
      for (const r of m.confers_resistance_to || []) existing.resistances.add(r)
    } else {
      groups.set(m.gene_name, {
        count: 1,
        statuses: m.status ? [m.status as CurationStatus] : [],
        mutationTypes: new Set(m.mutation_type ? [m.mutation_type] : []),
        resistances: new Set(m.confers_resistance_to || []),
      })
    }
  }

  const entries: GeneWithMutationCount[] = [...groups.entries()]
    .map(([gene_name, g]) => ({
      gene_name,
      mutation_count: g.count,
      best_status: (g.statuses.reduce(
        (best, s) => ((statusPriority[s] ?? 99) < (statusPriority[best] ?? 99) ? s : best),
        'pending' as CurationStatus
      )) as CurationStatus,
      mutation_types: [...g.mutationTypes].sort(),
      resistances: [...g.resistances].sort(),
      validation_tier: (tiers.get(gene_name)?.tier ?? 'Candidate') as ValidationTier,
    }))
    .sort((a, b) => a.gene_name.localeCompare(b.gene_name))

  const total = entries.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return { data: paged, total, page, pageSize: PAGE_SIZE, totalPages }
}

export async function getMutationsByGeneName(geneName: string): Promise<AMRMutation[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('amr_mutations')
    .select('*')
    .eq('gene_name', geneName)
    .order('nucleotide_change', { ascending: true })

  if (error) {
    console.error('Error fetching mutations by gene name:', error)
    return []
  }

  return data || []
}

export async function getPaperDetail(pmid: string): Promise<{
  pmid: string
  title: string | null
  year: number | null
  geographic_location: string | null
  key_findings: string | null
  genes: AMRGene[]
  mutations: AMRMutation[]
} | null> {
  const supabase = await createClient()

  const [genesResult, mutationsResult, paperResult] = await Promise.all([
    supabase.from('amr_genes').select('*').eq('paper_pmid', pmid).order('gene_name'),
    supabase.from('amr_mutations').select('*').eq('paper_pmid', pmid).order('nucleotide_change'),
    supabase.from('papers').select('key_findings').eq('pmid', pmid).maybeSingle(),
  ])

  const genes = genesResult.data || []
  const mutations = mutationsResult.data || []

  if (genes.length === 0 && mutations.length === 0) return null

  const title = genes[0]?.title_pmid ?? mutations[0]?.title_pmid ?? null
  const year = genes[0]?.year_pmid ?? mutations[0]?.year_pmid ?? null
  const geographic_location = genes[0]?.geographic_location ?? null
  const key_findings =
    paperResult.data?.key_findings ??
    genes[0]?.key_findings ??
    mutations[0]?.key_findings ??
    null

  return { pmid, title, year, geographic_location, key_findings, genes, mutations }
}

export async function browsePapers(
  search?: string,
  page: number = 1,
  filters?: {
    antibiotic?: string
    organism?: string
    country?: string
    yearFrom?: number
    yearTo?: number
    sourceDatabases?: string[]
  }
): Promise<PaginatedResult<PaperEntry>> {
  const supabase = await createClient()

  let genesQuery = supabase
    .from('amr_genes')
    .select('paper_pmid, gene_name, title_pmid, year_pmid, geographic_location, confers_resistance_to, organisms_tested_in, source_database')
    .not('paper_pmid', 'is', null)

  let mutationsQuery = supabase
    .from('amr_mutations')
    .select('paper_pmid, source_database')
    .not('paper_pmid', 'is', null)

  // Apply source database filter if specified
  if (filters?.sourceDatabases && filters.sourceDatabases.length > 0) {
    const orConditions = filters.sourceDatabases
      .map((db) => `source_database.eq.${db}`)
      .join(',')
    genesQuery = genesQuery.or(orConditions)
    mutationsQuery = mutationsQuery.or(orConditions)
  }

  const [genesResult, mutationsResult] = await Promise.all([genesQuery, mutationsQuery])

  const paperMap = new Map<string, {
    title: string | null
    year: number | null
    geographic_location: string | null
    geneNames: Set<string>
    mutationCount: number
    antibiotics: Set<string>
    organisms: Set<string>
    source_database: string | null
  }>()

  for (const gene of genesResult.data || []) {
    if (!gene.paper_pmid) continue
    if (!paperMap.has(gene.paper_pmid)) {
      paperMap.set(gene.paper_pmid, {
        title: gene.title_pmid || null,
        year: gene.year_pmid || null,
        geographic_location: gene.geographic_location || null,
        geneNames: new Set(),
        mutationCount: 0,
        antibiotics: new Set(),
        organisms: new Set(),
        source_database: gene.source_database || null,
      })
    }
    const entry = paperMap.get(gene.paper_pmid)!
    if (gene.gene_name) entry.geneNames.add(gene.gene_name)
    for (const ab of gene.confers_resistance_to || []) entry.antibiotics.add(ab)
    for (const org of gene.organisms_tested_in || []) entry.organisms.add(org)
  }

  for (const mut of mutationsResult.data || []) {
    if (!mut.paper_pmid) continue
    if (paperMap.has(mut.paper_pmid)) {
      paperMap.get(mut.paper_pmid)!.mutationCount++
    } else {
      paperMap.set(mut.paper_pmid, {
        title: null,
        year: null,
        geographic_location: null,
        geneNames: new Set(),
        mutationCount: 1,
        antibiotics: new Set(),
        organisms: new Set(),
        source_database: mut.source_database || null,
      })
    }
  }

  let entries: PaperEntry[] = [...paperMap.entries()].map(([pmid, v]) => ({
    pmid,
    title: v.title,
    year: v.year,
    geographic_location: v.geographic_location,
    gene_count: v.geneNames.size,
    mutation_count: v.mutationCount,
    antibiotics: [...v.antibiotics],
    organisms: [...v.organisms],
    source_database: v.source_database,
  }))

  if (filters?.country) {
    if (filters.country === '__missing__') {
      entries = entries.filter((e) => !e.geographic_location)
    } else {
      entries = entries.filter((e) => e.geographic_location === filters.country)
    }
  }

  if (filters?.antibiotic) {
    entries = entries.filter((e) => e.antibiotics.includes(filters.antibiotic!))
  }

  if (filters?.organism) {
    entries = entries.filter((e) => e.organisms.includes(filters.organism!))
  }

  if (filters?.yearFrom) {
    entries = entries.filter((e) => e.year !== null && e.year >= filters.yearFrom!)
  }

  if (filters?.yearTo) {
    entries = entries.filter((e) => e.year !== null && e.year <= filters.yearTo!)
  }

  if (search) {
    const s = search.toLowerCase()
    entries = entries.filter(
      (e) =>
        e.pmid.includes(s) ||
        e.title?.toLowerCase().includes(s) ||
        e.geographic_location?.toLowerCase().includes(s) ||
        e.antibiotics.some((a) => a.toLowerCase().includes(s)) ||
        e.organisms.some((o) => o.toLowerCase().includes(s))
    )
  }

  entries.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.pmid.localeCompare(b.pmid))

  const total = entries.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return { data: paged, total, page, pageSize: PAGE_SIZE, totalPages }
}
