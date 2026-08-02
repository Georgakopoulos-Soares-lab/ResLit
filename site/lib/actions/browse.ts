'use server'

import { eq, gte, lte, isNull, isNotNull, like, or, and, inArray, asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { amrGenes, amrMutations, papers } from '@/lib/db/schema'
import { jsonContains, toSnakeCase, alnumLike, normalizeAlnum } from '@/lib/db/helpers'
import { getCachedFilterOptions } from '@/lib/browse-cache'
import type { AMRGene, AMRMutation, FilterOptions, BrowseFilters, PaginatedResult, GeneWithMutationCount, GeneAllele, CurationStatus, PaperEntry, ValidationTier, ValidationInfo, ConfirmationReason } from '@/lib/types'

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
let _alleleGroupsCache: { data: Map<string, string[]>; ts: number } | null = null
let _alleleGroupsPromise: Promise<Map<string, string[]>> | null = null

let _genePmids: Set<string> | null = null
let _mutPmids: Set<string> | null = null
let _geneDbMap: Map<string, Set<string>> | null = null

export async function invalidateTierCaches() {
  _geneTierCache = null
  _mutTierCache = null
  _geneTierPromise = null
  _mutTierPromise = null
  _genePmids = null
  _geneDbMap = null
}

async function _fetchValidationTiers(): Promise<Map<string, ValidationInfo>> {
  const allRows = await db
    .select({
      geneName: amrGenes.geneName,
      sourceDatabase: amrGenes.sourceDatabase,
      paperPmid: amrGenes.paperPmid,
      geneStatus: amrGenes.geneStatus,
    })
    .from(amrGenes)

  _genePmids = new Set(
    allRows.flatMap((r) => (r.paperPmid ? r.paperPmid.split(',').map((p) => p.trim()).filter((p) => p && /^\d+$/.test(p)) : []))
  )

  if (allRows.length === 0) return new Map()

  const geneInfo = new Map<string, { databases: Set<string>; hasCurated: boolean; reslitPmids: Set<string> }>()

  for (const r of allRows) {
    if (!r.geneName) continue
    let info = geneInfo.get(r.geneName)
    if (!info) {
      info = { databases: new Set(), hasCurated: false, reslitPmids: new Set() }
      geneInfo.set(r.geneName, info)
    }
    if (r.sourceDatabase) info.databases.add(r.sourceDatabase)
    if (r.sourceDatabase === 'Reslit' && r.paperPmid) info.reslitPmids.add(r.paperPmid)
    if (r.geneStatus === 'curated') info.hasCurated = true
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
    const hasExternal = [...info.databases].some((d) => EXTERNAL_DATABASES.includes(d))
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

export async function getValidationTiers(): Promise<Map<string, ValidationInfo>> {
  if (_geneTierCache && Date.now() - _geneTierCache.ts < CACHE_TTL) {
    return _geneTierCache.data
  }
  if (!_geneTierPromise) {
    _geneTierPromise = _fetchValidationTiers()
      .then((data) => {
        _geneTierCache = { data, ts: Date.now() }
        _geneTierPromise = null
        return data
      })
      .catch((err) => {
        _geneTierPromise = null
        throw err
      })
  }
  return _geneTierPromise
}

async function _fetchMutationValidationTiers(): Promise<Map<string, ValidationInfo>> {
  const allRows = await db
    .select({
      id: amrMutations.id,
      geneName: amrMutations.geneName,
      proteinChange: amrMutations.proteinChange,
      nucleotideChange: amrMutations.nucleotideChange,
      sourceDatabase: amrMutations.sourceDatabase,
      paperPmid: amrMutations.paperPmid,
      status: amrMutations.status,
    })
    .from(amrMutations)

  _mutPmids = new Set(
    allRows.flatMap((r) => (r.paperPmid ? r.paperPmid.split(',').map((p) => p.trim()).filter((p) => p && /^\d+$/.test(p)) : []))
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
    if (!r.geneName) continue
    const keys: string[] = []
    if (r.proteinChange) keys.push(`${r.geneName}::p::${r.proteinChange}`)
    if (r.nucleotideChange) keys.push(`${r.geneName}::n::${r.nucleotideChange}`)
    if (keys.length === 0) keys.push(`${r.geneName}::id::${r.id}`)

    for (const key of keys) {
      const info = getOrCreate(key)
      if (r.sourceDatabase) info.databases.add(r.sourceDatabase)
      if (r.sourceDatabase === 'Reslit' && r.paperPmid) info.reslitPmids.add(r.paperPmid)
      if (r.status === 'curated') info.hasCurated = true
    }
  }

  const tiers = new Map<string, ValidationInfo>()
  for (const r of allRows) {
    const proteinKey = r.proteinChange ? `${r.geneName}::p::${r.proteinChange}` : null
    const nucleotideKey = r.nucleotideChange ? `${r.geneName}::n::${r.nucleotideChange}` : null
    const fallbackKey = !proteinKey && !nucleotideKey ? `${r.geneName}::id::${r.id}` : null

    const pInfo = proteinKey ? byKey.get(proteinKey) : null
    const nInfo = nucleotideKey ? byKey.get(nucleotideKey) : null
    const fInfo = fallbackKey ? byKey.get(fallbackKey) : null

    const databases = new Set([...(pInfo?.databases ?? []), ...(nInfo?.databases ?? []), ...(fInfo?.databases ?? [])])
    const reslitPmids = new Set([...(pInfo?.reslitPmids ?? []), ...(nInfo?.reslitPmids ?? []), ...(fInfo?.reslitPmids ?? [])])
    const hasCurated = (pInfo?.hasCurated ?? false) || (nInfo?.hasCurated ?? false) || (fInfo?.hasCurated ?? false)

    let tier: ValidationTier
    let reason: ConfirmationReason | undefined
    const crossDb = databases.size >= 2
    const hasReslit = databases.has('Reslit')
    const hasExternal = [...databases].some((d) => EXTERNAL_DATABASES.includes(d))

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

    tiers.set(String(r.id), { tier, reason, databases: [...databases].sort() })
  }

  return tiers
}

export async function getMutationValidationTiers(): Promise<Map<string, ValidationInfo>> {
  if (_mutTierCache && Date.now() - _mutTierCache.ts < CACHE_TTL) {
    return _mutTierCache.data
  }
  if (!_mutTierPromise) {
    _mutTierPromise = _fetchMutationValidationTiers()
      .then((data) => {
        _mutTierCache = { data, ts: Date.now() }
        _mutTierPromise = null
        return data
      })
      .catch((err) => {
        _mutTierPromise = null
        throw err
      })
  }
  return _mutTierPromise
}

export async function getDistinctPaperCount(): Promise<number> {
  await Promise.all([getValidationTiers(), getMutationValidationTiers()])
  const all = new Set([...(_genePmids ?? []), ...(_mutPmids ?? [])])
  return all.size
}

async function _fetchUniqueGeneNames(): Promise<string[]> {
  const rows = await db.select({ geneName: amrGenes.geneName }).from(amrGenes)
  return [...new Set(rows.map((r) => r.geneName).filter(Boolean))].sort()
}

async function getCachedGeneNames(): Promise<string[]> {
  if (_geneNamesCache && Date.now() - _geneNamesCache.ts < CACHE_TTL) {
    return _geneNamesCache.data
  }
  if (!_geneNamesPromise) {
    _geneNamesPromise = _fetchUniqueGeneNames()
      .then((data) => {
        _geneNamesCache = { data, ts: Date.now() }
        _geneNamesPromise = null
        return data
      })
      .catch((err) => {
        _geneNamesPromise = null
        throw err
      })
  }
  return _geneNamesPromise
}

async function _fetchMutationGroups(): Promise<Map<string, string[]>> {
  const rows = await db
    .select({
      id: amrMutations.id,
      geneName: amrMutations.geneName,
      proteinChange: amrMutations.proteinChange,
      nucleotideChange: amrMutations.nucleotideChange,
    })
    .from(amrMutations)

  const groups = new Map<string, string[]>()
  for (const m of rows) {
    const key = mutationGroupKey({ gene_name: m.geneName ?? '', protein_change: m.proteinChange, nucleotide_change: m.nucleotideChange, id: String(m.id) })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(String(m.id))
  }
  return groups
}

async function getCachedMutationGroups(): Promise<Map<string, string[]>> {
  if (_mutGroupsCache && Date.now() - _mutGroupsCache.ts < CACHE_TTL) {
    return _mutGroupsCache.data
  }
  if (!_mutGroupsPromise) {
    _mutGroupsPromise = _fetchMutationGroups()
      .then((data) => {
        _mutGroupsCache = { data, ts: Date.now() }
        _mutGroupsPromise = null
        return data
      })
      .catch((err) => {
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

export async function getGroupedMutationTierCounts(): Promise<{ total: number; tierCounts: Record<string, number> }> {
  const [mutTiers, allGroups] = await Promise.all([getMutationValidationTiers(), getCachedMutationGroups()])

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

function buildGeneConditions(filters: BrowseFilters, tiers: Map<string, ValidationInfo>) {
  const conditions = []
  if (filters.search) {
    const p = `%${filters.search}%`
    conditions.push(
      or(alnumLike(amrGenes.geneName, filters.search), alnumLike(amrGenes.allele, filters.search), like(amrGenes.mechanism, p), like(amrGenes.encodes, p))
    )
  }
  if (filters.geneNameSearch) conditions.push(alnumLike(amrGenes.geneName, filters.geneNameSearch))
  if (filters.alleleSearch) conditions.push(alnumLike(amrGenes.allele, filters.alleleSearch))
  if (filters.pmid) conditions.push(eq(amrGenes.paperPmid, filters.pmid))
  if (filters.mechanismClass) conditions.push(eq(amrGenes.mechanism, filters.mechanismClass))
  if (filters.antibiotic) conditions.push(jsonContains(amrGenes.confersResistanceTo, filters.antibiotic))
  if (filters.encodes) conditions.push(eq(amrGenes.encodes, filters.encodes))
  if (filters.organism) conditions.push(jsonContains(amrGenes.organismsTestedIn, filters.organism))
  if (filters.country) {
    conditions.push(filters.country === '__missing__' ? isNull(amrGenes.geographicLocation) : eq(amrGenes.geographicLocation, filters.country))
  }
  if (filters.yearFrom) conditions.push(gte(amrGenes.year, filters.yearFrom))
  if (filters.yearTo) conditions.push(lte(amrGenes.year, filters.yearTo))
  if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
    conditions.push(inArray(amrGenes.sourceDatabase, filters.sourceDatabases))
  }
  if (filters.curatedOnly) conditions.push(eq(amrGenes.geneStatus, 'curated'))
  if (filters.validationTier) {
    const tierGenes = [...tiers.entries()].filter(([, i]) => i.tier === filters.validationTier).map(([g]) => g)
    conditions.push(inArray(amrGenes.geneName, tierGenes))
  }
  return conditions
}

export async function browseGenes(filters: BrowseFilters, page: number = 1): Promise<PaginatedResult<AMRGene>> {
  const [tiers, cachedNames] = await Promise.all([getValidationTiers(), getCachedGeneNames()])

  let uniqueNames: string[]

  if (hasComplexGeneFilters(filters)) {
    const rows = await db
      .select({ geneName: amrGenes.geneName })
      .from(amrGenes)
      .where(and(...buildGeneConditions(filters, tiers)))
      .orderBy(asc(amrGenes.geneName))

    uniqueNames = [...new Set(rows.map((r) => r.geneName).filter(Boolean))].sort()
  } else {
    uniqueNames = cachedNames
    if (filters.search) {
      const s = normalizeAlnum(filters.search)
      uniqueNames = uniqueNames.filter((g) => normalizeAlnum(g).includes(s))
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

  const pageData = await db
    .select({
      id: amrGenes.id,
      geneName: amrGenes.geneName,
      allele: amrGenes.allele,
      encodes: amrGenes.encodes,
      confersResistanceTo: amrGenes.confersResistanceTo,
      organismsTestedIn: amrGenes.organismsTestedIn,
      sourceDatabase: amrGenes.sourceDatabase,
      mechanism: amrGenes.mechanism,
      status: amrGenes.status,
      geneStatus: amrGenes.geneStatus,
    })
    .from(amrGenes)
    .where(inArray(amrGenes.geneName, pagedNames))
    .orderBy(asc(amrGenes.geneName))

  const enriched = pageData.map((row) => ({
    ...toSnakeCase(row),
    validation_tier: (tiers.get(row.geneName)?.tier ?? 'Candidate') as ValidationTier,
  })) as unknown as AMRGene[]

  enriched.sort((a, b) => a.gene_name.localeCompare(b.gene_name))

  return { data: enriched, total, page, pageSize: PAGE_SIZE, totalPages }
}

// Groups amr_genes rows by (gene_name, allele) — falling back to gene_name
// itself when a row has no allele, matching the grouping already used on the
// gene-detail page's "Allele Variants" table.
function alleleGroupKey(geneName: string, allele: string | null): string {
  return `${geneName}::${allele || geneName}`
}

function geneNameFromAlleleKey(key: string): string {
  return key.split('::')[0]
}

async function _fetchAlleleGroups(): Promise<Map<string, string[]>> {
  const rows = await db.select({ id: amrGenes.id, geneName: amrGenes.geneName, allele: amrGenes.allele }).from(amrGenes)

  const groups = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.geneName) continue
    const key = alleleGroupKey(r.geneName, r.allele)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(String(r.id))
  }
  return groups
}

async function getCachedAlleleGroups(): Promise<Map<string, string[]>> {
  if (_alleleGroupsCache && Date.now() - _alleleGroupsCache.ts < CACHE_TTL) {
    return _alleleGroupsCache.data
  }
  if (!_alleleGroupsPromise) {
    _alleleGroupsPromise = _fetchAlleleGroups()
      .then((data) => {
        _alleleGroupsCache = { data, ts: Date.now() }
        _alleleGroupsPromise = null
        return data
      })
      .catch((err) => {
        _alleleGroupsPromise = null
        throw err
      })
  }
  return _alleleGroupsPromise
}

export async function browseGenesByAllele(filters: BrowseFilters, page: number = 1): Promise<PaginatedResult<GeneAllele>> {
  const [tiers, cachedGroups] = await Promise.all([getValidationTiers(), getCachedAlleleGroups()])

  let groups: Map<string, string[]>
  let groupKeys: string[]

  if (hasComplexGeneFilters(filters)) {
    const rows = await db
      .select({ id: amrGenes.id, geneName: amrGenes.geneName, allele: amrGenes.allele })
      .from(amrGenes)
      .where(and(...buildGeneConditions(filters, tiers)))

    groups = new Map<string, string[]>()
    for (const r of rows) {
      if (!r.geneName) continue
      const key = alleleGroupKey(r.geneName, r.allele)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(String(r.id))
    }
    groupKeys = [...groups.keys()].sort()
  } else {
    groups = cachedGroups
    groupKeys = [...groups.keys()].sort()
    if (filters.search) {
      const s = normalizeAlnum(filters.search)
      groupKeys = groupKeys.filter((k) => normalizeAlnum(k).includes(s))
    }
    if (filters.validationTier) {
      groupKeys = groupKeys.filter((k) => (tiers.get(geneNameFromAlleleKey(k))?.tier ?? 'Candidate') === filters.validationTier)
    }
    if (filters.sourceDatabases?.length && _geneDbMap) {
      groupKeys = groupKeys.filter((k) => {
        const dbs = _geneDbMap!.get(geneNameFromAlleleKey(k))
        return dbs && filters.sourceDatabases!.some((db) => dbs.has(db))
      })
    }
  }

  const total = groupKeys.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const pagedKeys = groupKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (pagedKeys.length === 0) {
    return { data: [], total, page, pageSize: PAGE_SIZE, totalPages }
  }

  const pagedIds = pagedKeys.flatMap((k) => groups.get(k)!).map(Number)
  const rows = await db
    .select({
      geneName: amrGenes.geneName,
      allele: amrGenes.allele,
      encodes: amrGenes.encodes,
      confersResistanceTo: amrGenes.confersResistanceTo,
      organismsTestedIn: amrGenes.organismsTestedIn,
      sourceDatabase: amrGenes.sourceDatabase,
    })
    .from(amrGenes)
    .where(inArray(amrGenes.id, pagedIds))

  const byKey = new Map<string, typeof rows>()
  for (const r of rows) {
    if (!r.geneName) continue
    const key = alleleGroupKey(r.geneName, r.allele)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(r)
  }

  const enriched: GeneAllele[] = pagedKeys.map((key) => {
    const groupRows = byKey.get(key) ?? []
    const first = groupRows[0]
    return {
      gene_name: first.geneName!,
      allele: first.allele || first.geneName!,
      encodes: groupRows.map((r) => r.encodes).find(Boolean) ?? null,
      paper_count: groupRows.length,
      databases: [...new Set(groupRows.map((r) => r.sourceDatabase).filter((d): d is string => !!d))].sort(),
      resistances: [...new Set(groupRows.flatMap((r) => r.confersResistanceTo ?? []))],
      organisms: [...new Set(groupRows.flatMap((r) => r.organismsTestedIn ?? []))],
      validation_tier: (tiers.get(first.geneName!)?.tier ?? 'Candidate') as ValidationTier,
    }
  })

  enriched.sort((a, b) => a.gene_name.localeCompare(b.gene_name) || a.allele.localeCompare(b.allele))

  return { data: enriched, total, page, pageSize: PAGE_SIZE, totalPages }
}

function mutationGroupKey(m: { gene_name: string; protein_change: string | null; nucleotide_change: string | null; id?: string }): string {
  if (m.protein_change) return `${m.gene_name}::p::${m.protein_change}`
  if (m.nucleotide_change) return `${m.gene_name}::n::${m.nucleotide_change}`
  return `${m.gene_name}::id::${m.id ?? ''}`
}

export async function browseMutations(filters: BrowseFilters, page: number = 1): Promise<PaginatedResult<AMRMutation>> {
  const [mutTiers, cachedGroups] = await Promise.all([getMutationValidationTiers(), getCachedMutationGroups()])

  let groups: Map<string, string[]>

  if (hasComplexMutationFilters(filters)) {
    const conditions = []
    if (filters.pmid) conditions.push(eq(amrMutations.paperPmid, filters.pmid))
    if (filters.search) {
      const p = `%${filters.search}%`
      conditions.push(
        or(
          alnumLike(amrMutations.nucleotideChange, filters.search),
          alnumLike(amrMutations.geneName, filters.search),
          alnumLike(amrMutations.proteinChange, filters.search),
          like(amrMutations.effectOnFunction, p),
          like(amrMutations.paperPmid, p),
          like(amrMutations.titlePmid, p)
        )
      )
    }
    if (filters.geneName) conditions.push(eq(amrMutations.geneName, filters.geneName))
    if (filters.antibiotic) conditions.push(jsonContains(amrMutations.confersResistanceTo, filters.antibiotic))
    if (filters.mutationType) {
      conditions.push(eq(amrMutations.mutationType, filters.mutationType as 'substitution' | 'insertion' | 'deletion' | 'frameshift' | 'other'))
    }
    if (filters.country) {
      conditions.push(filters.country === '__missing__' ? isNull(amrMutations.country) : eq(amrMutations.country, filters.country))
    }
    if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
      conditions.push(inArray(amrMutations.sourceDatabase, filters.sourceDatabases))
    }
    if (filters.status && filters.status !== 'all') conditions.push(eq(amrMutations.status, filters.status))
    else if (filters.curatedOnly) conditions.push(eq(amrMutations.status, 'curated'))

    const allIdentities = await db
      .select({
        id: amrMutations.id,
        geneName: amrMutations.geneName,
        proteinChange: amrMutations.proteinChange,
        nucleotideChange: amrMutations.nucleotideChange,
      })
      .from(amrMutations)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(amrMutations.geneName))

    groups = new Map<string, string[]>()
    for (const m of allIdentities) {
      const key = mutationGroupKey({ gene_name: m.geneName ?? '', protein_change: m.proteinChange, nucleotide_change: m.nucleotideChange, id: String(m.id) })
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(String(m.id))
    }
  } else {
    groups = cachedGroups
  }

  let groupKeys = [...groups.keys()].sort()
  if (filters.search && !hasComplexMutationFilters(filters)) {
    const s = normalizeAlnum(filters.search)
    groupKeys = groupKeys.filter((k) => normalizeAlnum(k).includes(s))
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

  const pagedIds = pagedKeys.flatMap((k) => groups.get(k)!).map(Number)
  const allData = await db.select().from(amrMutations).where(inArray(amrMutations.id, pagedIds))

  const enriched = allData.map((m) => ({
    ...toSnakeCase(m),
    validation_tier: (mutTiers.get(String(m.id))?.tier ?? 'Candidate') as ValidationTier,
    all_databases: mutTiers.get(String(m.id))?.databases ?? [m.sourceDatabase].filter(Boolean),
  })) as unknown as AMRMutation[]

  enriched.sort((a, b) => {
    const ka = mutationGroupKey(a as unknown as { gene_name: string; protein_change: string | null; nucleotide_change: string | null; id?: string })
    const kb = mutationGroupKey(b as unknown as { gene_name: string; protein_change: string | null; nucleotide_change: string | null; id?: string })
    return ka.localeCompare(kb)
  })

  return { data: enriched, total, page, pageSize: PAGE_SIZE, totalPages }
}

export async function getGeneById(id: string): Promise<AMRGene | null> {
  const rows = await db.select().from(amrGenes).where(eq(amrGenes.id, Number(id))).limit(1)
  if (!rows[0]) return null
  return toSnakeCase(rows[0]) as unknown as AMRGene
}

export async function getGeneAllPapers(geneName: string): Promise<AMRGene[]> {
  const rows = await db.select().from(amrGenes).where(eq(amrGenes.geneName, geneName)).orderBy(asc(amrGenes.paperPmid))
  return rows.map((r) => toSnakeCase(r)) as unknown as AMRGene[]
}

export async function getMutationById(id: string): Promise<AMRMutation | null> {
  const rows = await db.select().from(amrMutations).where(eq(amrMutations.id, Number(id))).limit(1)
  if (!rows[0]) return null
  return toSnakeCase(rows[0]) as unknown as AMRMutation
}

export async function getGeneFamilyData(family: string): Promise<AMRGene[]> {
  const [byPattern, byExact] = await Promise.all([
    db.select().from(amrGenes).where(like(amrGenes.geneName, `${family}-%`)).orderBy(asc(amrGenes.geneName)),
    db.select().from(amrGenes).where(eq(amrGenes.geneName, family)).orderBy(asc(amrGenes.allele)),
  ])

  const patternRows = byPattern.filter((g) => /^.+-\d+$/.test(g.geneName))
  const exactRows = byExact

  const seen = new Set<number>()
  return [...patternRows, ...exactRows]
    .filter((g) => {
      if (seen.has(g.id)) return false
      seen.add(g.id)
      return true
    })
    .map((r) => toSnakeCase(r)) as unknown as AMRGene[]
}

export async function getMutationsByGeneId(geneId: string): Promise<AMRMutation[]> {
  const rows = await db
    .select()
    .from(amrMutations)
    .where(eq(amrMutations.geneId, Number(geneId)))
    .orderBy(asc(amrMutations.mutationName))
  return rows.map((r) => toSnakeCase(r)) as unknown as AMRMutation[]
}

export async function browseGenesWithMutations(filters: BrowseFilters, page: number = 1): Promise<PaginatedResult<GeneWithMutationCount>> {
  const tiers = await getValidationTiers()

  let allowedGeneNames: string[] | null = null
  if (filters.mechanismClass) {
    const geneRows = await db.select({ geneName: amrGenes.geneName }).from(amrGenes).where(eq(amrGenes.mechanism, filters.mechanismClass))
    allowedGeneNames = [...new Set(geneRows.map((r) => r.geneName).filter(Boolean))]
  }

  const conditions = []
  if (filters.pmid) conditions.push(eq(amrMutations.paperPmid, filters.pmid))
  if (filters.validationTier) {
    const tierGenes = [...tiers.entries()].filter(([, info]) => info.tier === filters.validationTier).map(([g]) => g)
    if (tierGenes.length === 0) {
      return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    conditions.push(inArray(amrMutations.geneName, tierGenes))
  }
  if (filters.search) conditions.push(alnumLike(amrMutations.geneName, filters.search))
  if (allowedGeneNames !== null) {
    if (allowedGeneNames.length === 0) {
      return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
    }
    conditions.push(inArray(amrMutations.geneName, allowedGeneNames))
  }
  if (filters.antibiotic) conditions.push(jsonContains(amrMutations.confersResistanceTo, filters.antibiotic))
  if (filters.organism) conditions.push(jsonContains(amrMutations.organismsObservedIn, filters.organism))
  if (filters.country) {
    conditions.push(filters.country === '__missing__' ? isNull(amrMutations.country) : eq(amrMutations.country, filters.country))
  }
  if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
    conditions.push(inArray(amrMutations.sourceDatabase, filters.sourceDatabases))
  }
  if (filters.curatedOnly) conditions.push(eq(amrMutations.status, 'curated'))

  const data = await db
    .select({
      geneName: amrMutations.geneName,
      status: amrMutations.status,
      confersResistanceTo: amrMutations.confersResistanceTo,
      organismsObservedIn: amrMutations.organismsObservedIn,
      country: amrMutations.country,
      mutationType: amrMutations.mutationType,
    })
    .from(amrMutations)
    .where(conditions.length ? and(...conditions) : undefined)

  const statusPriority: Record<string, number> = { curated: 0, pending: 1, rejected: 2 }
  const groups = new Map<string, { count: number; statuses: CurationStatus[]; mutationTypes: Set<string>; resistances: Set<string> }>()

  for (const m of data) {
    if (!m.geneName) continue
    const existing = groups.get(m.geneName)
    if (existing) {
      existing.count++
      if (m.status) existing.statuses.push(m.status as CurationStatus)
      if (m.mutationType) existing.mutationTypes.add(m.mutationType)
      for (const r of m.confersResistanceTo || []) existing.resistances.add(r)
    } else {
      groups.set(m.geneName, {
        count: 1,
        statuses: m.status ? [m.status as CurationStatus] : [],
        mutationTypes: new Set(m.mutationType ? [m.mutationType] : []),
        resistances: new Set(m.confersResistanceTo || []),
      })
    }
  }

  const entries: GeneWithMutationCount[] = [...groups.entries()]
    .map(([gene_name, g]) => ({
      gene_name,
      mutation_count: g.count,
      best_status: g.statuses.reduce((best, s) => ((statusPriority[s] ?? 99) < (statusPriority[best] ?? 99) ? s : best), 'pending' as CurationStatus),
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
  const rows = await db.select().from(amrMutations).where(eq(amrMutations.geneName, geneName)).orderBy(asc(amrMutations.nucleotideChange))
  return rows.map((r) => toSnakeCase(r)) as unknown as AMRMutation[]
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
  const [genesRows, mutationsRows, paperRows] = await Promise.all([
    db.select().from(amrGenes).where(eq(amrGenes.paperPmid, pmid)).orderBy(asc(amrGenes.geneName)),
    db.select().from(amrMutations).where(eq(amrMutations.paperPmid, pmid)).orderBy(asc(amrMutations.nucleotideChange)),
    db.select({ keyFindings: papers.keyFindings }).from(papers).where(eq(papers.pmid, pmid)).limit(1),
  ])

  const genes = genesRows.map((r) => toSnakeCase(r)) as unknown as AMRGene[]
  const mutations = mutationsRows.map((r) => toSnakeCase(r)) as unknown as AMRMutation[]

  if (genes.length === 0 && mutations.length === 0) return null

  const title = genes[0]?.title_pmid ?? mutations[0]?.title_pmid ?? null
  const year = genes[0]?.year_pmid ?? mutations[0]?.year_pmid ?? null
  const geographic_location = genes[0]?.geographic_location ?? null
  const key_findings = paperRows[0]?.keyFindings ?? genes[0]?.key_findings ?? mutations[0]?.key_findings ?? null

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
  const geneWhere = [isNotNull(amrGenes.paperPmid)]
  const mutWhere = [isNotNull(amrMutations.paperPmid)]

  if (filters?.sourceDatabases && filters.sourceDatabases.length > 0) {
    geneWhere.push(inArray(amrGenes.sourceDatabase, filters.sourceDatabases))
    mutWhere.push(inArray(amrMutations.sourceDatabase, filters.sourceDatabases))
  }

  const [genesData, mutationsData] = await Promise.all([
    db
      .select({
        paperPmid: amrGenes.paperPmid,
        geneName: amrGenes.geneName,
        titlePmid: amrGenes.titlePmid,
        yearPmid: amrGenes.yearPmid,
        geographicLocation: amrGenes.geographicLocation,
        confersResistanceTo: amrGenes.confersResistanceTo,
        organismsTestedIn: amrGenes.organismsTestedIn,
        sourceDatabase: amrGenes.sourceDatabase,
      })
      .from(amrGenes)
      .where(and(...geneWhere)),
    db
      .select({ paperPmid: amrMutations.paperPmid, sourceDatabase: amrMutations.sourceDatabase })
      .from(amrMutations)
      .where(and(...mutWhere)),
  ])

  const paperMap = new Map<
    string,
    {
      title: string | null
      year: number | null
      geographic_location: string | null
      geneNames: Set<string>
      mutationCount: number
      antibiotics: Set<string>
      organisms: Set<string>
      source_database: string | null
    }
  >()

  for (const gene of genesData) {
    if (!gene.paperPmid) continue
    if (!paperMap.has(gene.paperPmid)) {
      paperMap.set(gene.paperPmid, {
        title: gene.titlePmid || null,
        year: gene.yearPmid || null,
        geographic_location: gene.geographicLocation || null,
        geneNames: new Set(),
        mutationCount: 0,
        antibiotics: new Set(),
        organisms: new Set(),
        source_database: gene.sourceDatabase || null,
      })
    }
    const entry = paperMap.get(gene.paperPmid)!
    if (gene.geneName) entry.geneNames.add(gene.geneName)
    for (const ab of gene.confersResistanceTo || []) entry.antibiotics.add(ab)
    for (const org of gene.organismsTestedIn || []) entry.organisms.add(org)
  }

  for (const mut of mutationsData) {
    if (!mut.paperPmid) continue
    if (paperMap.has(mut.paperPmid)) {
      paperMap.get(mut.paperPmid)!.mutationCount++
    } else {
      paperMap.set(mut.paperPmid, {
        title: null,
        year: null,
        geographic_location: null,
        geneNames: new Set(),
        mutationCount: 1,
        antibiotics: new Set(),
        organisms: new Set(),
        source_database: mut.sourceDatabase || null,
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
