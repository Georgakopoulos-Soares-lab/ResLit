import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { DownloadCard } from '@/components/download/download-card'
import { getDownloadStats } from '@/lib/actions/download'
import { Download, Database, CheckCircle, FileText } from 'lucide-react'

export const metadata = {
  title: 'Download Data - ResLit AMR Database',
  description: 'Download antimicrobial resistance genes and mutations data in CSV format',
}

export default async function DownloadPage() {
  const stats = await getDownloadStats()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Download className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Download Data</h1>
                <p className="text-muted-foreground">
                  Export AMR genes and mutations in CSV format
                </p>
              </div>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="rounded-lg border border-border/60 bg-card p-4 text-center">
              <Database className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.totalGenes}</p>
              <p className="text-xs text-muted-foreground">Unique Genes</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 text-center">
              <CheckCircle className="h-5 w-5 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-700">{stats.tierCounts.Confirmed}</p>
              <p className="text-xs text-emerald-600">Confirmed Genes</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card p-4 text-center">
              <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-2xl font-bold">{stats.totalMutations}</p>
              <p className="text-xs text-muted-foreground">Unique Mutations</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 text-center">
              <CheckCircle className="h-5 w-5 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-700">{stats.confirmedMutations}</p>
              <p className="text-xs text-emerald-600">Confirmed Mutations</p>
            </div>
          </div>

          {/* Download Cards */}
          <div className="space-y-6">
            {/* AMR Genes Section */}
            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Database className="h-5 w-5" />
                AMR Genes
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <DownloadCard
                  title="All AMR Genes"
                  description="Download all genes in the database across all validation tiers"
                  type="genes"
                  curatedOnly={false}
                  count={stats.totalGenes}
                  variant="default"
                />
                <DownloadCard
                  title="Confirmed Genes"
                  description="Download only Confirmed genes (found in ResLit + external DB or expert-curated)"
                  type="genes"
                  validationTier="Confirmed"
                  count={stats.tierCounts.Confirmed}
                  variant="confirmed"
                />
              </div>
            </section>

            {/* AMR Mutations Section */}
            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                AMR Mutations
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <DownloadCard
                  title="All AMR Mutations"
                  description="Download all mutations in the database"
                  type="mutations"
                  curatedOnly={false}
                  count={stats.totalMutations}
                  variant="default"
                />
                <DownloadCard
                  title="Confirmed Mutations"
                  description="Download only mutations belonging to Confirmed genes"
                  type="mutations"
                  validationTier="Confirmed"
                  count={stats.confirmedMutations}
                  variant="confirmed"
                />
              </div>
            </section>

            {/* Custom Download Section */}
            <section className="rounded-lg border border-border/60 bg-card/50 p-6">
              <h2 className="text-xl font-semibold mb-2">Custom Filtered Download</h2>
              <p className="text-muted-foreground mb-4">
                Need a specific subset of data? Use our browse pages to apply filters
                (antibiotic class, organism, country, year range) and download your
                filtered selection directly.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/browse/genes"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Database className="h-4 w-4" />
                  Browse & Download Genes
                </a>
                <a
                  href="/browse/mutations"
                  className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Browse & Download Mutations
                </a>
              </div>
            </section>

            {/* Data Format Info */}
            <section className="rounded-lg border border-border/60 bg-muted/30 p-6">
              <h3 className="font-semibold mb-3">CSV File Format</h3>
              <div className="grid md:grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="font-medium mb-2">Gene CSV Columns:</p>
                  <ul className="text-muted-foreground space-y-1">
                    <li>Gene Name, Antibiotic Class, Antibiotic</li>
                    <li>Organism, Isolation Location, Country</li>
                    <li>Year, PMID, Description</li>
                    <li>Status, Created At, Updated At</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-2">Mutation CSV Columns:</p>
                  <ul className="text-muted-foreground space-y-1">
                    <li>Mutation Name, Gene Name, Position</li>
                    <li>Mutation Type, Wild Type, Mutant</li>
                    <li>Effect, PMID, Status</li>
                    <li>Created At, Updated At</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
