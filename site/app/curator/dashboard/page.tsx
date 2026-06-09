import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getCurrentCurator, getCuratorStats } from '@/lib/actions/curator'
import { SignOutButton } from '@/components/curator/sign-out-button'
import { UploadGeneModal } from '@/components/curator/upload-gene-modal'
import { UploadMutationModal } from '@/components/curator/upload-mutation-modal'

export default async function CuratorDashboard() {
  const curator = await getCurrentCurator()
  
  if (!curator) {
    redirect('/curator/login')
  }

  const stats = await getCuratorStats()

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
