'use server'

import { revalidatePath } from 'next/cache'
import { count, eq, and, inArray, desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { amrGenes, amrMutations, curationHistory, curationNotes, curators, publicCuratorColumns } from '@/lib/db/schema'
import { toSnakeCase } from '@/lib/db/helpers'
import { getCurrentCurator as getSessionCurator, destroySession } from '@/lib/auth/session'
import { invalidateTierCaches, getValidationTiers } from '@/lib/actions/browse'
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
      .select({ status: amrGenes.status, geneName: amrGenes.geneName, allele: amrGenes.allele })
      .from(amrGenes)
      .where(eq(amrGenes.id, numericId))
      .limit(1)

    if (!gene) {
      return { success: false, error: 'Gene not found' }
    }

    const tiers = await getValidationTiers()
    const previousTier = tiers.get(gene.geneName)?.tier ?? 'Candidate'

    await db
      .update(amrGenes)
      .set({
        status,
        geneStatus: status,
        validatedBy: curator.id,
        curatorName: curator.name,
        curatorEmail: curator.email,
        curatorAffiliation: curator.affiliation,
        validatedAt: status === 'curated' ? new Date().toISOString() : null,
      })
      .where(eq(amrGenes.id, numericId))

    // When approving, propagate gene_status to all alleles of the same gene
    if (status === 'curated' && gene.geneName) {
      await db.update(amrGenes).set({ geneStatus: 'curated' }).where(eq(amrGenes.geneName, gene.geneName))
    }

    await invalidateTierCaches()
    const newTiers = await getValidationTiers()
    const newTier = newTiers.get(gene.geneName)?.tier ?? 'Candidate'

    await db.insert(curationHistory).values({
      targetType: 'gene',
      targetId: String(geneId),
      curatorId: curator.id,
      curatorEmail: curator.email,
      curatorName: curator.name,
      curatorAffiliation: curator.affiliation,
      action: status === 'curated' ? 'approve' : 'reject',
      previousStatus: gene.status,
      newStatus: status,
      changes: {
        allele: gene.allele || gene.geneName,
        gene_name: gene.geneName,
        previous_tier: previousTier,
        new_tier: newTier,
      },
    })

    if (note) {
      await db.insert(curationNotes).values({
        targetType: 'gene',
        targetId: String(geneId),
        curatorId: curator.id,
        curatorEmail: curator.email,
        curatorName: curator.name,
        curatorAffiliation: curator.affiliation,
        note,
      })
    }

    revalidatePath('/curator/dashboard')
    revalidatePath('/curator/genes')
    revalidatePath('/browse/genes')
    revalidatePath(`/browse/genes/${encodeURIComponent(gene.geneName)}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update gene status' }
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
      .select({ status: amrMutations.status })
      .from(amrMutations)
      .where(eq(amrMutations.id, numericId))
      .limit(1)

    if (!mutation) {
      return { success: false, error: 'Mutation not found' }
    }

    await db
      .update(amrMutations)
      .set({
        status,
        validatedBy: curator.id,
        curatorName: curator.name,
        curatorEmail: curator.email,
        curatorAffiliation: curator.affiliation,
        validatedAt: status === 'curated' ? new Date().toISOString() : null,
      })
      .where(eq(amrMutations.id, numericId))

    await db.insert(curationHistory).values({
      targetType: 'mutation',
      targetId: String(mutationId),
      curatorId: curator.id,
      curatorEmail: curator.email,
      curatorName: curator.name,
      curatorAffiliation: curator.affiliation,
      action: status === 'curated' ? 'approve' : 'reject',
      previousStatus: mutation.status,
      newStatus: status,
    })

    if (note) {
      await db.insert(curationNotes).values({
        targetType: 'mutation',
        targetId: String(mutationId),
        curatorId: curator.id,
        curatorEmail: curator.email,
        curatorName: curator.name,
        curatorAffiliation: curator.affiliation,
        note,
      })
    }

    await invalidateTierCaches()
    revalidatePath('/curator/dashboard')
    revalidatePath('/curator/mutations')
    revalidatePath('/browse/mutations')
    revalidatePath(`/browse/mutations/${mutationId}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update mutation status' }
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

    const { id, created_at, updated_at, ...rest } = updates as Record<string, unknown>
    const safeUpdates = toDbColumns(rest)

    await db.update(amrGenes).set(safeUpdates).where(eq(amrGenes.id, numericId))

    const diff = buildDiff(currentGene as unknown as Record<string, unknown>, safeUpdates)

    await db.insert(curationHistory).values({
      targetType: 'gene',
      targetId: geneId,
      curatorId: curator.id,
      curatorEmail: curator.email,
      curatorName: curator.name,
      curatorAffiliation: curator.affiliation,
      action: 'edit',
      previousStatus: currentGene.status,
      newStatus: (safeUpdates.status as string) || currentGene.status,
      changes: Object.keys(diff).length > 0 ? diff : null,
    })

    revalidatePath('/curator/dashboard')
    revalidatePath('/browse/genes')
    revalidatePath(`/browse/genes/${encodeURIComponent(currentGene.geneName)}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update gene' }
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

    const { id, created_at, updated_at, ...rest } = updates as Record<string, unknown>
    const safeUpdates = toDbColumns(rest)

    await db.update(amrMutations).set(safeUpdates).where(eq(amrMutations.id, numericId))

    const diff = buildDiff(currentMutation as unknown as Record<string, unknown>, safeUpdates)

    await db.insert(curationHistory).values({
      targetType: 'mutation',
      targetId: mutationId,
      curatorId: curator.id,
      curatorEmail: curator.email,
      curatorName: curator.name,
      curatorAffiliation: curator.affiliation,
      action: 'edit',
      previousStatus: currentMutation.status,
      newStatus: (safeUpdates.status as string) ?? currentMutation.status,
      changes: Object.keys(diff).length > 0 ? diff : null,
    })

    revalidatePath('/curator/mutations')
    revalidatePath('/browse/mutations')
    revalidatePath(`/browse/mutations/${mutationId}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update mutation' }
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

export async function getCurationHistory(
  targetType: 'gene' | 'mutation',
  targetId: string,
  allTargetIds?: string[]
): Promise<CurationHistory[]> {
  const targetIdFilter =
    allTargetIds && allTargetIds.length > 0
      ? inArray(curationHistory.targetId, allTargetIds)
      : eq(curationHistory.targetId, targetId)

  const rows = await db
    .select({ history: curationHistory, curator: publicCuratorColumns })
    .from(curationHistory)
    .leftJoin(curators, eq(curationHistory.curatorId, curators.id))
    .where(and(eq(curationHistory.targetType, targetType), targetIdFilter))
    .orderBy(desc(curationHistory.createdAt))

  return rows.map((r) => ({
    ...(toSnakeCase(r.history) as unknown as CurationHistory),
    curator: r.curator ?? undefined,
  }))
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

function buildDiff(
  current: Record<string, unknown>,
  updates: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {}
  for (const [key, newVal] of Object.entries(updates)) {
    const oldVal = current[key]
    const oldStr = Array.isArray(oldVal) ? JSON.stringify(oldVal) : String(oldVal ?? '')
    const newStr = Array.isArray(newVal) ? JSON.stringify(newVal) : String(newVal ?? '')
    if (oldStr !== newStr) diff[key] = { old: oldVal, new: newVal }
  }
  return diff
}
