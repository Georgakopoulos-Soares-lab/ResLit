'use server'

import { revalidatePath } from 'next/cache'
import { count, eq, and, or, inArray, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { amrGenes, amrMutations, curationNotes, curationProposals, curators, publicCuratorColumns } from '@/lib/db/schema'
import { toSnakeCase } from '@/lib/db/helpers'
import { getCurrentCurator as getSessionCurator, destroySession } from '@/lib/auth/session'
import { createProposal, EDITABLE_FIELDS, geneLabel, mutationLabel, sameValue } from '@/lib/curation/proposals'
import type { AMRGene, AMRMutation, Curator, CurationNote, CurationHistory } from '@/lib/types'

export async function getCurrentCurator(): Promise<Curator | null> {
  return getSessionCurator()
}

export async function updateCuratorName(name: string): Promise<void> {
  const curator = await getSessionCurator()
  if (!curator) return

  await db.update(curators).set({ name }).where(eq(curators.id, curator.id))
}

export async function getCuratorStats() {
  const [totalGenes, totalMutations, pendingGenes, pendingMutations, curatedGenes, curatedMutations] =
    await Promise.all([
      db.select({ n: count() }).from(amrGenes),
      db.select({ n: count() }).from(amrMutations),
      db.select({ n: count() }).from(amrGenes).where(eq(amrGenes.status, 'pending')),
      db.select({ n: count() }).from(amrMutations).where(eq(amrMutations.status, 'pending')),
      db.select({ n: count() }).from(amrGenes).where(eq(amrGenes.status, 'curated')),
      db.select({ n: count() }).from(amrMutations).where(eq(amrMutations.status, 'curated')),
    ])

  return {
    totalGenes: totalGenes[0]?.n || 0,
    totalMutations: totalMutations[0]?.n || 0,
    pendingGenes: pendingGenes[0]?.n || 0,
    pendingMutations: pendingMutations[0]?.n || 0,
    curatedGenes: curatedGenes[0]?.n || 0,
    curatedMutations: curatedMutations[0]?.n || 0,
  }
}

export async function getPendingItems(type: 'genes' | 'mutations', limit: number = 10) {
  if (type === 'genes') {
    return db
      .select()
      .from(amrGenes)
      .where(eq(amrGenes.status, 'pending'))
      .orderBy(desc(amrGenes.createdAt))
      .limit(limit)
  }

  const rows = await db
    .select({ mutation: amrMutations, gene: amrGenes })
    .from(amrMutations)
    .leftJoin(amrGenes, eq(amrMutations.geneId, amrGenes.id))
    .where(eq(amrMutations.status, 'pending'))
    .orderBy(desc(amrMutations.createdAt))
    .limit(limit)

  return rows.map((r) => ({ ...r.mutation, gene: r.gene }))
}

// Curator actions below never touch amr_genes / amr_mutations: each one
// records a pending proposal (lib/curation/proposals.ts) that only an admin
// can accept from /curator/review.

export async function updateGeneStatus(
  geneId: string | number,
  status: 'curated' | 'rejected',
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await getSessionCurator()
    if (!curator) {
      return { success: false, error: 'Not authenticated as curator' }
    }

    const numericId = Number(geneId)
    const [gene] = await db
      .select({ geneName: amrGenes.geneName, allele: amrGenes.allele, paperPmid: amrGenes.paperPmid, pmid: amrGenes.pmid })
      .from(amrGenes)
      .where(eq(amrGenes.id, numericId))
      .limit(1)

    if (!gene) {
      return { success: false, error: 'Gene not found' }
    }

    const action = status === 'curated' ? 'approve' : 'reject'
    if (await hasPendingDuplicate(curator.id, 'gene', String(numericId), action)) {
      return { success: false, error: `You already have a pending ${action} proposal for this gene` }
    }

    await createProposal(curator, {
      targetType: 'gene',
      targetId: String(numericId),
      action,
      changes: { allele: gene.allele || gene.geneName, gene_name: gene.geneName },
      note,
      entryLabel: geneLabel(gene),
      pmid: gene.paperPmid || gene.pmid,
    })

    revalidatePath('/curator/proposals')
    revalidatePath('/curator/review')

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to submit proposal' }
  }
}

