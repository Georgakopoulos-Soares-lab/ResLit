import { Suspense } from 'react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { FilterSidebar } from '@/components/browse/filter-sidebar'
import { SearchBar } from '@/components/browse/search-bar'
import { GenesTable } from '@/components/browse/genes-table'
import { BrowsePagination } from '@/components/browse/browse-pagination'
import { DownloadFilteredButton } from '@/components/browse/download-filtered-button'
import { Skeleton } from '@/components/ui/skeleton'
import { getFilterOptions, browseGenes } from '@/lib/actions/browse'
import type { BrowseFilters } from '@/lib/types'

interface PageProps {
  searchParams: Promise<{
    search?: string
    mechanismClass?: string
    antibiotic?: string
    encodes?: string
    organism?: string
    country?: string
    yearFrom?: string
    yearTo?: string
    sourceDatabases?: string
    pmid?: string
    validationTier?: string
    page?: string
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

export default async function BrowseGenesPage({ searchParams }: PageProps) {
  const params = await searchParams

  const filters: BrowseFilters = {
    search: params.search,
    mechanismClass: params.mechanismClass,
    antibiotic: params.antibiotic,
    encodes: params.encodes,
    organism: params.organism,
    country: params.country,
    yearFrom: params.yearFrom ? parseInt(params.yearFrom) : undefined,
    yearTo: params.yearTo ? parseInt(params.yearTo) : undefined,
    sourceDatabases: params.sourceDatabases ? params.sourceDatabases.split(',').filter(Boolean) : undefined,
    pmid: params.pmid,
    validationTier: params.validationTier as any,
  }

  const page = params.page ? parseInt(params.page) : 1
  const [filterOptions, result] = await Promise.all([
    getFilterOptions(),
    browseGenes(filters, page),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Browse AMR Genes</h1>
          <p className="mt-2 text-muted-foreground">
            Explore antimicrobial resistance genes from the literature
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="sticky top-24 rounded-lg border border-border/60 bg-card p-4">
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <FilterSidebar filterOptions={filterOptions} type="genes" />
              </Suspense>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Search, View Toggle, and Download */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                  <SearchBar type="genes" placeholder="Search genes by name..." />
                </Suspense>
              </div>
              <div className="flex items-center gap-2">
                <Suspense fallback={<Skeleton className="h-10 w-28" />}>
                  <DownloadFilteredButton type="genes" totalItems={result.total} />
                </Suspense>
              </div>
            </div>

            {/* Results */}
            <Suspense fallback={<LoadingSkeleton />}>
              <GenesTable genes={result.data} />
            </Suspense>

            {/* Pagination */}
            <Suspense fallback={<Skeleton className="h-12 w-full mt-4" />}>
              <BrowsePagination
                type="genes"
                currentPage={result.page}
                totalPages={result.totalPages}
                totalItems={result.total}
              />
            </Suspense>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
