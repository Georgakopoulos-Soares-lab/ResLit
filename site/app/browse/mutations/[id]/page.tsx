import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/browse/status-badge'
import { MutationPaperEntry } from '@/components/browse/mutation-paper-groups'
import { CommentsSection } from '@/components/comments/comments-section'
import { HistoryDialog } from '@/components/curator/history-dialog'
import { getMutationById } from '@/lib/actions/browse'
import { getComments } from '@/lib/actions/comments'
import { createClient } from '@/lib/supabase/server'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MutationDetailPage({ params }: PageProps) {
  const { id } = await params
  const mutation = await getMutationById(id)

  if (!mutation) {
    notFound()
  }

  const [comments, supabase] = await Promise.all([
    getComments('mutation', id),
    createClient(),
  ])

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
            {mutation.nucleotide_change || mutation.notation}
          </span>
        </nav>

        {/* Header hero */}
        <div className="mb-8 rounded-xl border border-border/60 bg-gradient-to-br from-slate-50 via-white to-violet-50/50 p-6">

          {/* Mutation name + PubMed button */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-1">
            <h1 className="text-4xl font-bold tracking-tight font-mono text-slate-800">
              {mutation.nucleotide_change || mutation.notation || 'Unknown'}
            </h1>
          </div>

          {mutation.protein_change && (
            <p className="text-muted-foreground mb-5 font-mono">{mutation.protein_change}</p>
          )}

          {/* Gene link + curation status */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            {mutation.gene_name && (
              <Link
                href={`/browse/genes/${encodeURIComponent(mutation.gene_name)}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Gene: {mutation.gene_name}
              </Link>
            )}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-border bg-white shadow-sm">
                <span className="text-xs text-muted-foreground">Curation Status</span>
                <StatusBadge status={mutation.status} />
              </div>
              <HistoryDialog targetType="mutation" targetId={id} />
            </div>
          </div>

          {/* Overview stats */}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4">
            <p className="text-base font-bold text-foreground mb-3">Overview</p>
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              {mutation.mutation_type && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Mutation Type</dt>
                  <dd className="text-base font-medium capitalize">{mutation.mutation_type}</dd>
                </div>
              )}
              {mutation.origin && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Origin</dt>
                  <dd className="text-base font-medium capitalize">{mutation.origin.replace(/_/g, ' ')}</dd>
                </div>
              )}
              {mutation.position_in_molecule && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Position</dt>
                  <dd className="text-base font-medium">{mutation.position_in_molecule}</dd>
                </div>
              )}
              {mutation.confers_resistance_to && mutation.confers_resistance_to.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Resistance To</dt>
                  <dd className="text-base">{mutation.confers_resistance_to.join(', ')}</dd>
                </div>
              )}
              {mutation.organisms_observed_in && mutation.organisms_observed_in.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Organisms</dt>
                  <dd className="text-base italic">
                    {mutation.organisms_observed_in.slice(0, 3).join(', ')}
                    {mutation.organisms_observed_in.length > 3 && (
                      <span className="not-italic text-muted-foreground"> +{mutation.organisms_observed_in.length - 3} more</span>
                    )}
                  </dd>
                </div>
              )}
              {mutation.paper_pmid && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Paper</dt>
                  <dd className="text-base font-semibold">1</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Main content */}
        <div className="space-y-6">

          {/* Paper Information */}
          {mutation.paper_pmid && (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>
                  Paper Information
                  <Badge variant="secondary" className="ml-2 text-sm font-normal">1</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MutationPaperEntry mutation={mutation} entryNumber={1} />
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <CommentsSection
            targetType="mutation"
            targetId={id}
            initialComments={comments}
            currentUserId={user?.id}
          />
        </div>
      </main>

      <Footer />
    </div>
  )
}
