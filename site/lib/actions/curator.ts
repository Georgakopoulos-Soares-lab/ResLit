'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { invalidateTierCaches } from '@/lib/actions/browse'
import type { AMRGene, AMRMutation, Curator, CurationNote, CurationHistory } from '@/lib/types'

export async function getCurrentCurator(): Promise<Curator | null> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: curator } = await supabase
    .from('curators')
    .select('*')
    .eq('id', user.id)
    .single()

  return curator
}

export async function updateCuratorName(name: string): Promise<void> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('curators')
    .update({ name })
    .eq('id', user.id)
}

export async function getCuratorStats() {
  const supabase = await createClient()
  
  const [
    { count: totalGenes },
    { count: totalMutations },
    { count: pendingGenes },
    { count: pendingMutations },
    { count: curatedGenes },
    { count: curatedMutations },
  ] = await Promise.all([
    supabase.from('amr_genes').select('id', { count: 'exact', head: true }),
    supabase.from('amr_mutations').select('id', { count: 'exact', head: true }),
    supabase.from('amr_genes').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('amr_mutations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('amr_genes').select('id', { count: 'exact', head: true }).eq('status', 'curated'),
    supabase.from('amr_mutations').select('id', { count: 'exact', head: true }).eq('status', 'curated'),
  ])

  return {
    totalGenes: totalGenes || 0,
    totalMutations: totalMutations || 0,
    pendingGenes: pendingGenes || 0,
    pendingMutations: pendingMutations || 0,
    curatedGenes: curatedGenes || 0,
    curatedMutations: curatedMutations || 0,
  }
}

export async function getPendingItems(type: 'genes' | 'mutations', limit: number = 10) {
  const supabase = await createClient()
  
  if (type === 'genes') {
    const { data } = await supabase
      .from('amr_genes')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit)
    
    return data || []
  } else {
    const { data } = await supabase
      .from('amr_mutations')
      .select('*, gene:amr_genes(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit)
    
    return data || []
  }
}

export async function updateGeneStatus(
  geneId: string | number, 
  status: 'curated' | 'rejected',
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, error: 'Not authenticated as curator' }
  }

  // Get current gene status and allele
  const { data: gene } = await supabase
    .from('amr_genes')
    .select('status, gene_name, allele')
    .eq('id', Number(geneId))
    .single()

  if (!gene) {
    return { success: false, error: 'Gene not found' }
  }

  // Update this row's status and curator info
  const { error: updateError } = await supabase
    .from('amr_genes')
    .update({
      status,
      gene_status: status,
      validated_by: curator.id,
      curator_name: curator.name,
      curator_email: curator.email,
      curator_affiliation: curator.affiliation,
      validated_at: status === 'curated' ? new Date().toISOString() : null
    })
    .eq('id', Number(geneId))

  // When approving, propagate gene_status to all alleles of the same gene
  if (!updateError && status === 'curated' && gene.gene_name) {
    await supabase
      .from('amr_genes')
      .update({ gene_status: 'curated' })
      .eq('gene_name', gene.gene_name)
  }

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log curation history
  const { error: historyError } = await supabase.from('curation_history').insert({
    target_type: 'gene',
    target_id: String(geneId),
    curator_id: curator.id,
    curator_email: curator.email,
    curator_name: curator.name,
    curator_affiliation: curator.affiliation,
    action: status === 'curated' ? 'approve' : 'reject',
    previous_status: gene.status,
    new_status: status,
    changes: { allele: gene.allele || gene.gene_name, gene_name: gene.gene_name },
  })
  if (historyError) {
    console.error('Failed to log curation history:', historyError.message)
  }

  // Add note if provided
  if (note) {
    await supabase.from('curation_notes').insert({
      target_type: 'gene',
      target_id: String(geneId),
      curator_id: curator.id,
      curator_email: curator.email,
      curator_name: curator.name,
      curator_affiliation: curator.affiliation,
      note,
    })
  }

  invalidateTierCaches()
  revalidatePath('/curator/dashboard')
  revalidatePath('/curator/genes')
  revalidatePath('/browse/genes')
  revalidatePath(`/browse/genes/${encodeURIComponent(gene.gene_name)}`)

  return { success: true }
}

export async function updateMutationStatus(
  mutationId: string | number, 
  status: 'curated' | 'rejected',
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, error: 'Not authenticated as curator' }
  }

  // Get current mutation status
  const { data: mutation } = await supabase
    .from('amr_mutations')
    .select('status')
    .eq('id', Number(mutationId))
    .single()

  if (!mutation) {
    return { success: false, error: 'Mutation not found' }
  }

  // Update mutation status and curator info
  const { error: updateError } = await supabase
    .from('amr_mutations')
    .update({ 
      status,
      validated_by: curator.id,
      curator_name: curator.name,
      curator_email: curator.email,
      curator_affiliation: curator.affiliation,
      validated_at: status === 'curated' ? new Date().toISOString() : null
    })
    .eq('id', Number(mutationId))

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log curation history
  await supabase.from('curation_history').insert({
    target_type: 'mutation',
    target_id: String(mutationId),
    curator_id: curator.id,
    curator_email: curator.email,
    curator_name: curator.name,
    curator_affiliation: curator.affiliation,
    action: status === 'curated' ? 'approve' : 'reject',
    previous_status: mutation.status,
    new_status: status,
  })

  // Add note if provided
  if (note) {
    await supabase.from('curation_notes').insert({
      target_type: 'mutation',
      target_id: String(mutationId),
      curator_id: curator.id,
      curator_email: curator.email,
      curator_name: curator.name,
      curator_affiliation: curator.affiliation,
      note,
    })
  }

  invalidateTierCaches()
  revalidatePath('/curator/dashboard')
  revalidatePath('/curator/mutations')
  revalidatePath('/browse/mutations')
  revalidatePath(`/browse/mutations/${mutationId}`)

  return { success: true }
}

