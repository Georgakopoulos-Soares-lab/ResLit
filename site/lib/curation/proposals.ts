import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { amrGenes, amrMutations, curationProposals, papers } from '@/lib/db/schema'
import { geneKeyEq } from '@/lib/db/helpers'
import type { Curator } from '@/lib/types'

/**
 * Propose-then-validate curation. Deliberately NOT a 'use server' module:
 * nothing here is callable from the browser. lib/actions/curator.ts,
 * curator-upload.ts and import.ts call createProposal(); only
 * lib/actions/proposals.ts (admin-gated) calls applyProposal().
 */

export type ProposalTarget = 'gene' | 'mutation'
export type ProposalAction = 'edit' | 'reassign' | 'approve' | 'reject' | 'create'
type Proposal = typeof curationProposals.$inferSelect
type GeneInsert = typeof amrGenes.$inferInsert
type MutationInsert = typeof amrMutations.$inferInsert
type PaperInsert = typeof papers.$inferInsert

export interface CreatePayload {
  values: GeneInsert | MutationInsert
  paper?: PaperInsert
  /** Mutations only: link to the most recent gene with this name at accept time. */
  resolveGeneName?: string
}

/** Fields a curator may propose changing through an edit. Status, curator
 * attribution and provenance columns are excluded — they only change via an
 * accepted approve/reject or create proposal. */
export const EDITABLE_FIELDS: Record<ProposalTarget, readonly string[]> = {
  gene: [
    'geneName', 'allele', 'encodes', 'mechanism', 'resistanceMechanismClass', 'confersResistanceTo',
    'organismsTestedIn', 'roleInPaper', 'validationMethod', 'geographicLocation', 'keyFindings',
  ],
  mutation: [
    'geneName', 'nucleotideChange', 'proteinChange', 'mutationType', 'effectOnFunction', 'confersResistanceTo',
    'organismsObservedIn', 'country', 'validatedBy', 'origin', 'keyFindings',
  ],
}

const MUTATION_TYPES = ['substitution', 'insertion', 'deletion', 'frameshift', 'other'] as const

export function geneLabel(g: { geneName: string | null; allele: string | null }): string {
  return g.allele || g.geneName || ''
}

export function mutationLabel(m: {
  geneName: string | null
  proteinChange?: string | null
  nucleotideChange?: string | null
  mutationName?: string | null
}): string {
  return [m.geneName, m.proteinChange || m.nucleotideChange || m.mutationName].filter(Boolean).join(' ')
}

export async function createProposal(
  curator: Curator,
  p: {
    targetType: ProposalTarget
    targetId: string | null
    action: ProposalAction
    changes: Record<string, unknown> | null
    note?: string | null
    entryLabel: string | null
    pmid: string | null
  }
): Promise<number> {
  const [row] = await db
    .insert(curationProposals)
    .values({
      targetType: p.targetType,
      targetId: p.targetId,
      action: p.action,
      changes: p.changes,
      note: p.note || null,
      entryLabel: p.entryLabel,
      pmid: p.pmid,
      curatorId: curator.id,
      curatorEmail: curator.email,
      curatorName: curator.name,
      curatorAffiliation: curator.affiliation,
      status: 'pending',
    })
    .returning({ id: curationProposals.id })
  return row.id
}

/** Stringified comparison used both for building diffs and for detecting that
 * an entry changed after an edit was proposed. */
export function sameValue(a: unknown, b: unknown): boolean {
  const s = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : String(v ?? ''))
  return s(a) === s(b)
}

export interface ApplyOutcome {
  targetId: string
  geneNames: string[]
  previousStatus?: string | null
  newStatus?: string | null
}

/**
 * Applies a pending proposal and marks it accepted, atomically. Throws (and
 * changes nothing) if the proposal is no longer pending, the entry is gone,
 * or — for edits — the entry has changed since the edit was proposed.
 */
