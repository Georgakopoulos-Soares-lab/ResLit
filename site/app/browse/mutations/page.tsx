import { Suspense } from 'react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { FilterSidebar } from '@/components/browse/filter-sidebar'
import { SearchBar } from '@/components/browse/search-bar'
import { MutationsTable } from '@/components/browse/mutations-table'
import { GenesForMutationsTable } from '@/components/browse/genes-for-mutations-table'
import { BrowsePagination } from '@/components/browse/browse-pagination'
import { DownloadFilteredButton } from '@/components/browse/download-filtered-button'
import { MutationsModeToggle } from '@/components/browse/mutations-mode-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { getFilterOptions, browseMutations, browseGenesWithMutations } from '@/lib/actions/browse'
import type { BrowseFilters } from '@/lib/types'

interface PageProps {
  searchParams: Promise<{
    search?: string
    geneName?: string
    mechanismClass?: string
    antibiotic?: string
    organism?: string
    country?: string
    yearFrom?: string
    yearTo?: string
    mutationType?: string
    sourceDatabases?: string
    pmid?: string
    validationTier?: string
    page?: string
    mode?: string
  }>
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

export default async function BrowseMutationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filterOptions = await getFilterOptions()
  const page = params.page ? parseInt(params.page) : 1
  const mode = params.mode || 'mutations'

  const filters: BrowseFilters = {
    search: params.search,
    geneName: params.geneName,
    mechanismClass: params.mechanismClass,
    antibiotic: params.antibiotic,
    organism: params.organism,
    country: params.country,
    yearFrom: params.yearFrom ? parseInt(params.yearFrom) : undefined,
    yearTo: params.yearTo ? parseInt(params.yearTo) : undefined,
    mutationType: params.mutationType,
    sourceDatabases: params.sourceDatabases ? params.sourceDatabases.split(',').filter(Boolean) : undefined,
    pmid: params.pmid,
    validationTier: params.validationTier as any,
  }

  const [mutationsResult, genesResult] = await Promise.all([
    mode === 'mutations' ? browseMutations(filters, page) : Promise.resolve(null),
    mode === 'genes' ? browseGenesWithMutations(filters, page) : Promise.resolve(null),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Browse AMR Mutations</h1>
          <p className="mt-2 text-muted-foreground">
            Explore antimicrobial resistance mutations from the literature
          </p>
        </div>

        {/* Mode toggle */}
        <div className="mb-6">
          <Suspense>
            <MutationsModeToggle currentMode={mode} />
          </Suspense>
        </div>

        {mode === 'mutations' && mutationsResult ? (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Filters */}
            <aside className="w-full lg:w-72 shrink-0">
              <div className="sticky top-24 rounded-lg border border-border/60 bg-card p-4">
                <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                  <FilterSidebar filterOptions={filterOptions} type="mutations" />
                </Suspense>
              </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                    <SearchBar
                      type="mutations"
                      placeholder="Search by nucleotide change, gene, protein change, effect, or paper..."
                    />
                  </Suspense>
                </div>
                <div className="flex items-center gap-2">
                  <Suspense fallback={<Skeleton className="h-10 w-28" />}>
                    <DownloadFilteredButton type="mutations" totalItems={mutationsResult.total} />
                  </Suspense>
                </div>
              </div>

              <Suspense fallback={<LoadingSkeleton />}>
                <MutationsTable mutations={mutationsResult.data} />
              </Suspense>

              <Suspense fallback={<Skeleton className="h-12 w-full mt-4" />}>
                <BrowsePagination
                  type="mutations"
                  currentPage={mutationsResult.page}
                  totalPages={mutationsResult.totalPages}
                  totalItems={mutationsResult.total}
                />
              </Suspense>
            </div>
          </div>
        ) : genesResult ? (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Filters */}
            <aside className="w-full lg:w-72 shrink-0">
              <div className="sticky top-24 rounded-lg border border-border/60 bg-card p-4">
                <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                  <FilterSidebar
                    filterOptions={filterOptions}
                    type="mutations"
                    basePath="/browse/mutations"
                    keepParams={['mode']}
                    hideGeneName
                  />
                </Suspense>
              </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                    <SearchBar
                      type="mutations"
                      placeholder="Search genes by name..."
                    />
                  </Suspense>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                {genesResult.total} {genesResult.total === 1 ? 'gene' : 'genes'} with mutations
              </p>

              <Suspense fallback={<LoadingSkeleton />}>
                <GenesForMutationsTable genes={genesResult.data} />
              </Suspense>

              <Suspense fallback={<Skeleton className="h-12 w-full mt-4" />}>
                <BrowsePagination
                  type="mutations"
                  currentPage={genesResult.page}
                  totalPages={genesResult.totalPages}
                  totalItems={genesResult.total}
                />
              </Suspense>
            </div>
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  )
}
