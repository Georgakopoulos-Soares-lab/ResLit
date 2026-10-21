import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getCurrentCurator, getCuratorStats } from '@/lib/actions/curator'
import { getProposalCounts } from '@/lib/actions/proposals'
import { SignOutButton } from '@/components/curator/sign-out-button'
import { UploadGeneModal } from '@/components/curator/upload-gene-modal'
import { UploadMutationModal } from '@/components/curator/upload-mutation-modal'

export default async function CuratorDashboard() {
  const curator = await getCurrentCurator()
  
  if (!curator) {
    redirect('/curator/login')
  }

  const [stats, proposalCounts] = await Promise.all([getCuratorStats(), getProposalCounts()])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Curator Dashboard</h1>
            <p className="mt-1 text-muted-foreground">
              Welcome back, {curator.name}
              {curator.role === 'admin' && (
                <Badge variant="secondary" className="ml-2">Admin</Badge>
              )}
            </p>
          </div>
          <SignOutButton />
        </div>

        {/* Stats Grid */}
        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Card className="border-border/60 hover:border-primary/40 transition-colors cursor-pointer">
            <Link href="/curator/genes">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Review Genes</span>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </CardTitle>
                <CardDescription>
                  Browse and curate antimicrobial resistance genes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-warning">{stats.pendingGenes}</p>
                <p className="text-xs text-muted-foreground">pending review</p>
              </CardContent>
            </Link>
          </Card>

          <Card className="border-border/60 hover:border-primary/40 transition-colors cursor-pointer">
            <Link href="/curator/mutations">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Review Mutations</span>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </CardTitle>
                <CardDescription>
                  Browse and curate antimicrobial resistance mutations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-warning">{stats.pendingMutations}</p>
                <p className="text-xs text-muted-foreground">pending review</p>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Proposals */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Card className="border-border/60 hover:border-primary/40 transition-colors cursor-pointer">
            <Link href="/curator/proposals">
              <CardHeader>
                <CardTitle>My Proposals</CardTitle>
                <CardDescription>
                  Your edits, approvals, rejections and uploads take effect only after an admin accepts them
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <span className="font-bold text-warning">{proposalCounts.mine.pending}</span> pending ·{' '}
                  <span className="font-bold text-success">{proposalCounts.mine.accepted}</span> accepted ·{' '}
                  <span className="font-bold text-muted-foreground">{proposalCounts.mine.declined}</span> declined
                </p>
              </CardContent>
            </Link>
          </Card>

          {curator.role === 'admin' && (
            <Card className="border-border/60 hover:border-primary/40 transition-colors cursor-pointer">
              <Link href="/curator/review">
                <CardHeader>
                  <CardTitle>Review Proposals</CardTitle>
                  <CardDescription>Accept or decline curator proposals (admin only)</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-warning">{proposalCounts.pendingAll ?? 0}</p>
                  <p className="text-xs text-muted-foreground">awaiting review</p>
                </CardContent>
              </Link>
            </Card>
          )}

          {curator.role === 'admin' && (
            <Card className="border-border/60 hover:border-primary/40 transition-colors cursor-pointer">
              <Link href="/curator/admins">
                <CardHeader>
                  <CardTitle>Manage Admins</CardTitle>
                  <CardDescription>Grant or revoke admin rights for other curators (admin only)</CardDescription>
                </CardHeader>
              </Link>
            </Card>
          )}
        </div>

        {/* Upload Actions */}
        <div className="mb-8 p-4 bg-accent/50 rounded-lg border border-border/60">
          <h3 className="font-semibold mb-3">Add New Data</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <UploadGeneModal />
            <UploadMutationModal />
          </div>
        </div>

        {/* Statistics Summary */}
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardDescription>Genes</CardDescription>
              <CardTitle className="text-3xl font-bold text-success">
                {stats.curatedGenes} / {stats.totalGenes}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                curated
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardDescription>Mutations</CardDescription>
              <CardTitle className="text-3xl font-bold text-success">
                {stats.curatedMutations} / {stats.totalMutations}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                curated
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-3xl font-bold text-warning">
                {stats.pendingGenes + stats.pendingMutations}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                awaiting review
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardDescription>Total Items</CardDescription>
              <CardTitle className="text-3xl font-bold">
                {stats.totalGenes + stats.totalMutations}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                in database
              </p>
            </CardContent>
          </Card>
        </div>

      </main>

      <Footer />
    </div>
  )
}