export function applyProposal(proposal: Proposal, admin: Curator, adminComment: string | null): ApplyOutcome {
  return db.transaction((tx) => {
    const now = new Date().toISOString()
    let outcome: ApplyOutcome

    const table = proposal.targetType === 'gene' ? amrGenes : amrMutations

    if (proposal.action === 'create') {
      const payload = proposal.changes as unknown as CreatePayload
      if (payload.paper?.pmid) {
        const { pmid, ...paperRest } = payload.paper
        tx.insert(papers).values(payload.paper).onConflictDoUpdate({ target: papers.pmid, set: paperRest }).run()
      }
      if (proposal.targetType === 'gene') {
        const values = { ...(payload.values as GeneInsert), status: 'pending' as const, geneStatus: 'pending' as const }
        // amr_genes.paper_pmid references papers.pmid; make sure the paper row
        // exists (never overwrites an existing one)
        if (values.paperPmid) {
          tx.insert(papers)
            .values({ pmid: values.paperPmid, title: values.titlePmid ?? null, year: values.yearPmid ?? null })
            .onConflictDoNothing()
            .run()
        }
        const inserted = tx.insert(amrGenes).values(values).returning({ id: amrGenes.id }).get()
        outcome = { targetId: String(inserted.id), geneNames: [values.geneName] }
      } else {
        const values = { ...(payload.values as MutationInsert), status: 'pending' as const }
        if (payload.resolveGeneName) {
          const gene = tx
            .select({ id: amrGenes.id })
            .from(amrGenes)
            .where(eq(amrGenes.geneName, payload.resolveGeneName))
            .orderBy(desc(amrGenes.createdAt))
            .limit(1)
            .get()
          values.geneId = gene?.id ?? null
        }
        const inserted = tx.insert(amrMutations).values(values).returning({ id: amrMutations.id }).get()
        outcome = { targetId: String(inserted.id), geneNames: values.geneName ? [values.geneName] : [] }
      }
    } else {
      const id = Number(proposal.targetId)
      const current = tx.select().from(table).where(eq(table.id, id)).get() as Record<string, unknown> | undefined
      if (!current) throw new Error(`${proposal.targetType} #${proposal.targetId} no longer exists`)
      const currentGeneName = current.geneName as string | null

      if (proposal.action === 'edit' || proposal.action === 'reassign') {
        const diff = (proposal.changes ?? {}) as Record<string, { old: unknown; new: unknown }>
        const allowed = EDITABLE_FIELDS[proposal.targetType]
        const updates: Record<string, unknown> = {}
        for (const [field, { old, new: next }] of Object.entries(diff)) {
          if (!allowed.includes(field)) throw new Error(`Field "${field}" cannot be changed by a proposal`)
          if (!sameValue(current[field], old)) {
            throw new Error(`"${field}" has changed since this was proposed; decline it and ask the curator to re-propose`)
          }
          updates[field] = next
        }
        if (Object.keys(updates).length > 0) tx.update(table).set(updates).where(eq(table.id, id)).run()
        const newGeneName = (updates.geneName as string | undefined) ?? currentGeneName
        outcome = {
          targetId: String(id),
          geneNames: [...new Set([currentGeneName, newGeneName].filter((n): n is string => !!n))],
        }
      } else {
        // approve -> curated (tier becomes Confirmed, reason curator-verified);
        // reject -> rejected. Attribution is the proposing curator; the
        // accepting admin is recorded on the proposal itself.
        const status = proposal.action === 'approve' ? ('curated' as const) : ('rejected' as const)
        const attribution = {
          status,
          validatedBy: proposal.curatorId,
          curatorName: proposal.curatorName,
          curatorEmail: proposal.curatorEmail,
          curatorAffiliation: proposal.curatorAffiliation,
          validatedAt: status === 'curated' ? now : null,
        }
        if (proposal.targetType === 'gene') {
          tx.update(amrGenes).set({ ...attribution, geneStatus: status }).where(eq(amrGenes.id, id)).run()
          // An approved allele confirms its whole gene (all alleles share gene_status)
          if (status === 'curated' && currentGeneName) {
            tx.update(amrGenes).set({ geneStatus: 'curated' }).where(geneKeyEq(amrGenes.geneName, currentGeneName)).run()
          }
        } else {
          tx.update(amrMutations).set(attribution).where(eq(amrMutations.id, id)).run()
        }
        outcome = {
          targetId: String(id),
          geneNames: currentGeneName ? [currentGeneName] : [],
          previousStatus: current.status as string,
          newStatus: status,
        }
      }
    }

    const res = tx
      .update(curationProposals)
      .set({
        status: 'accepted',
        adminComment,
        reviewedBy: admin.id,
        reviewedByName: admin.name ?? admin.email,
        reviewedAt: now,
        appliedTargetId: outcome.targetId,
      })
      .where(and(eq(curationProposals.id, proposal.id), eq(curationProposals.status, 'pending')))
      .run()
    if (res.changes !== 1) throw new Error('Proposal is no longer pending')

    return outcome
  })
}

export function normalizeMutationType(value: string | null | undefined): MutationInsert['mutationType'] {
  const t = value?.toLowerCase().trim()
  if (!t) return null
  return (MUTATION_TYPES as readonly string[]).includes(t) ? (t as (typeof MUTATION_TYPES)[number]) : 'other'
}
