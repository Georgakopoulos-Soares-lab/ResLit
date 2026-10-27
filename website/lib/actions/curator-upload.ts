'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentCurator } from '@/lib/actions/curator'
import { createProposal, geneLabel, mutationLabel, normalizeMutationType } from '@/lib/curation/proposals'
import { AMRGene, AMRMutation } from '@/lib/types'

// Uploads are submitted as 'create' proposals; the row is only inserted
// into amr_genes / amr_mutations when an admin accepts it.

export async function uploadGene(data: Partial<AMRGene>) {
  try {
    const curator = await getCurrentCurator()
    if (!curator) {
      throw new Error('Not authenticated as curator')
    }

    const values = {
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
    }

    await createProposal(curator, {
      targetType: 'gene',
      targetId: null,
      action: 'create',
      changes: { values },
      entryLabel: geneLabel(values),
      pmid: values.paperPmid,
    })
    revalidatePath('/curator/proposals')
    revalidatePath('/curator/review')

    return { success: true, message: 'Gene submitted for admin review' }
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

    const values = {
      geneName: data.gene_name || '',
      notation: data.notation || null,
      nucleotideChange: data.nucleotide_change || '',
      proteinChange: data.protein_change || null,
      positionInMolecule: data.position_in_molecule || null,
      paperPmid: data.paper_pmid || null,
      confersResistanceTo: data.confers_resistance_to || null,
      organismsObservedIn: data.organisms_observed_in || null,
      effectOnFunction: data.effect_on_function || null,
      mutationType: normalizeMutationType(data.mutation_type),
      keyFindings: data.key_findings || null,
      titlePmid: data.title_pmid || null,
      yearPmid: data.year_pmid || null,
      sourceDatabase: 'Manually Uploaded',
    }

    await createProposal(curator, {
      targetType: 'mutation',
      targetId: null,
      action: 'create',
      changes: { values },
      entryLabel: mutationLabel(values),
      pmid: values.paperPmid,
    })
    revalidatePath('/curator/proposals')
    revalidatePath('/curator/review')

    return { success: true, message: 'Mutation submitted for admin review' }
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
