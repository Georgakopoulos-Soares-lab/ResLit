'use server'

import { createClient } from '@/lib/supabase/server'
import type { AMRGene, AMRMutation, BrowseFilters } from '@/lib/types'

interface GeneEnrichment {
  pmidsByGene: Map<string, Set<string>>
  validatorByGeneId: Map<string, string>
  commentsByGeneId: Map<string, string[]>
}

// Convert genes to CSV format using new schema columns
function genesToCSV(genes: AMRGene[], enrichment: GeneEnrichment): string {
  const headers = [
    'Gene Name',
    'Resistance Mechanism Class',
    'Confers Resistance To',
    'Organisms Tested In',
    'Encodes',
    'Mechanism',
    'Validation Method',
    'Role in Paper',
    'Country',
    'Year',
    'PMID',
    'Status',
    'Validated',
    'Validated From',
    'Comments',
  ]

  const rows = genes.map((gene) => {
    const id = String(gene.id)
    const allPmids = [...(enrichment.pmidsByGene.get(gene.gene_name) ?? [])].join('; ')
    const validator = enrichment.validatorByGeneId.get(id) ?? ''
    const comments = (enrichment.commentsByGeneId.get(id) ?? [])
      .map((c) => c.replace(/"/g, '""'))
      .join(' | ')
    const isValidated = gene.status === 'curated'

    return [
      gene.gene_name,
      gene.resistance_mechanism_class || '',
      (gene.confers_resistance_to || []).join('; '),
      (gene.organisms_tested_in || []).join('; '),
      gene.encodes || '',
      (gene.mechanism || '').replace(/"/g, '""'),
      (gene.validation_method || '').replace(/"/g, '""'),
      gene.role_in_paper || '',
      gene.geographic_location || '',
      gene.year?.toString() || '',
      allPmids,
      'Reslit',
      isValidated ? 'Validated' : 'No',
      validator,
      comments,
    ]
  })

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}

async function fetchGeneEnrichment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  genes: AMRGene[]
): Promise<GeneEnrichment> {
  if (genes.length === 0) {
    return {
      pmidsByGene: new Map(),
      validatorByGeneId: new Map(),
      commentsByGeneId: new Map(),
    }
  }

  const geneNames = [...new Set(genes.map((g) => g.gene_name))]
  const geneIds = genes.map((g) => String(g.id))

  const [pmidsResult, curationResult, commentsResult] = await Promise.all([
    supabase
      .from('amr_genes')
      .select('gene_name, paper_pmid')
      .in('gene_name', geneNames)
      .not('paper_pmid', 'is', null),
    supabase
      .from('curation_history')
      .select('target_id, curator_name, curator_email')
      .in('target_id', geneIds)
      .eq('action', 'approve')
      .order('created_at', { ascending: false }),
    supabase
      .from('comments')
      .select('target_id, content')
      .eq('target_type', 'gene')
      .in('target_id', geneIds),
  ])

  const pmidsByGene = new Map<string, Set<string>>()
  for (const row of pmidsResult.data || []) {
    if (!pmidsByGene.has(row.gene_name)) pmidsByGene.set(row.gene_name, new Set())
    pmidsByGene.get(row.gene_name)!.add(row.paper_pmid)
  }

  const validatorByGeneId = new Map<string, string>()
  for (const row of curationResult.data || []) {
    if (!validatorByGeneId.has(row.target_id)) {
      validatorByGeneId.set(row.target_id, row.curator_name || row.curator_email || '')
    }
  }

  const commentsByGeneId = new Map<string, string[]>()
  for (const row of commentsResult.data || []) {
    if (!commentsByGeneId.has(row.target_id)) commentsByGeneId.set(row.target_id, [])
    commentsByGeneId.get(row.target_id)!.push(row.content)
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
    const comments = (enrichment.commentsByMutationId.get(id) ?? [])
      .map((c) => c.replace(/"/g, '""'))
      .join(' | ')
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

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}

async function fetchMutationEnrichment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mutations: AMRMutation[]
): Promise<MutationEnrichment> {
  if (mutations.length === 0) {
    return {
      pmidsByGene: new Map(),
      validatorByMutationId: new Map(),
      commentsByMutationId: new Map(),
    }
  }

  const geneNames = [...new Set(mutations.map((m) => m.gene_name).filter(Boolean))]
  const mutationIds = mutations.map((m) => String(m.id))

  const [pmidsResult, curationResult, commentsResult] = await Promise.all([
    supabase
      .from('amr_mutations')
      .select('gene_name, paper_pmid')
      .in('gene_name', geneNames)
      .not('paper_pmid', 'is', null),
    supabase
      .from('curation_history')
      .select('target_id, curator_name, curator_email')
      .in('target_id', mutationIds)
      .eq('action', 'approve')
      .order('created_at', { ascending: false }),
    supabase
      .from('comments')
      .select('target_id, content')
      .eq('target_type', 'mutation')
      .in('target_id', mutationIds),
  ])

  const pmidsByGene = new Map<string, Set<string>>()
  for (const row of pmidsResult.data || []) {
    if (!pmidsByGene.has(row.gene_name)) pmidsByGene.set(row.gene_name, new Set())
    pmidsByGene.get(row.gene_name)!.add(row.paper_pmid)
  }

  const validatorByMutationId = new Map<string, string>()
  for (const row of curationResult.data || []) {
    if (!validatorByMutationId.has(row.target_id)) {
      validatorByMutationId.set(row.target_id, row.curator_name || row.curator_email || '')
    }
  }

  const commentsByMutationId = new Map<string, string[]>()
  for (const row of commentsResult.data || []) {
    if (!commentsByMutationId.has(row.target_id)) commentsByMutationId.set(row.target_id, [])
    commentsByMutationId.get(row.target_id)!.push(row.content)
  }

  return { pmidsByGene, validatorByMutationId, commentsByMutationId }
}

export async function downloadAllGenes(curatedOnly: boolean = false): Promise<{ csv: string; count: number }> {
  const supabase = await createClient()

  let query = supabase.from('amr_genes').select('*').order('gene_name')

  if (curatedOnly) {
    query = query.eq('status', 'curated')
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching genes for download:', error)
    return { csv: '', count: 0 }
  }

  const genes = data || []
  const enrichment = await fetchGeneEnrichment(supabase, genes)

  return {
    csv: genesToCSV(genes, enrichment),
    count: genes.length,
  }
}

export async function downloadAllMutations(curatedOnly: boolean = false): Promise<{ csv: string; count: number }> {
  const supabase = await createClient()

  let query = supabase.from('amr_mutations').select('*').order('nucleotide_change')

  if (curatedOnly) {
    query = query.eq('status', 'curated')
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching mutations for download:', error)
    return { csv: '', count: 0 }
  }

  const mutations = data || []
  const enrichment = await fetchMutationEnrichment(supabase, mutations)

  return {
    csv: mutationsToCSV(mutations, enrichment),
    count: mutations.length,
  }
}

export async function downloadFilteredGenes(filters: BrowseFilters): Promise<{ csv: string; count: number }> {
  const supabase = await createClient()

  let query = supabase.from('amr_genes').select('*').order('gene_name')

  // Apply filters
  if (filters.curatedOnly) {
    query = query.eq('status', 'curated')
  }

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

  const { data, error } = await query

  if (error) {
    console.error('Error fetching filtered genes for download:', error)
    return { csv: '', count: 0 }
  }

  const genes = data || []
  const enrichment = await fetchGeneEnrichment(supabase, genes)

  return {
    csv: genesToCSV(genes, enrichment),
    count: genes.length,
  }
}

export async function downloadFilteredMutations(filters: BrowseFilters): Promise<{ csv: string; count: number }> {
  const supabase = await createClient()

  let query = supabase.from('amr_mutations').select('*').order('nucleotide_change')

  if (filters.curatedOnly) {
    query = query.eq('status', 'curated')
  }

  if (filters.search) {
    query = query.or(
      `nucleotide_change.ilike.%${filters.search}%,gene_name.ilike.%${filters.search}%,protein_change.ilike.%${filters.search}%,effect_on_function.ilike.%${filters.search}%,paper_pmid.ilike.%${filters.search}%`
    )
  }

  if (filters.geneName) {
    query = query.eq('gene_name', filters.geneName)
  }

  if (filters.mechanismClass) {
    query = query.eq('resistance_mechanism_class', filters.mechanismClass)
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

  const { data, error } = await query

  if (error) {
    console.error('Error fetching filtered mutations for download:', error)
    return { csv: '', count: 0 }
  }

  const mutations = data || []
  const enrichment = await fetchMutationEnrichment(supabase, mutations)

  return {
    csv: mutationsToCSV(mutations, enrichment),
    count: mutations.length,
  }
}

// Get download statistics
export async function getDownloadStats(): Promise<{
  totalGenes: number
  curatedGenes: number
  totalMutations: number
  curatedMutations: number
}> {
  const supabase = await createClient()

  const [
    { count: totalGenes },
    { count: curatedGenes },
    { count: totalMutations },
    { count: curatedMutations },
  ] = await Promise.all([
    supabase.from('amr_genes').select('*', { count: 'exact', head: true }),
    supabase
      .from('amr_genes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'curated'),
    supabase.from('amr_mutations').select('*', { count: 'exact', head: true }),
    supabase
      .from('amr_mutations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'curated'),
  ])

  return {
    totalGenes: totalGenes || 0,
    curatedGenes: curatedGenes || 0,
    totalMutations: totalMutations || 0,
    curatedMutations: curatedMutations || 0,
  }
}
