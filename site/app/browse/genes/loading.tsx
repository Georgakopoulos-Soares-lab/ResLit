import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Browse AMR Genes</h1>
          <p className="mt-2 text-muted-foreground">
            Explore antimicrobial resistance genes from the literature
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-72 shrink-0">
            <div className="sticky top-24 rounded-lg border border-border/60 bg-card p-4">
              <Skeleton className="h-96 w-full" />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-28" />
            </div>

            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>

            <Skeleton className="h-12 w-full mt-4" />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
