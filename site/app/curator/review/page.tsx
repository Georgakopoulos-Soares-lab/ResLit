import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { ProposalCard } from '@/components/curator/proposal-card'
import { ProposalReviewActions } from '@/components/curator/proposal-review-actions'
import { getCurrentCurator } from '@/lib/actions/curator'
import { getProposals } from '@/lib/actions/proposals'
import { cn } from '@/lib/utils'
import type { ProposalStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>
}

const TABS: { status: ProposalStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'declined', label: 'Declined' },
]

export default async function ReviewProposalsPage({ searchParams }: PageProps) {
  const curator = await getCurrentCurator()
  if (!curator) redirect('/curator/login')
  if (curator.role !== 'admin') redirect('/curator/dashboard')

  const params = await searchParams
  const status: ProposalStatus = TABS.some((t) => t.status === params.status) ? (params.status as ProposalStatus) : 'pending'
  const page = Math.max(1, Number(params.page) || 1)
  const result = await getProposals(status, page)
  if (!result) redirect('/curator/dashboard')

  const pageHref = (p: number) => `/curator/review?status=${status}&page=${p}`

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/curator/dashboard">← Back to Dashboard</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Review Proposals</h1>
        <p className="mt-1 mb-6 text-muted-foreground">
          Curator proposals change nothing until accepted here. Accepting applies the change and records you as the reviewer.
        </p>

        <div className="flex gap-1 mb-6 border-b border-border/60">
          {TABS.map((t) => (
            <Link
              key={t.status}
              href={`/curator/review?status=${t.status}`}
              className={cn(
                'px-3 py-2 text-sm font-medium -mb-px border-b-2',
                t.status === status ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              {t.status === status && <span className="ml-1 text-xs text-muted-foreground">({result.total})</span>}
            </Link>
          ))}
        </div>

        {result.data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No {status} proposals.</p>
        ) : (
          <div className="space-y-4">
            {result.data.map((p) => (
              <ProposalCard key={p.id} proposal={p} actions={p.status === 'pending' ? <ProposalReviewActions id={p.id} /> : undefined} />
            ))}
          </div>
        )}

        {result.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8 text-sm">
            {page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={pageHref(page - 1)}>Previous</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>Previous</Button>
            )}
            <span className="text-muted-foreground">
              Page {page} of {result.totalPages}
            </span>
            {page < result.totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={pageHref(page + 1)}>Next</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>Next</Button>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