export async function updateMutationStatus(
  mutationId: string | number,
  status: 'curated' | 'rejected',
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await getSessionCurator()
    if (!curator) {
      return { success: false, error: 'Not authenticated as curator' }
    }

    const numericId = Number(mutationId)
    const [mutation] = await db
      .select({
        geneName: amrMutations.geneName,
        proteinChange: amrMutations.proteinChange,
        nucleotideChange: amrMutations.nucleotideChange,
        mutationName: amrMutations.mutationName,
        paperPmid: amrMutations.paperPmid,
        pmid: amrMutations.pmid,
      })
      .from(amrMutations)
      .where(eq(amrMutations.id, numericId))
      .limit(1)

    if (!mutation) {
      return { success: false, error: 'Mutation not found' }
    }

    const action = status === 'curated' ? 'approve' : 'reject'
    if (await hasPendingDuplicate(curator.id, 'mutation', String(numericId), action)) {
      return { success: false, error: `You already have a pending ${action} proposal for this mutation` }
    }

    await createProposal(curator, {
      targetType: 'mutation',
      targetId: String(numericId),
      action,
      changes: { gene_name: mutation.geneName },
      note,
      entryLabel: mutationLabel(mutation),
      pmid: mutation.paperPmid || mutation.pmid,
    })

    revalidatePath('/curator/proposals')
    revalidatePath('/curator/review')

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to submit proposal' }
  }
}

export async function updateGene(
  geneId: string,
  updates: Partial<AMRGene>
): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await getSessionCurator()
    if (!curator) {
      return { success: false, error: 'Not authenticated as curator' }
    }

    const numericId = Number(geneId)
    const [currentGene] = await db.select().from(amrGenes).where(eq(amrGenes.id, numericId)).limit(1)
    if (!currentGene) {
      return { success: false, error: 'Gene not found' }
    }

    const diff = buildDiff(currentGene as unknown as Record<string, unknown>, editableUpdates('gene', updates))
    if (Object.keys(diff).length === 0) {
      return { success: false, error: 'No changes to propose' }
    }

    await createProposal(curator, {
      targetType: 'gene',
      targetId: String(numericId),
      // Renaming moves this allele to a different gene
      action: 'geneName' in diff ? 'reassign' : 'edit',
      changes: diff,
      entryLabel: geneLabel(currentGene),
      pmid: currentGene.paperPmid || currentGene.pmid,
    })

    revalidatePath('/curator/proposals')
    revalidatePath('/curator/review')

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to submit proposal' }
  }
}

export async function updateMutation(
  mutationId: string,
  updates: Partial<AMRMutation>
): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await getSessionCurator()
    if (!curator) {
      return { success: false, error: 'Not authenticated as curator' }
    }

    const numericId = Number(mutationId)
    const [currentMutation] = await db.select().from(amrMutations).where(eq(amrMutations.id, numericId)).limit(1)
    if (!currentMutation) {
      return { success: false, error: 'Mutation not found' }
    }

    const diff = buildDiff(currentMutation as unknown as Record<string, unknown>, editableUpdates('mutation', updates))
    if (Object.keys(diff).length === 0) {
      return { success: false, error: 'No changes to propose' }
    }

    await createProposal(curator, {
      targetType: 'mutation',
      targetId: String(numericId),
      // Changing the gene reassigns this mutation to a different gene
      action: 'geneName' in diff ? 'reassign' : 'edit',
      changes: diff,
      entryLabel: mutationLabel(currentMutation),
      pmid: currentMutation.paperPmid || currentMutation.pmid,
    })

    revalidatePath('/curator/proposals')
    revalidatePath('/curator/review')

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to submit proposal' }
  }
}

