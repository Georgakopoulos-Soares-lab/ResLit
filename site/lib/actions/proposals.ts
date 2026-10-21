'use server'

import { revalidatePath } from 'next/cache'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { amrGenes, amrMutations, curationProposals } from '@/lib/db/schema'
import { toSnakeCase, normalizeGeneName } from '@/lib/db/helpers'
import { getCurrentCurator } from '@/lib/auth/session'
import { applyProposal } from '@/lib/curation/proposals'
import { invalidateTierCaches, getValidationTiers, getMutationValidationTiers } from '@/lib/actions/browse'
import type { Curator, CurationProposal, ProposalStatus } from '@/lib/types'

const PAGE_SIZE = 25

async function requireAdmin(): Promise<Curator | null> {
  const curator = await getCurrentCurator()
  return curator?.role === 'admin' ? curator : null
}

function toProposal(row: typeof curationProposals.$inferSelect): CurationProposal {
  return toSnakeCase(row) as unknown as CurationProposal
}

/** Attaches the current state of each proposal's entry (gene name + status). */
async function withEntries(rows: (typeof curationProposals.$inferSelect)[]): Promise<CurationProposal[]> {
  const idsOf = (type: 'gene' | 'mutation') => [
    ...new Set(
      rows
        .filter((r) => r.targetType === type)
        .map((r) => Number(r.targetId ?? r.appliedTargetId))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ]
  const geneIds = idsOf('gene')
  const mutationIds = idsOf('mutation')
  const [genes, mutations] = await Promise.all([
    geneIds.length
      ? db.select({ id: amrGenes.id, geneName: amrGenes.geneName, status: amrGenes.status }).from(amrGenes).where(inArray(amrGenes.id, geneIds))
      : [],
    mutationIds.length
      ? db.select({ id: amrMutations.id, geneName: amrMutations.geneName, status: amrMutations.status }).from(amrMutations).where(inArray(amrMutations.id, mutationIds))
      : [],
  ])
  const entries = new Map<string, { id: string; gene_name: string | null; status: 'pending' | 'curated' | 'rejected' }>()
  for (const g of genes) entries.set(`gene:${g.id}`, { id: String(g.id), gene_name: g.geneName, status: g.status })
  for (const m of mutations) entries.set(`mutation:${m.id}`, { id: String(m.id), gene_name: m.geneName, status: m.status })

  return rows.map((r) => ({
    ...toProposal(r),
    entry: entries.get(`${r.targetType}:${r.targetId ?? r.appliedTargetId}`) ?? null,
  }))
}

export async function getProposals(
  status: ProposalStatus = 'pending',
  page: number = 1
): Promise<{ data: CurationProposal[]; total: number; page: number; totalPages: number } | null> {
  if (!(await requireAdmin())) return null

  const where = eq(curationProposals.status, status)
  const [rows, [{ n }]] = await Promise.all([
    db
      .select()
      .from(curationProposals)
      .where(where)
      // Oldest first for the pending queue; most recently reviewed first otherwise
      .orderBy(status === 'pending' ? curationProposals.createdAt : desc(curationProposals.reviewedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(curationProposals).where(where),
  ])

  return { data: await withEntries(rows), total: n, page, totalPages: Math.max(1, Math.ceil(n / PAGE_SIZE)) }
}

export async function getMyProposals(): Promise<CurationProposal[]> {
  const curator = await getCurrentCurator()
  if (!curator) return []
  const rows = await db
    .select()
    .from(curationProposals)
    .where(eq(curationProposals.curatorId, curator.id))
    .orderBy(desc(curationProposals.createdAt))
    .limit(500)
  return withEntries(rows)
}

export async function getProposalCounts(): Promise<{ mine: Record<ProposalStatus, number>; pendingAll: number | null }> {
  const curator = await getCurrentCurator()
  const mine: Record<ProposalStatus, number> = { pending: 0, accepted: 0, declined: 0 }
  if (!curator) return { mine, pendingAll: null }

  const rows = await db
    .select({ status: curationProposals.status, n: count() })
    .from(curationProposals)
    .where(eq(curationProposals.curatorId, curator.id))
    .groupBy(curationProposals.status)
  for (const r of rows) mine[r.status] = r.n

  let pendingAll: number | null = null
  if (curator.role === 'admin') {
    const [{ n }] = await db.select({ n: count() }).from(curationProposals).where(eq(curationProposals.status, 'pending'))
    pendingAll = n
  }
  return { mine, pendingAll }
}

export async function acceptProposal(id: number, comment?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await requireAdmin()
    if (!admin) return { success: false, error: 'Only admins can review proposals' }

    const [proposal] = await db
      .select()
      .from(curationProposals)
      .where(and(eq(curationProposals.id, id), eq(curationProposals.status, 'pending')))
      .limit(1)
    if (!proposal) return { success: false, error: 'Proposal not found or already reviewed' }

    const tierOf = async (targetId: string | null) => {
      if (!targetId) return null
      if (proposal.targetType === 'mutation') {
        return (await getMutationValidationTiers()).get(targetId)?.tier ?? 'Candidate'
      }
      const [gene] = await db.select({ geneName: amrGenes.geneName }).from(amrGenes).where(eq(amrGenes.id, Number(targetId)))
      return gene ? ((await getValidationTiers()).get(normalizeGeneName(gene.geneName))?.tier ?? 'Candidate') : null
    }
    const previousTier = await tierOf(proposal.targetId)

    const outcome = applyProposal(proposal, admin, comment?.trim() || null)

    await invalidateTierCaches()
    const newTier = await tierOf(outcome.targetId)
    await db
      .update(curationProposals)
      .set({
        result: {
          previous_status: outcome.previousStatus ?? null,
          new_status: outcome.newStatus ?? null,
          previous_tier: previousTier,
          new_tier: newTier,
        },
      })
      .where(eq(curationProposals.id, id))

    revalidateAfterReview(proposal.targetType, outcome.targetId, outcome.geneNames)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to accept proposal' }
  }
}

export async function declineProposal(id: number, comment?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await requireAdmin()
    if (!admin) return { success: false, error: 'Only admins can review proposals' }

    const res = await db
      .update(curationProposals)
      .set({
        status: 'declined',
        adminComment: comment?.trim() || null,
        reviewedBy: admin.id,
        reviewedByName: admin.name ?? admin.email,
        reviewedAt: new Date().toISOString(),
      })
      .where(and(eq(curationProposals.id, id), eq(curationProposals.status, 'pending')))
    if (res.changes !== 1) return { success: false, error: 'Proposal not found or already reviewed' }

    revalidatePath('/curator/review')
    revalidatePath('/curator/proposals')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to decline proposal' }
  }
}

function revalidateAfterReview(targetType: 'gene' | 'mutation', targetId: string, geneNames: string[]) {
  revalidatePath('/curator/review')
  revalidatePath('/curator/proposals')
  revalidatePath('/curator/dashboard')
  if (targetType === 'gene') {
    revalidatePath('/curator/genes')
    revalidatePath('/browse/genes')
    for (const name of geneNames) revalidatePath(`/browse/genes/${encodeURIComponent(name)}`)
  } else {
    revalidatePath('/curator/mutations')
    revalidatePath('/browse/mutations')
    revalidatePath(`/browse/mutations/${targetId}`)
  }
}
