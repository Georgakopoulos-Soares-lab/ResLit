import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { ProposalCard } from '@/components/curator/proposal-card'
import { getCurrentCurator } from '@/lib/actions/curator'
import { getMyProposals } from '@/lib/actions/proposals'

export const dynamic = 'force-dynamic'

export default async function MyProposalsPage() {
  const curator = await getCurrentCurator()
  if (!curator) redirect('/curator/login')

  const proposals = await getMyProposals()
  const counts = { pending: 0, accepted: 0, declined: 0 }
  for (const p of proposals) counts[p.status]++

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/curator/dashboard">← Back to Dashboard</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">My Proposals</h1>
        <p className="mt-1 mb-6 text-muted-foreground">
          Every edit, approval, rejection and upload you make is reviewed by an admin before it takes effect.{' '}
          {counts.pending} pending · {counts.accepted} accepted · {counts.declined} declined
        </p>

        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">You haven&apos;t submitted any proposals yet.</p>
        ) : (
          <div className="space-y-4">
            {proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
