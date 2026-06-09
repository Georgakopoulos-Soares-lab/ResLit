import { Suspense } from 'react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { SearchBar } from '@/components/browse/search-bar'
import { PaperFilterSidebar } from '@/components/browse/paper-filter-sidebar'
import { PapersTable } from '@/components/browse/papers-table'
import { BrowsePagination } from '@/components/browse/browse-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { browsePapers, getFilterOptions } from '@/lib/actions/browse'

interface PageProps {
  searchParams: Promise<{
    search?: string
    country?: string
    antibiotic?: string
    organism?: string
    yearFrom?: string
    yearTo?: string
    sourceDatabases?: string
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

export default async function BrowsePapersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = params.page ? parseInt(params.page) : 1

  const filters = {
    country: params.country,
    antibiotic: params.antibiotic,
    organism: params.organism,
    yearFrom: params.yearFrom ? parseInt(params.yearFrom) : undefined,
    yearTo: params.yearTo ? parseInt(params.yearTo) : undefined,
    sourceDatabases: params.sourceDatabases ? params.sourceDatabases.split(',').filter(Boolean) : undefined,
  }

  const [result, filterOptions] = await Promise.all([
    browsePapers(params.search, page, filters),
    getFilterOptions(),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Browse Papers</h1>
          <p className="mt-2 text-muted-foreground">
            Scientific literature reporting AMR genes and mutations
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="sticky top-24 rounded-lg border border-border/60 bg-card p-4">
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <PaperFilterSidebar filterOptions={filterOptions} />
              </Suspense>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                <SearchBar
                  type="papers"
                  placeholder="Search by PMID, title, location, or antibiotic..."
                />
              </Suspense>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {result.total} {result.total === 1 ? 'paper' : 'papers'} found
            </p>

            <Suspense fallback={<LoadingSkeleton />}>
              <PapersTable papers={result.data} />
            </Suspense>

            <Suspense fallback={<Skeleton className="h-12 w-full mt-4" />}>
              <BrowsePagination
                type="papers"
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
