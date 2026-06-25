import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { FilterOptions, ValidationTier, ValidationInfo, ConfirmationReason } from '@/lib/types'

const EXTERNAL_DATABASES = ['Card Database', 'ResFinder Database', 'Reference Gene Catalog', 'ResFinder', 'CARD', 'Card']

const CACHE_TTL = 300 // 5 minutes

function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type SerializedValidationInfo = { tier: ValidationTier; reason?: ConfirmationReason; databases?: string[] }

// --- Validation Tiers (genes) ---

async function _fetchValidationTiers(): Promise<Record<string, SerializedValidationInfo>> {
  const supabase = createPublicClient()

  const allRows: { gene_name: string; source_database: string; paper_pmid: string; gene_status: string }[] = []
  const batchSize = 1000
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('amr_genes')
      .select('gene_name, source_database, paper_pmid, gene_status')
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < batchSize) break
    offset += batchSize
  }

  if (allRows.length === 0) return {}

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

  const result: Record<string, SerializedValidationInfo> = {}
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
    result[gene] = { tier, reason }
  }
  return result
}

export const getCachedValidationTiers = unstable_cache(
  _fetchValidationTiers,
  ['validation-tiers'],
  { revalidate: CACHE_TTL }
)

// --- Mutation Validation Tiers ---

async function _fetchMutationValidationTiers(): Promise<Record<string, SerializedValidationInfo>> {
  const supabase = createPublicClient()

  const allRows: { id: string; gene_name: string; protein_change: string | null; nucleotide_change: string | null; source_database: string; paper_pmid: string | null; status: string }[] = []
  const batchSize = 1000
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('amr_mutations')
      .select('id, gene_name, protein_change, nucleotide_change, source_database, paper_pmid, status')
      .range(offset, offset + batchSize - 1)
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < batchSize) break
    offset += batchSize
  }

  if (allRows.length === 0) return {}

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

  const result: Record<string, SerializedValidationInfo> = {}
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

    result[r.id] = { tier, reason, databases: [...databases].sort() }
  }

  return result
}

export const getCachedMutationValidationTiers = unstable_cache(
  _fetchMutationValidationTiers,
  ['mutation-validation-tiers'],
  { revalidate: CACHE_TTL }
)

// --- Filter Options ---

async function _fetchFilterOptions(): Promise<FilterOptions> {
  const supabase = createPublicClient()

  const [
    { data: mechanismClasses },
    { data: antibiotics },
    { data: encodesData },
    { data: organisms },
    { data: countries },
    { data: mutationCountries },
    { data: years },
    { data: geneNames },
    { data: mutationGeneData },
    { data: mutationAntibioticData },
    { data: mutationTypeData },
    { data: geneSourceDatabases },
    { data: mutationSourceDatabases },
  ] = await Promise.all([
    supabase.from('amr_genes').select('mechanism').not('mechanism', 'is', null).order('mechanism'),
    supabase.from('distinct_antibiotics').select('antibiotic').order('antibiotic'),
    supabase.from('amr_genes').select('encodes').not('encodes', 'is', null).order('encodes'),
    supabase.from('distinct_organisms').select('organism').order('organism'),
    supabase.from('amr_genes').select('geographic_location').not('geographic_location', 'is', null).order('geographic_location'),
    supabase.from('amr_mutations').select('country').not('country', 'is', null).order('country'),
    supabase.from('amr_genes').select('year').not('year', 'is', null).order('year'),
    supabase.from('amr_genes').select('gene_name').not('gene_name', 'is', null).order('gene_name'),
    supabase.from('amr_mutations').select('gene_name').not('gene_name', 'is', null).order('gene_name'),
    supabase.from('amr_mutations').select('confers_resistance_to').not('confers_resistance_to', 'is', null),
    supabase.from('amr_mutations').select('mutation_type').not('mutation_type', 'is', null).order('mutation_type'),
    supabase.from('amr_genes').select('source_database').not('source_database', 'is', null).order('source_database'),
    supabase.from('amr_mutations').select('source_database').not('source_database', 'is', null).order('source_database'),
  ])

  return {
    mechanismClasses: [...new Set(mechanismClasses?.map((r) => r.mechanism) || [])].filter(Boolean).sort() as string[],
    antibiotics: [...new Set(antibiotics?.map((r) => r.antibiotic) || [])].filter(Boolean).sort() as string[],
    encodes: [...new Set(encodesData?.map((r) => r.encodes) || [])].filter(Boolean).sort() as string[],
    organisms: [...new Set(organisms?.map((r) => r.organism) || [])].filter(Boolean).sort() as string[],
    countries: [...new Set(countries?.map((r) => r.geographic_location) || [])].filter(Boolean).sort() as string[],
    mutationCountries: [...new Set(mutationCountries?.map((r) => r.country) || [])].filter(Boolean).sort() as string[],
    years: [...new Set(years?.map((r) => r.year) || [])].filter(Boolean).sort((a, b) => b - a) as number[],
    geneNames: [...new Set(geneNames?.map((r) => r.gene_name) || [])].filter(Boolean).sort() as string[],
    mutationGeneNames: [...new Set((mutationGeneData || []).map((r) => r.gene_name).filter(Boolean))].sort() as string[],
    mutationAntibiotics: [...new Set((mutationAntibioticData || []).flatMap((r) => r.confers_resistance_to || []).filter(Boolean))].sort() as string[],
    mutationTypes: [...new Set((mutationTypeData || []).map((r) => r.mutation_type).filter(Boolean))].sort() as string[],
    sourceDatabases: [
      ...new Set([
        'Reslit',
        ...(geneSourceDatabases?.map((r) => r.source_database).filter(Boolean) || []),
        ...(mutationSourceDatabases?.map((r) => r.source_database).filter(Boolean) || []),
      ]),
    ].sort() as string[],
  }
}

export const getCachedFilterOptions = unstable_cache(
  _fetchFilterOptions,
  ['filter-options'],
  { revalidate: CACHE_TTL }
)
