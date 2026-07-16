'use server'

import { db } from '@/lib/db/client'
import { amrGenes, amrMutations } from '@/lib/db/schema'
import { getCurrentCurator } from '@/lib/actions/curator'
import { AMRGene, AMRMutation } from '@/lib/types'

export async function uploadGene(data: Partial<AMRGene>) {
  try {
    const curator = await getCurrentCurator()
    if (!curator) {
      throw new Error('Not authenticated as curator')
    }

    await db.insert(amrGenes).values({
      geneName: data.gene_name || '',
      allele: data.allele || null,
      encodes: data.encodes || null,
      mechanism: data.mechanism || null,
      resistanceMechanismClass: data.resistance_mechanism_class || null,
      confersResistanceTo: data.confers_resistance_to || null,
      organismsTestedIn: data.organisms_tested_in || null,
      roleInPaper: data.role_in_paper || null,
      validationMethod: data.validation_method || null,
      paperPmid: data.paper_pmid || null,
      keyFindings: data.key_findings || null,
      geographicLocation: data.geographic_location || null,
      titlePmid: data.title_pmid || null,
      yearPmid: data.year_pmid || null,
      sourceDatabase: 'Manually Uploaded',
      status: 'pending',
    })

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
  try {
    const curator = await getCurrentCurator()
    if (!curator) {
      throw new Error('Not authenticated as curator')
    }

    await db.insert(amrMutations).values({
      geneName: data.gene_name || '',
      notation: data.notation || null,
      nucleotideChange: data.nucleotide_change || '',
      proteinChange: data.protein_change || null,
      positionInMolecule: data.position_in_molecule || null,
      paperPmid: data.paper_pmid || null,
      confersResistanceTo: data.confers_resistance_to || null,
      organismsObservedIn: data.organisms_observed_in || null,
      effectOnFunction: data.effect_on_function || null,
      mutationType: (data.mutation_type as 'substitution' | 'insertion' | 'deletion' | 'frameshift' | 'other' | undefined) || null,
      keyFindings: data.key_findings || null,
      titlePmid: data.title_pmid || null,
      yearPmid: data.year_pmid || null,
      sourceDatabase: 'Manually Uploaded',
      status: 'pending',
    })

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
