import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ValidationTierBadge } from '@/components/browse/validation-tier-badge'
import { GroupedMutationPapers } from '@/components/browse/mutation-paper-groups'
import { CommentsSection } from '@/components/comments/comments-section'
import { HistoryDialog } from '@/components/curator/history-dialog'
import { eq, and, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { amrGenes, amrMutations } from '@/lib/db/schema'
import { toSnakeCase } from '@/lib/db/helpers'
import { getMutationById, getMutationValidationTiers } from '@/lib/actions/browse'
import { getComments } from '@/lib/actions/comments'
import { getCurrentCurator } from '@/lib/actions/curator'
import type { AMRMutation } from '@/lib/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MutationDetailPage({ params }: PageProps) {
  const { id } = await params
  const mutation = await getMutationById(id)

  if (!mutation) {
    notFound()
  }

  const [comments, curator, mutTiers] = await Promise.all([
    getComments('mutation', id),
    getCurrentCurator(),
    getMutationValidationTiers(),
  ])

  // Fetch ALL related mutations (same gene + protein_change or nucleotide_change)
  let relatedMutations: AMRMutation[] = [mutation]
  if (mutation.gene_name) {
    const queries = []
    if (mutation.protein_change) {
      queries.push(
        db.select().from(amrMutations).where(
          and(eq(amrMutations.geneName, mutation.gene_name), eq(amrMutations.proteinChange, mutation.protein_change))
        )
      )
    }
    if (mutation.nucleotide_change) {
      queries.push(
        db.select().from(amrMutations).where(
          and(eq(amrMutations.geneName, mutation.gene_name), eq(amrMutations.nucleotideChange, mutation.nucleotide_change))
        )
      )
    }
    const results = await Promise.all(queries)
    const seen = new Set<AMRMutation['id']>()
    relatedMutations = []
    for (const rows of results) {
      for (const row of rows) {
        const m = toSnakeCase(row) as unknown as AMRMutation
        if (!seen.has(m.id)) {
          seen.add(m.id)
          relatedMutations.push(m)
        }
      }
    }
    if (relatedMutations.length === 0) relatedMutations = [mutation]
  }

  // Aggregate across all related mutations — use the best tier from any row
  const tierPriority: Record<string, number> = { Confirmed: 0, Established: 1, Supported: 2, Candidate: 3 }
  let bestTierInfo = mutTiers.get(id)
  for (const m of relatedMutations) {
    const ti = mutTiers.get(m.id)
    if (ti && (tierPriority[ti.tier] ?? 99) < (tierPriority[bestTierInfo?.tier ?? 'Candidate'] ?? 99)) {
      bestTierInfo = ti
    }
  }
  const validationTier = bestTierInfo?.tier ?? 'Candidate'
  const allDatabases = [...new Set([
    ...(bestTierInfo?.databases ?? []),
    ...relatedMutations.map((m) => m.source_database).filter(Boolean) as string[],
  ])].sort()
  const allOrganisms = [...new Set(relatedMutations.flatMap((m) => m.organisms_observed_in ?? []))]
  const allResistances = [...new Set(relatedMutations.flatMap((m) => m.confers_resistance_to ?? []))]
  const allEffects = [...new Set(relatedMutations.map((m) => m.effect_on_function).filter(Boolean) as string[])]
  const allNucleotideChanges = [...new Set(relatedMutations.map((m) => m.nucleotide_change).filter(Boolean) as string[])]
  const allProteinChanges = [...new Set(relatedMutations.map((m) => m.protein_change).filter(Boolean) as string[])]
  const uniquePapers = new Set(relatedMutations.map((m) => m.paper_pmid).filter(Boolean))
  const mutationsWithPapers = relatedMutations.filter((m) => m.paper_pmid)

  // Fetch gene info for encodes
  let geneEncodes: string | null = null
  if (mutation.gene_name) {
    const [geneRow] = await db
      .select({ encodes: amrGenes.encodes })
      .from(amrGenes)
      .where(and(eq(amrGenes.geneName, mutation.gene_name), isNotNull(amrGenes.encodes)))
      .limit(1)
    geneEncodes = geneRow?.encodes ?? null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/browse/mutations" className="hover:text-foreground transition-colors">
            Browse Mutations
          </Link>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {mutation.gene_name && (
            <>
              <Link
                href={`/browse/genes/${encodeURIComponent(mutation.gene_name)}`}
                className="hover:text-foreground transition-colors"
              >
                {mutation.gene_name}
              </Link>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
          <span className="text-foreground font-medium font-mono">
            {mutation.protein_change || mutation.nucleotide_change || mutation.notation}
          </span>
        </nav>

        {/* Header hero */}
        <div className="mb-8 rounded-xl border border-border/60 bg-gradient-to-br from-slate-50 via-white to-violet-50/50 p-6">

          {/* Mutation identity */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
            <div className="space-y-3">
              {mutation.gene_name && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-0.5">Gene</span>
                  <Link
                    href={`/browse/genes/${encodeURIComponent(mutation.gene_name)}`}
                    className="text-2xl font-bold text-primary hover:underline"
                  >
                    {mutation.gene_name}
                  </Link>
                  {geneEncodes && (
                    <p className="text-sm text-muted-foreground mt-0.5">{geneEncodes}</p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-start gap-4">
                {mutation.protein_change && (
                  <div className="px-4 py-3 rounded-lg border-2 border-violet-200 bg-violet-50">
                    <span className="text-xs text-violet-600 uppercase tracking-wide font-semibold block mb-1">Protein Change</span>
                    <span className="text-3xl font-bold font-mono text-violet-900">{mutation.protein_change}</span>
                  </div>
                )}
                {mutation.nucleotide_change && (
                  <div className="px-4 py-3 rounded-lg border-2 border-sky-200 bg-sky-50">
                    <span className="text-xs text-sky-600 uppercase tracking-wide font-semibold block mb-1">Nucleotide Change</span>
                    <span className="text-3xl font-bold font-mono text-sky-900">{mutation.nucleotide_change}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-border bg-white shadow-sm">
                <span className="text-xs text-muted-foreground">Validation Status</span>
                <ValidationTierBadge tier={validationTier} reason={bestTierInfo?.reason} />
              </div>
              {allDatabases.length > 0 && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-border bg-white shadow-sm">
                  <span className="text-xs text-muted-foreground">Databases</span>
                  <div className="flex flex-wrap gap-1">
                    {allDatabases.map((db) => (
                      <span key={db} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {db}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <HistoryDialog targetType="mutation" targetId={id} />
            </div>
          </div>

          {/* Overview stats */}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4">
            <p className="text-base font-bold text-foreground mb-3">Overview</p>
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              {allEffects.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Mechanism</dt>
                  <dd className="text-base font-medium">{allEffects.join(', ')}</dd>
                </div>
              )}
              {allResistances.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Resistance To</dt>
                  <dd className="text-base">{allResistances.join(', ')}</dd>
                </div>
              )}
              {allOrganisms.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Organisms</dt>
                  <dd className="text-base italic">
                    {allOrganisms.slice(0, 5).join(', ')}
                    {allOrganisms.length > 5 && (
                      <span className="not-italic text-muted-foreground"> +{allOrganisms.length - 5} more</span>
                    )}
                  </dd>
                </div>
              )}
              {uniquePapers.size > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Papers</dt>
                  <dd className="text-base font-semibold">{uniquePapers.size}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Main content */}
        <div className="space-y-6">

          {/* Paper Information — grouped by PMID */}
          {mutationsWithPapers.length > 0 && (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>
                  Paper Information
                  <Badge variant="secondary" className="ml-2 text-sm font-normal">{uniquePapers.size}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GroupedMutationPapers mutations={mutationsWithPapers} />
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <CommentsSection
            targetType="mutation"
            targetId={id}
            initialComments={comments}
            currentUserId={curator?.id}
          />
        </div>
      </main>

      <Footer />
    </div>
  )
}
