import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

async function getStats() {
  const supabase = await createClient()
  
  const [genesResult, mutationsResult, curatorsResult] = await Promise.all([
    supabase.from('amr_genes').select('id', { count: 'exact', head: true }),
    supabase.from('amr_mutations').select('id', { count: 'exact', head: true }),
    supabase.from('curators').select('id', { count: 'exact', head: true }),
  ])

  // Count distinct PMIDs across both tables
  const [genePmids, mutationPmids] = await Promise.all([
    supabase.from('amr_genes').select('paper_pmid').not('paper_pmid', 'is', null),
    supabase.from('amr_mutations').select('paper_pmid').not('paper_pmid', 'is', null),
  ])
  const allPmids = new Set([
    ...(genePmids.data?.map((r: { paper_pmid: string }) => r.paper_pmid) ?? []),
    ...(mutationPmids.data?.map((r: { paper_pmid: string }) => r.paper_pmid) ?? []),
  ])
  const totalPapers = allPmids.size

  // Count distinct validated gene families, and curated mutations
  const [curatedGenesData, curatedMutationsResult] = await Promise.all([
    supabase.from('amr_genes').select('gene_name').eq('gene_status', 'curated'),
    supabase.from('amr_mutations').select('id', { count: 'exact', head: true }).eq('status', 'curated'),
  ])

  return {
    totalGenes: genesResult.count || 0,
    totalMutations: mutationsResult.count || 0,
    totalCurators: curatorsResult.count || 0,
    totalPapers,
    curatedGenes: new Set(curatedGenesData.data?.map((r: { gene_name: string }) => r.gene_name) ?? []).size,
    curatedMutations: curatedMutationsResult.count || 0,
  }
}

export default async function HomePage() {
  const stats = await getStats()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-accent/50 to-background py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl text-balance">
                Antimicrobial Resistance
                <span className="block text-primary">Gene & Mutation Database</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed text-pretty">
                A comprehensive, curated database of AMR genes and mutations extracted from scientific literature. 
                Browse thousands of entries with direct PubMed links, filtered by antibiotic, organism, location, and year.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/browse/genes">
                  <Button size="lg" className="w-full sm:w-auto">
                    Browse Genes
                    <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Button>
                </Link>
                <Link href="/browse/mutations">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Browse Mutations
                    <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
          
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <svg className="absolute left-1/2 top-0 h-[64rem] w-[128rem] -translate-x-1/2 opacity-20" aria-hidden="true">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M0 40V0H40" fill="none" stroke="currentColor" strokeOpacity="0.2" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 border-b border-border/40">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardDescription>Total Genes</CardDescription>
                  <CardTitle className="text-3xl font-bold text-primary">
                    {stats.totalGenes.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats.curatedGenes.toLocaleString()} curated
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardDescription>Total Mutations</CardDescription>
                  <CardTitle className="text-3xl font-bold text-primary">
                    {stats.totalMutations.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {stats.curatedMutations.toLocaleString()} curated
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardDescription>Publications</CardDescription>
                  <CardTitle className="text-3xl font-bold text-primary">
                    {stats.totalPapers.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Different papers
                  </p>
                </CardContent>
              </Card>
              
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardDescription>Expert Curators</CardDescription>
                  <CardTitle className="text-3xl font-bold text-primary">
                    {stats.totalCurators.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Reviewing and validating entries
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>



        {/* CTA Section */}
        <section className="py-20 bg-accent/30">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">Become a Curator</h2>
              <p className="mt-4 text-muted-foreground">
                Help us maintain and expand this database. Curators review entries, add annotations, 
                and ensure data quality for the research community.
              </p>
              <div className="mt-8">
                <Link href="/about">
                  <Button variant="outline" size="lg">
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