export async function addCurationNote(
  targetType: 'gene' | 'mutation',
  targetId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await getSessionCurator()
    if (!curator) {
      return { success: false, error: 'Not authenticated as curator' }
    }

    await db.insert(curationNotes).values({
      targetType,
      targetId,
      curatorId: curator.id,
      note,
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add note' }
  }
}

export async function getCurationNotes(targetType: 'gene' | 'mutation', targetId: string): Promise<CurationNote[]> {
  const rows = await db
    .select({ note: curationNotes, curator: publicCuratorColumns })
    .from(curationNotes)
    .leftJoin(curators, eq(curationNotes.curatorId, curators.id))
    .where(and(eq(curationNotes.targetType, targetType), eq(curationNotes.targetId, targetId)))
    .orderBy(desc(curationNotes.createdAt))

  return rows.map((r) => ({
    ...(toSnakeCase(r.note) as unknown as CurationNote),
    curator: r.curator ?? undefined,
  }))
}

/** Revision history for an entry, read from curation_proposals: accepted,
 * pending and declined proposals (labelled via proposal_status). Accepted
 * uploads are matched through applied_target_id. */
export async function getCurationHistory(
  targetType: 'gene' | 'mutation',
  targetId: string,
  allTargetIds?: string[]
): Promise<CurationHistory[]> {
  const ids = allTargetIds && allTargetIds.length > 0 ? allTargetIds : [targetId]

  const rows = await db
    .select({ proposal: curationProposals, curator: publicCuratorColumns })
    .from(curationProposals)
    .leftJoin(curators, eq(curationProposals.curatorId, curators.id))
    .where(
      and(
        eq(curationProposals.targetType, targetType),
        or(inArray(curationProposals.targetId, ids), inArray(curationProposals.appliedTargetId, ids))
      )
    )
    .orderBy(desc(curationProposals.createdAt))

  return rows.map(({ proposal: p, curator }) => {
    const result = p.result ?? {}
    const isStatusChange = p.action === 'approve' || p.action === 'reject'
    return {
      id: String(p.id),
      target_type: p.targetType,
      target_id: p.targetId ?? p.appliedTargetId ?? '',
      curator_id: p.curatorId,
      curator_name: p.curatorName,
      curator_email: p.curatorEmail,
      curator_affiliation: p.curatorAffiliation,
      action: p.action,
      previous_status: isStatusChange ? ((result.previous_status as string | null) ?? null) : null,
      new_status: isStatusChange ? ((result.new_status as string | null) ?? null) : null,
      changes: p.action === 'create' ? null : p.changes,
      created_at: p.createdAt,
      curator: curator ?? undefined,
      previous_tier: (result.previous_tier as string | null) ?? null,
      new_tier: (result.new_tier as string | null) ?? null,
      proposal_status: p.status,
      note: p.note,
      admin_comment: p.adminComment,
      reviewed_by_name: p.reviewedByName,
      reviewed_at: p.reviewedAt,
    }
  })
}

export async function signOut() {
  await destroySession()
  revalidatePath('/')
}

export async function getAllCurators(): Promise<Curator[]> {
  return db.select(publicCuratorColumns).from(curators).orderBy(curators.name)
}

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

/** camelCase -> snake_case-tolerant passthrough: accepts either the app's
 * snake_case field names (from lib/types.ts) or already-camelCase Drizzle
 * column keys, and returns only keys the schema actually knows about. */
function toDbColumns(updates: Record<string, unknown>): Record<string, unknown> {
  const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    out[camel(key)] = value
  }
  return out
}


/** Keeps only the fields a curator may propose editing (see EDITABLE_FIELDS). */
function editableUpdates(targetType: 'gene' | 'mutation', updates: Record<string, unknown>): Record<string, unknown> {
  const allowed = EDITABLE_FIELDS[targetType]
  return Object.fromEntries(Object.entries(toDbColumns(updates)).filter(([key]) => allowed.includes(key)))
}

function buildDiff(
  current: Record<string, unknown>,
  updates: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const [key, newVal] of Object.entries(updates)) {
    const oldVal = current[key]
    if (!sameValue(oldVal, newVal)) diff[key] = { old: oldVal ?? null, new: newVal }
  }
  return diff
}

async function hasPendingDuplicate(
  curatorId: string,
  targetType: 'gene' | 'mutation',
  targetId: string,
  action: 'approve' | 'reject'
): Promise<boolean> {
  const [row] = await db
    .select({ id: curationProposals.id })
    .from(curationProposals)
    .where(
      and(
        eq(curationProposals.curatorId, curatorId),
        eq(curationProposals.targetType, targetType),
        eq(curationProposals.targetId, targetId),
        eq(curationProposals.action, action),
        eq(curationProposals.status, 'pending')
      )
    )
    .limit(1)
  return !!row
}