export async function updateGene(
  geneId: string,
  updates: Partial<AMRGene>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, error: 'Not authenticated as curator' }
  }

  // Get current gene data for history
  const { data: currentGene } = await supabase
    .from('amr_genes')
    .select('*')
    .eq('id', geneId)
    .single()

  if (!currentGene) {
    return { success: false, error: 'Gene not found' }
  }

  // Remove id and timestamps from updates
  const { id, created_at, updated_at, ...safeUpdates } = updates as AMRGene

  const { error: updateError } = await supabase
    .from('amr_genes')
    .update(safeUpdates)
    .eq('id', geneId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Build field-level diff (only changed fields)
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const [key, newVal] of Object.entries(safeUpdates)) {
    const oldVal = (currentGene as Record<string, unknown>)[key]
    const oldStr = Array.isArray(oldVal) ? JSON.stringify(oldVal) : String(oldVal ?? '')
    const newStr = Array.isArray(newVal) ? JSON.stringify(newVal) : String(newVal ?? '')
    if (oldStr !== newStr) diff[key] = { old: oldVal, new: newVal }
  }

  await supabase.from('curation_history').insert({
    target_type: 'gene',
    target_id: geneId,
    curator_id: curator.id,
    curator_email: curator.email,
    curator_name: curator.name,
    curator_affiliation: curator.affiliation,
    action: 'edit',
    previous_status: currentGene.status,
    new_status: safeUpdates.status || currentGene.status,
    changes: Object.keys(diff).length > 0 ? diff : null,
  })

  revalidatePath('/curator/dashboard')
  revalidatePath('/browse/genes')
  revalidatePath(`/browse/genes/${encodeURIComponent(currentGene.gene_name)}`)

  return { success: true }
}

export async function updateMutation(
  mutationId: string,
  updates: Partial<AMRMutation>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, error: 'Not authenticated as curator' }
  }

  const { data: currentMutation } = await supabase
    .from('amr_mutations')
    .select('*')
    .eq('id', mutationId)
    .single()

  if (!currentMutation) {
    return { success: false, error: 'Mutation not found' }
  }

  const { id, created_at, updated_at, ...safeUpdates } = updates as AMRMutation

  const { error: updateError } = await supabase
    .from('amr_mutations')
    .update(safeUpdates)
    .eq('id', mutationId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const [key, newVal] of Object.entries(safeUpdates)) {
    const oldVal = (currentMutation as Record<string, unknown>)[key]
    const oldStr = Array.isArray(oldVal) ? JSON.stringify(oldVal) : String(oldVal ?? '')
    const newStr = Array.isArray(newVal) ? JSON.stringify(newVal) : String(newVal ?? '')
    if (oldStr !== newStr) diff[key] = { old: oldVal, new: newVal }
  }

  await supabase.from('curation_history').insert({
    target_type: 'mutation',
    target_id: mutationId,
    curator_id: curator.id,
    curator_email: curator.email,
    curator_name: curator.name,
    curator_affiliation: curator.affiliation,
    action: 'edit',
    previous_status: currentMutation.status,
    new_status: safeUpdates.status ?? currentMutation.status,
    changes: Object.keys(diff).length > 0 ? diff : null,
  })

  revalidatePath('/curator/mutations')
  revalidatePath('/browse/mutations')
  revalidatePath(`/browse/mutations/${mutationId}`)

  return { success: true }
}

export async function addCurationNote(
  targetType: 'gene' | 'mutation',
  targetId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, error: 'Not authenticated as curator' }
  }

  const { error } = await supabase.from('curation_notes').insert({
    target_type: targetType,
    target_id: targetId,
    curator_id: curator.id,
    note,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function getCurationNotes(
  targetType: 'gene' | 'mutation',
  targetId: string
): Promise<CurationNote[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('curation_notes')
    .select('*, curator:curators(*)')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })

  return data || []
}

export async function getCurationHistory(
  targetType: 'gene' | 'mutation',
  targetId: string,
  allTargetIds?: string[]
): Promise<CurationHistory[]> {
  const supabase = await createClient()

  let query = supabase
    .from('curation_history')
    .select('*, curator:curators(*)')
    .eq('target_type', targetType)

  if (allTargetIds && allTargetIds.length > 0) {
    query = query.in('target_id', allTargetIds)
  } else {
    query = query.eq('target_id', targetId)
  }

  const { data } = await query.order('created_at', { ascending: false })

  return data || []
}

export async function registerCurator(
  name: string,
  affiliation: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Idempotent: if already registered, just succeed
  const { data: existing } = await supabase
    .from('curators')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (existing) return { success: true }

  const { error } = await supabase.from('curators').insert({
    id: user.id,
    email: user.email!,
    name,
    affiliation,
  })

  if (error) return { success: false, error: error.message }

  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/')
}

export async function getAllCurators(): Promise<Curator[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('curators')
    .select('*')
    .order('name')

  return data || []
}
