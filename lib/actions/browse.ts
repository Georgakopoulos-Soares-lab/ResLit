'use server'

import { createClient } from '@/lib/supabase/server'
import type { AMRGene, AMRMutation, FilterOptions, BrowseFilters, PaginatedResult, GeneWithMutationCount, CurationStatus, PaperEntry } from '@/lib/types'

const PAGE_SIZE = 20

export async function getFilterOptions(): Promise<FilterOptions> {
  const supabase = await createClient()

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
    supabase
      .from('distinct_mechanism_classes')
      .select('resistance_mechanism_class')
      .order('resistance_mechanism_class'),
    supabase
      .from('distinct_antibiotics')
      .select('antibiotic')
      .order('antibiotic'),
    supabase
      .from('amr_genes')
      .select('encodes')
      .not('encodes', 'is', null)
      .order('encodes'),
    supabase
      .from('distinct_organisms')
      .select('organism')
      .order('organism'),
    supabase
      .from('amr_genes')
      .select('geographic_location')
      .not('geographic_location', 'is', null)
      .order('geographic_location'),
    supabase
      .from('amr_mutations')
      .select('country')
      .not('country', 'is', null)
      .order('country'),
    supabase
      .from('amr_genes')
      .select('year')
      .not('year', 'is', null)
      .order('year'),
    supabase
      .from('amr_genes')
      .select('gene_name')
      .not('gene_name', 'is', null)
      .order('gene_name'),
    supabase
      .from('amr_mutations')
      .select('gene_name')
      .not('gene_name', 'is', null)
      .order('gene_name'),
    supabase
      .from('amr_mutations')
      .select('confers_resistance_to')
      .not('confers_resistance_to', 'is', null),
    supabase
      .from('amr_mutations')
      .select('mutation_type')
      .not('mutation_type', 'is', null)
      .order('mutation_type'),
    supabase
      .from('amr_genes')
      .select('source_database')
      .not('source_database', 'is', null)
      .order('source_database'),
    supabase
      .from('amr_mutations')
      .select('source_database')
      .not('source_database', 'is', null)
      .order('source_database'),
  ])

  const uniqueMechanismClasses = [...new Set(mechanismClasses?.map((r) => r.resistance_mechanism_class) || [])].filter(Boolean).sort() as string[]
  const uniqueAntibiotics = [...new Set(antibiotics?.map((r) => r.antibiotic) || [])].filter(Boolean).sort() as string[]
  const uniqueEncodes = [...new Set(encodesData?.map((r) => r.encodes) || [])].filter(Boolean).sort() as string[]
  const uniqueOrganisms = [...new Set(organisms?.map((r) => r.organism) || [])].filter(Boolean).sort() as string[]
  const uniqueCountries = [...new Set(countries?.map((r) => r.geographic_location) || [])].filter(Boolean).sort() as string[]
  const uniqueMutationCountries = [...new Set(mutationCountries?.map((r) => r.country) || [])].filter(Boolean).sort() as string[]
  const uniqueYears = [...new Set(years?.map((r) => r.year) || [])].filter(Boolean).sort((a, b) => b - a) as number[]
  const uniqueGeneNames = [...new Set(geneNames?.map((r) => r.gene_name) || [])].filter(Boolean).sort() as string[]
  const uniqueMutationGeneNames = [...new Set((mutationGeneData || []).map((r) => r.gene_name).filter(Boolean))].sort() as string[]
  const uniqueMutationAntibiotics = [...new Set((mutationAntibioticData || []).flatMap((r) => r.confers_resistance_to || []).filter(Boolean))].sort() as string[]
  const uniqueMutationTypes = [...new Set((mutationTypeData || []).map((r) => r.mutation_type).filter(Boolean))].sort() as string[]
  const allSourceDatabases = [
    ...new Set([
      ...(geneSourceDatabases?.map((r) => r.source_database).filter(Boolean) || []),
      ...(mutationSourceDatabases?.map((r) => r.source_database).filter(Boolean) || []),
    ]),
  ].sort() as string[]

  return {
    mechanismClasses: uniqueMechanismClasses,
    antibiotics: uniqueAntibiotics,
    encodes: uniqueEncodes,
    organisms: uniqueOrganisms,
    countries: uniqueCountries,
    mutationCountries: uniqueMutationCountries,
    years: uniqueYears,
    geneNames: uniqueGeneNames,
    mutationGeneNames: uniqueMutationGeneNames,
    mutationAntibiotics: uniqueMutationAntibiotics,
    mutationTypes: uniqueMutationTypes,
    sourceDatabases: allSourceDatabases,
  }
}

