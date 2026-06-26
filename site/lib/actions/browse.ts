'use server'

import { createClient } from '@/lib/supabase/server'
import { getCachedFilterOptions } from '@/lib/browse-cache'
import type { AMRGene, AMRMutation, FilterOptions, BrowseFilters, PaginatedResult, GeneWithMutationCount, CurationStatus, PaperEntry, ValidationTier, ValidationInfo, ConfirmationReason } from '@/lib/types'

const PAGE_SIZE = 10

const EXTERNAL_DATABASES = ['Card Database', 'ResFinder Database', 'Reference Gene Catalog']

const CACHE_TTL = 3600_000 // 1 hour
let _geneTierCache: { data: Map<string, ValidationInfo>; ts: number } | null = null
let _mutTierCache: { data: Map<string, ValidationInfo>; ts: number } | null = null
let _geneTierPromise: Promise<Map<string, ValidationInfo>> | null = null
let _mutTierPromise: Promise<Map<string, ValidationInfo>> | null = null

let _geneNamesCache: { data: string[]; ts: number } | null = null
let _geneNamesPromise: Promise<string[]> | null = null
let _mutGroupsCache: { data: Map<string, string[]>; ts: number } | null = null
let _mutGroupsPromise: Promise<Map<string, string[]>> | null = null

let _genePmids: Set<string> | null = null
let _geneDbMap: Map<string, Set<string>> | null = null

export function invalidateTierCaches() {
  _geneTierCache = null
  _mutTierCache = null
  _geneTierPromise = null
  _mutTierPromise = null
  _genePmids = null
  _geneDbMap = null
}

const BATCH_SIZE = 1000
const PARALLEL_BATCHES = 10

async function fetchAllRows<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  select: string,
): Promise<T[]> {
  const { count } = await supabase.from(table).select(select, { count: 'exact', head: true })
  if (!count || count === 0) return []
  const totalBatches = Math.ceil(count / BATCH_SIZE)
  const allRows: T[] = []
  for (let i = 0; i < totalBatches; i += PARALLEL_BATCHES) {
    const batch = Array.from({ length: Math.min(PARALLEL_BATCHES, totalBatches - i) }, (_, j) => {
      const offset = (i + j) * BATCH_SIZE
      return supabase.from(table).select(select).range(offset, offset + BATCH_SIZE - 1)
    })
    const results = await Promise.allSettled(batch)
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.data) {
        allRows.push(...(result.value.data as T[]))
      }
    }
    if (i + PARALLEL_BATCHES < totalBatches) {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  return allRows
}

