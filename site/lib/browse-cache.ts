import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { FilterOptions } from '@/lib/types'

const CACHE_TTL = 3600 // 1 hour

function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

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
    sourceDatabases: ['Card Database', 'Reference Gene Catalog', 'ResFinder Database', 'Reslit'],
  }
}

export const getCachedFilterOptions = unstable_cache(
  _fetchFilterOptions,
  ['filter-options'],
  { revalidate: CACHE_TTL }
)