export async function browseGenes(
  filters: BrowseFilters,
  page: number = 1
): Promise<PaginatedResult<AMRGene>> {
  const supabase = await createClient()

  let query = supabase
    .from('amr_genes')
    .select('*', { count: 'exact' })

  // Apply filters
  if (filters.search) {
    query = query.or(
      `gene_name.ilike.%${filters.search}%,mechanism.ilike.%${filters.search}%,encodes.ilike.%${filters.search}%`
    )
  }

  if (filters.mechanismClass) {
    query = query.eq('resistance_mechanism_class', filters.mechanismClass)
  }

  if (filters.antibiotic) {
    query = query.contains('confers_resistance_to', [filters.antibiotic])
  }

  if (filters.encodes) {
    query = query.eq('encodes', filters.encodes)
  }

  if (filters.organism) {
    query = query.contains('organisms_tested_in', [filters.organism])
  }

  if (filters.country) {
    if (filters.country === '__missing__') {
      query = query.is('geographic_location', null)
    } else {
      query = query.eq('geographic_location', filters.country)
    }
  }

  if (filters.yearFrom) {
    query = query.gte('year', filters.yearFrom)
  }

  if (filters.yearTo) {
    query = query.lte('year', filters.yearTo)
  }

  // Apply source database multi-select filter
  if (filters.sourceDatabases && filters.sourceDatabases.length > 0) {
    // For multi-select, we need to apply an OR condition for each selected database
    const orConditions = filters.sourceDatabases
      .map((db) => `source_database.eq.${db}`)
      .join(',')
    query = query.or(orConditions)
  }

  // Apply curated only filter (use gene_status for gene-level validation)
  if (filters.curatedOnly) {
    query = query.eq('gene_status', 'curated')
  }

  // Pagination
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  query = query.order('gene_name', { ascending: true }).range(from, to)

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching genes:', error.message, error.details)
    return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
  }

  const total = count || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return {
    data: data || [],
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
  }
}

export async function browseMutations(
  filters: BrowseFilters,
  page: number = 1
): Promise<PaginatedResult<AMRMutation>> {
  const supabase = await createClient()

  let query = supabase
    .from('amr_mutations')
    .select('*', { count: 'exact' })

  // Apply filters
  if (filters.search) {
    query = query.or(
      `nucleotide_change.ilike.%${filters.search}%,gene_name.ilike.%${filters.search}%,protein_change.ilike.%${filters.search}%,effect_on_function.ilike.%${filters.search}%,paper_pmid.ilike.%${filters.search}%,title_pmid.ilike.%${filters.search}%`
    )
  }

  if (filters.geneName) {
    query = query.eq('gene_name', filters.geneName)
  }

  if (filters.antibiotic) {
    query = query.contains('confers_resistance_to', [filters.antibiotic])
  }

  if (filters.mutationType) {
    query = query.eq('mutation_type', filters.mutationType)
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

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  } else if (filters.curatedOnly) {
    query = query.eq('status', 'curated')
  }

  // Pagination
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  query = query.order('mutation_name', { ascending: true }).range(from, to)

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching mutations:', error.message, error.details)
    return { data: [], total: 0, page, pageSize: PAGE_SIZE, totalPages: 0 }
  }

  const total = count || 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return {
    data: data || [],
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

  // mechanismClass lives on amr_genes — resolve to gene names first
  let allowedGeneNames: string[] | null = null
  if (filters.mechanismClass) {
    const { data: geneRows } = await supabase
      .from('amr_genes')
      .select('gene_name')
      .eq('resistance_mechanism_class', filters.mechanismClass)
    allowedGeneNames = [...new Set((geneRows || []).map((r) => r.gene_name).filter(Boolean))]
  }

  let query = supabase
    .from('amr_mutations')
    .select('gene_name, status, confers_resistance_to, organisms_observed_in, country, mutation_type')
    .not('gene_name', 'is', null)

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