async function _fetchValidationTiers(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, ValidationInfo>> {
  const allRows = await fetchAllRows<{ gene_name: string; source_database: string; paper_pmid: string; gene_status: string }>(
    supabase, 'amr_genes', 'gene_name, source_database, paper_pmid, gene_status'
  )

  _genePmids = new Set(
    allRows.flatMap((r) => r.paper_pmid ? r.paper_pmid.split(',').map((p) => p.trim()).filter((p) => p && /^\d+$/.test(p)) : [])
  )

  if (allRows.length === 0) return new Map()

  const geneInfo = new Map<string, {
    databases: Set<string>
    hasCurated: boolean
    reslitPmids: Set<string>
  }>()

  for (const r of allRows) {
    if (!r.gene_name) continue
    let info = geneInfo.get(r.gene_name)
    if (!info) {
      info = { databases: new Set(), hasCurated: false, reslitPmids: new Set() }
      geneInfo.set(r.gene_name, info)
    }
    if (r.source_database) info.databases.add(r.source_database)
    if (r.source_database === 'Reslit' && r.paper_pmid) info.reslitPmids.add(r.paper_pmid)
    if (r.gene_status === 'curated') info.hasCurated = true
  }

  _geneDbMap = new Map()
  for (const [gene, info] of geneInfo) {
    _geneDbMap.set(gene, info.databases)
  }

  const tiers = new Map<string, ValidationInfo>()
  for (const [gene, info] of geneInfo) {
    let tier: ValidationTier
    let reason: ConfirmationReason | undefined
    const hasReslit = info.databases.has('Reslit')
    const hasExternal = [...info.databases].some((db) => EXTERNAL_DATABASES.includes(db))
    const crossDb = info.databases.size >= 2
    if (crossDb || info.hasCurated) {
      tier = 'Confirmed'
      if (crossDb && info.hasCurated) reason = 'both'
      else if (crossDb) reason = 'cross-database'
      else reason = 'curator-verified'
    } else if (hasExternal && !hasReslit) {
      tier = 'Established'
    } else if (hasReslit && info.reslitPmids.size >= 3) {
      tier = 'Supported'
    } else {
      tier = 'Candidate'
    }
    tiers.set(gene, { tier, reason })
  }
  return tiers
}

export async function getValidationTiers(supabaseClient?: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, ValidationInfo>> {
  if (_geneTierCache && Date.now() - _geneTierCache.ts < CACHE_TTL) {
    return _geneTierCache.data
  }
  if (!_geneTierPromise) {
    const supabase = supabaseClient ?? await createClient()
    _geneTierPromise = _fetchValidationTiers(supabase).then((data) => {
      _geneTierCache = { data, ts: Date.now() }
      _geneTierPromise = null
      return data
    }).catch((err) => {
      _geneTierPromise = null
      throw err
    })
  }
  return _geneTierPromise
}

let _mutPmids: Set<string> | null = null

async function _fetchMutationValidationTiers(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, ValidationInfo>> {
  const allRows = await fetchAllRows<{ id: string; gene_name: string; protein_change: string | null; nucleotide_change: string | null; source_database: string; paper_pmid: string | null; status: string }>(
    supabase, 'amr_mutations', 'id, gene_name, protein_change, nucleotide_change, source_database, paper_pmid, status'
  )

  _mutPmids = new Set(
    allRows.flatMap((r) => r.paper_pmid ? r.paper_pmid.split(',').map((p) => p.trim()).filter((p) => p && /^\d+$/.test(p)) : [])
  )

  if (allRows.length === 0) return new Map()

  type MutInfo = { databases: Set<string>; reslitPmids: Set<string>; hasCurated: boolean }
  const byKey = new Map<string, MutInfo>()

  function getOrCreate(key: string): MutInfo {
    let info = byKey.get(key)
    if (!info) {
      info = { databases: new Set(), reslitPmids: new Set(), hasCurated: false }
      byKey.set(key, info)
    }
    return info
  }

  for (const r of allRows) {
    if (!r.gene_name) continue
    const keys: string[] = []
    if (r.protein_change) keys.push(`${r.gene_name}::p::${r.protein_change}`)
    if (r.nucleotide_change) keys.push(`${r.gene_name}::n::${r.nucleotide_change}`)
    if (keys.length === 0) keys.push(`${r.gene_name}::id::${r.id}`)

    for (const key of keys) {
      const info = getOrCreate(key)
      if (r.source_database) info.databases.add(r.source_database)
      if (r.source_database === 'Reslit' && r.paper_pmid) info.reslitPmids.add(r.paper_pmid)
      if (r.status === 'curated') info.hasCurated = true
    }
  }

  const tiers = new Map<string, ValidationInfo>()
  for (const r of allRows) {
    const proteinKey = r.protein_change ? `${r.gene_name}::p::${r.protein_change}` : null
    const nucleotideKey = r.nucleotide_change ? `${r.gene_name}::n::${r.nucleotide_change}` : null
    const fallbackKey = (!proteinKey && !nucleotideKey) ? `${r.gene_name}::id::${r.id}` : null

    const pInfo = proteinKey ? byKey.get(proteinKey) : null
    const nInfo = nucleotideKey ? byKey.get(nucleotideKey) : null
    const fInfo = fallbackKey ? byKey.get(fallbackKey) : null

    const databases = new Set([
      ...(pInfo?.databases ?? []),
      ...(nInfo?.databases ?? []),
      ...(fInfo?.databases ?? []),
    ])
    const reslitPmids = new Set([
      ...(pInfo?.reslitPmids ?? []),
      ...(nInfo?.reslitPmids ?? []),
      ...(fInfo?.reslitPmids ?? []),
    ])
    const hasCurated = (pInfo?.hasCurated ?? false) || (nInfo?.hasCurated ?? false) || (fInfo?.hasCurated ?? false)

    let tier: ValidationTier
    let reason: ConfirmationReason | undefined
    const crossDb = databases.size >= 2
    const hasReslit = databases.has('Reslit')
    const hasExternal = [...databases].some((db) => EXTERNAL_DATABASES.includes(db))

    if (crossDb || hasCurated) {
      tier = 'Confirmed'
      if (crossDb && hasCurated) reason = 'both'
      else if (crossDb) reason = 'cross-database'
      else reason = 'curator-verified'
    } else if (hasExternal && !hasReslit) {
      tier = 'Established'
    } else if (hasReslit && reslitPmids.size >= 3) {
      tier = 'Supported'
    } else {
      tier = 'Candidate'
    }

    tiers.set(r.id, { tier, reason, databases: [...databases].sort() })
  }

  return tiers
}

export async function getMutationValidationTiers(supabaseClient?: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, ValidationInfo>> {
  if (_mutTierCache && Date.now() - _mutTierCache.ts < CACHE_TTL) {
    return _mutTierCache.data
  }
  if (!_mutTierPromise) {
    const supabase = supabaseClient ?? await createClient()
    _mutTierPromise = _fetchMutationValidationTiers(supabase).then((data) => {
      _mutTierCache = { data, ts: Date.now() }
      _mutTierPromise = null
      return data
    }).catch((err) => {
      _mutTierPromise = null
      throw err
    })
  }
  return _mutTierPromise
}

export async function getDistinctPaperCount(supabaseClient?: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const supabase = supabaseClient ?? await createClient()
  await Promise.all([getValidationTiers(supabase), getMutationValidationTiers(supabase)])
  const all = new Set([...(_genePmids ?? []), ...(_mutPmids ?? [])])
  return all.size
}

async function _fetchUniqueGeneNames(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string[]> {
  const allRows = await fetchAllRows<{ gene_name: string }>(supabase, 'amr_genes', 'gene_name')
  return [...new Set(allRows.map((r) => r.gene_name).filter(Boolean))].sort()
}

async function getCachedGeneNames(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string[]> {
  if (_geneNamesCache && Date.now() - _geneNamesCache.ts < CACHE_TTL) {
    return _geneNamesCache.data
  }
  if (!_geneNamesPromise) {
    _geneNamesPromise = _fetchUniqueGeneNames(supabase).then((data) => {
      _geneNamesCache = { data, ts: Date.now() }
      _geneNamesPromise = null
      return data
    }).catch((err) => {
      _geneNamesPromise = null
      throw err
    })
  }
  return _geneNamesPromise
}

async function _fetchMutationGroups(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, string[]>> {
  const allRows = await fetchAllRows<{ id: string; gene_name: string; protein_change: string | null; nucleotide_change: string | null }>(
    supabase, 'amr_mutations', 'id, gene_name, protein_change, nucleotide_change'
  )
  const groups = new Map<string, string[]>()
  for (const m of allRows) {
    const key = mutationGroupKey(m)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m.id)
  }
  return groups
}

async function getCachedMutationGroups(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Map<string, string[]>> {
  if (_mutGroupsCache && Date.now() - _mutGroupsCache.ts < CACHE_TTL) {
    return _mutGroupsCache.data
  }
  if (!_mutGroupsPromise) {
    _mutGroupsPromise = _fetchMutationGroups(supabase).then((data) => {
      _mutGroupsCache = { data, ts: Date.now() }
      _mutGroupsPromise = null
      return data
    }).catch((err) => {
      _mutGroupsPromise = null
      throw err
    })
  }
  return _mutGroupsPromise
}

function hasComplexGeneFilters(filters: BrowseFilters): boolean {
  return !!(
    filters.mechanismClass || filters.antibiotic || filters.encodes ||
    filters.organism || filters.country || filters.yearFrom || filters.yearTo ||
    filters.pmid || filters.curatedOnly ||
    filters.geneNameSearch || filters.alleleSearch
  )
}

function hasComplexMutationFilters(filters: BrowseFilters): boolean {
  return !!(
    filters.geneName || filters.antibiotic || filters.mutationType ||
    filters.country || filters.sourceDatabases?.length || filters.pmid ||
    filters.status || filters.curatedOnly
  )
}

export async function getGroupedMutationTierCounts(supabaseClient?: Awaited<ReturnType<typeof createClient>>): Promise<{ total: number; tierCounts: Record<string, number> }> {
  const supabase = supabaseClient ?? await createClient()
  const [mutTiers, allGroups] = await Promise.all([
    getMutationValidationTiers(supabase),
    getCachedMutationGroups(supabase),
  ])

  const tierPri: Record<string, number> = { Confirmed: 0, Established: 1, Supported: 2, Candidate: 3 }
  const bestTierPerGroup = new Map<string, ValidationTier>()
  for (const [key, ids] of allGroups) {
    for (const id of ids) {
      const tier = mutTiers.get(id)?.tier ?? 'Candidate'
      const existing = bestTierPerGroup.get(key)
      if (!existing || (tierPri[tier] ?? 99) < (tierPri[existing] ?? 99)) {
        bestTierPerGroup.set(key, tier)
      }
    }
  }

  const tierCounts: Record<string, number> = { Confirmed: 0, Established: 0, Supported: 0, Candidate: 0 }
  for (const tier of bestTierPerGroup.values()) {
    tierCounts[tier]++
  }

  return { total: bestTierPerGroup.size, tierCounts }
}

export async function getFilterOptions(): Promise<FilterOptions> {
  return getCachedFilterOptions()
}

export async function browseGenes(
  filters: BrowseFilters,
  page: number = 1
): Promise<PaginatedResult<AMRGene>> {
  const supabase = await createClient()
  const [tiers, cachedNames] = await Promise.all([
    getValidationTiers(supabase),
    getCachedGeneNames(supabase),
  ])

  let uniqueNames: string[]

  if (hasComplexGeneFilters(filters)) {
    // Complex filters need DB — fetch gene_name column with filters applied
    let q = supabase.from('amr_genes').select('gene_name')
    if (filters.search) q = q.or(`gene_name.ilike.%${filters.search}%,allele.ilike.%${filters.search}%,mechanism.ilike.%${filters.search}%,encodes.ilike.%${filters.search}%`)
    if (filters.geneNameSearch) q = q.ilike('gene_name', `%${filters.geneNameSearch}%`)
    if (filters.alleleSearch) q = q.ilike('allele', `%${filters.alleleSearch}%`)
    if (filters.pmid) q = q.eq('paper_pmid', filters.pmid)
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
    if (filters.validationTier) {
      const tierGenes = [...tiers.entries()].filter(([, i]) => i.tier === filters.validationTier).map(([g]) => g)
      q = q.in('gene_name', tierGenes)
    }

    const allNames: string[] = []
    let offset = 0
    while (true) {
      const { data } = await q.order('gene_name', { ascending: true }).range(offset, offset + 999)
      if (!data || data.length === 0) break
      for (const r of data) if (r.gene_name) allNames.push(r.gene_name)
      if (data.length < 1000) break
      offset += 1000
    }
    uniqueNames = [...new Set(allNames)].sort()
  } else {
    // Simple filters — use cached gene names, filter in memory (0 XHR)
    uniqueNames = cachedNames
    if (filters.search) {
      const s = filters.search.toLowerCase()
      uniqueNames = uniqueNames.filter((g) => g.toLowerCase().includes(s))
    }
    if (filters.validationTier) {
      uniqueNames = uniqueNames.filter((g) => (tiers.get(g)?.tier ?? 'Candidate') === filters.validationTier)
    }
    if (filters.sourceDatabases?.length && _geneDbMap) {
      uniqueNames = uniqueNames.filter((g) => {
        const dbs = _geneDbMap!.get(g)
        return dbs && filters.sourceDatabases!.some((db) => dbs.has(db))
      })
    }
  }

  const total = uniqueNames.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pagedNames = uniqueNames.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (pagedNames.length === 0) {
    return { data: [], total, page, pageSize: PAGE_SIZE, totalPages }
  }

  // Single query for the actual page data
  const { data: pageData, error } = await supabase
    .from('amr_genes')
    .select('*')
    .in('gene_name', pagedNames)
    .order('gene_name', { ascending: true })

  if (error || !pageData) {
    return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
  }

  const enriched = pageData.map((row) => ({
    ...row,
    validation_tier: (tiers.get(row.gene_name)?.tier ?? 'Candidate') as ValidationTier,
  }))

  enriched.sort((a, b) => a.gene_name.localeCompare(b.gene_name))

  return { data: enriched, total, page, pageSize: PAGE_SIZE, totalPages }
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
  const [mutTiers, cachedGroups] = await Promise.all([
    getMutationValidationTiers(supabase),
    getCachedMutationGroups(supabase),
  ])

  let groups: Map<string, string[]>

  if (hasComplexMutationFilters(filters)) {
    // Complex filters need DB
    let q = supabase.from('amr_mutations').select('id, gene_name, protein_change, nucleotide_change')
    if (filters.pmid) q = q.eq('paper_pmid', filters.pmid)
    if (filters.search) q = q.or(`nucleotide_change.ilike.%${filters.search}%,gene_name.ilike.%${filters.search}%,protein_change.ilike.%${filters.search}%,effect_on_function.ilike.%${filters.search}%,paper_pmid.ilike.%${filters.search}%,title_pmid.ilike.%${filters.search}%`)
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

    const allIdentities: { id: string; gene_name: string; protein_change: string | null; nucleotide_change: string | null }[] = []
    let offset = 0
    while (true) {
      const { data } = await q.order('gene_name', { ascending: true }).range(offset, offset + 999)
      if (!data || data.length === 0) break
      allIdentities.push(...data)
      if (data.length < 1000) break
      offset += 1000
    }

    groups = new Map<string, string[]>()
    for (const m of allIdentities) {
      const key = mutationGroupKey(m)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m.id)
    }
  } else {
    // No complex filters — use cached groups (0 XHR)
    groups = cachedGroups
  }

  // Apply simple filters in memory
  let groupKeys = [...groups.keys()].sort()
  if (filters.search && !hasComplexMutationFilters(filters)) {
    const s = filters.search.toLowerCase()
    groupKeys = groupKeys.filter((k) => k.toLowerCase().includes(s))
  }
  if (filters.validationTier) {
    groupKeys = groupKeys.filter((key) => {
      const ids = groups.get(key)!
      return ids.some((id) => (mutTiers.get(id)?.tier ?? 'Candidate') === filters.validationTier)
    })
  }

  const total = groupKeys.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pagedKeys = groupKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (pagedKeys.length === 0) {
    return { data: [], total, page, pageSize: PAGE_SIZE, totalPages }
  }

  // Single query for the actual page data
  const pagedIds = pagedKeys.flatMap((k) => groups.get(k)!)
  const { data: allData } = await supabase
    .from('amr_mutations')
    .select('*')
    .in('id', pagedIds)

  const enriched = (allData || []).map((m) => ({
    ...m,
    validation_tier: (mutTiers.get(m.id)?.tier ?? 'Candidate') as ValidationTier,
    all_databases: mutTiers.get(m.id)?.databases ?? [m.source_database].filter(Boolean),
  }))

  enriched.sort((a, b) => {
    const ka = mutationGroupKey(a)
    const kb = mutationGroupKey(b)
    return ka.localeCompare(kb)
  })

  return { data: enriched, total, page, pageSize: PAGE_SIZE, totalPages }
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

  const tiers = await getValidationTiers(supabase)

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
