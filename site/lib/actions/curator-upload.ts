'use server'

import { createClient } from '@/lib/supabase/server'
import { AMRGene, AMRMutation } from '@/lib/types'

export async function uploadGene(data: Partial<AMRGene>) {
  const supabase = await createClient()

  try {
    // Verify curator is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Not authenticated')
    }

    // Prepare gene data with defaults
    const geneData = {
      gene_name: data.gene_name || '',
      allele: data.allele || null,
      encodes: data.encodes || null,
      mechanism: data.mechanism || null,
      resistance_mechanism_class: data.resistance_mechanism_class || null,
      confers_resistance_to: data.confers_resistance_to || null,
      organisms_tested_in: data.organisms_tested_in || null,
      role_in_paper: data.role_in_paper || null,
      validation_method: data.validation_method || null,
      paper_pmid: data.paper_pmid || null,
      key_findings: data.key_findings || null,
      geographic_location: data.geographic_location || null,
      title_pmid: data.title_pmid || null,
      year_pmid: data.year_pmid || null,
      source_database: 'Manually Uploaded',
      status: 'pending' as const,
    }

    const { error } = await supabase
      .from('amr_genes')
      .insert([geneData])

    if (error) throw error

    return { success: true, message: 'Gene uploaded successfully' }
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err)
    return { success: false, error: message }
  }
}

export async function uploadMutation(data: Partial<AMRMutation>) {
  const supabase = await createClient()

  try {
    // Verify curator is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Not authenticated')
    }

    // Prepare mutation data with defaults
    const mutationData = {
      gene_name: data.gene_name || '',
      notation: data.notation || null,
      nucleotide_change: data.nucleotide_change || '',
      protein_change: data.protein_change || null,
      position_in_molecule: data.position_in_molecule || null,
      paper_pmid: data.paper_pmid || null,
      confers_resistance_to: data.confers_resistance_to || null,
      organisms_observed_in: data.organisms_observed_in || null,
      effect_on_function: data.effect_on_function || null,
      mutation_type: data.mutation_type || null,
      key_findings: data.key_findings || null,
      title_pmid: data.title_pmid || null,
      year_pmid: data.year_pmid || null,
      source_database: 'Manually Uploaded',
      status: 'pending' as const,
    }

    const { error } = await supabase
      .from('amr_mutations')
      .insert([mutationData])

    if (error) throw error

    return { success: true, message: 'Mutation uploaded successfully' }
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err)
    return { success: false, error: message }
  }
}
