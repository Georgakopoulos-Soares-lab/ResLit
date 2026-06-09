import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/browse/status-badge'
import { getGeneFamilyData } from '@/lib/actions/browse'
import type { AMRGene } from '@/lib/types'

interface PageProps {
  params: Promise<{ family: string }>
}

export default async function GeneFamilyPage({ params }: PageProps) {
  const { family: encodedFamily } = await params
  const family = decodeURIComponent(encodedFamily)

  const allRows = await getGeneFamilyData(family)

  if (allRows.length === 0) notFound()

  // Group rows by allele name — support both storage models:
  // Model 1: gene_name = "blaADC-30" (allele in gene_name)
  // Model 2: gene_name = "blaADC", allele = "blaADC-30"
  const alleleMap = allRows.reduce<Record<string, AMRGene[]>>((acc, g) => {
    const key = g.allele || g.gene_name
    if (!acc[key]) acc[key] = []
    acc[key].push(g)
    return acc
  }, {})

  const alleles = Object.entries(alleleMap).map(([name, rows]) => ({
    name,
    primaryId: rows[0].id,
    paperCount: rows.length,
    resistances: [...new Set(rows.flatMap((r) => r.confers_resistance_to ?? []))],
    organisms: [...new Set(rows.flatMap((r) => r.organisms_tested_in ?? []))],
    countries: [...new Set(rows.map((r) => r.geographic_location || r.isolation_country).filter(Boolean) as string[])],
    years: [...new Set(rows.map((r) => r.year_pmid || r.year).filter(Boolean) as number[])].sort(),
    papers: rows.map((r) => ({ pmid: r.paper_pmid || r.pmid, title: r.title_pmid, year: r.year_pmid || r.year })).filter((p) => p.pmid),
    status: rows.reduce((best, r) => {
      const pri = { curated: 0, pending: 1, rejected: 2 }
      return (pri[r.status] ?? 99) < (pri[best.status] ?? 99) ? r : best
    }).status,
  }))

  // Family-level aggregates
  const allResistances = [...new Set(allRows.flatMap((r) => r.confers_resistance_to ?? []))]
  const allOrganisms = [...new Set(allRows.flatMap((r) => r.organisms_tested_in ?? []))]
  const mechanismClass = allRows.find((r) => r.resistance_mechanism_class)?.resistance_mechanism_class
  const encodes = allRows.find((r) => r.encodes)?.encodes
  const uniquePapers = [...new Map(
    allRows
      .map((r) => ({ pmid: r.paper_pmid || r.pmid, title: r.title_pmid, year: r.year_pmid || r.year }))
      .filter((p) => p.pmid)
      .map((p) => [p.pmid, p])
  ).values()]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/browse/genes" className="hover:text-foreground transition-colors">
            Browse Genes
          </Link>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground font-medium">{family} Family</span>
        </nav>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">{family}</h1>
            <Badge variant="outline" className="text-sm">Gene Family</Badge>
          </div>
          {mechanismClass && (
            <p className="text-muted-foreground capitalize">
              {mechanismClass.replace(/_/g, ' ')}
              {allOrganisms.length > 0 && ` · ${allOrganisms[0]}`}
            </p>
          )}

          {/* External links */}
          <div className="flex flex-wrap gap-3 mt-4">
            <a
              href={`https://www.ncbi.nlm.nih.gov/pathogens/isolates/#AMR_genotypes:${family}*`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-border bg-muted hover:bg-muted/70 transition-colors group"
            >
              <svg className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <div>
                <div className="text-sm font-semibold leading-tight">NCBI Pathogen Isolates</div>
                <div className="text-xs text-muted-foreground mt-0.5">Genomes carrying any {family} allele</div>
              </div>
            </a>
            <a
              href={`https://www.ncbi.nlm.nih.gov/pathogens/refgene/#${family}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-border bg-muted hover:bg-muted/70 transition-colors group"
            >
              <svg className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <div>
                <div className="text-sm font-semibold leading-tight">NCBI Reference Gene Catalog</div>
                <div className="text-xs text-muted-foreground mt-0.5">All known alleles and reference sequences</div>
              </div>
            </a>
            {encodes && (
              <a
                href={`https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(encodes)}+AND+(taxonomy_id%3A2)`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-border bg-muted hover:bg-muted/70 transition-colors group"
              >
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <div>
                  <div className="text-sm font-semibold leading-tight">UniProt</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Protein entries for the encoded enzyme</div>
                </div>
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Allele table */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>
                  Alleles
                  <Badge variant="secondary" className="ml-2 text-sm font-normal">
                    {alleles.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left font-semibold px-4 py-3">Allele</th>
                        <th className="text-left font-semibold px-4 py-3">Papers</th>
                        <th className="text-left font-semibold px-4 py-3">Drug Classes</th>
                        <th className="text-left font-semibold px-4 py-3">Organisms</th>
                        <th className="text-left font-semibold px-4 py-3">Countries</th>
                        <th className="text-left font-semibold px-4 py-3">Years</th>
                        <th className="text-left font-semibold px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alleles.map((allele) => (
                        <tr key={allele.name} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <Link
                              href={`/browse/genes/${encodeURIComponent(allele.name)}`}
                              className="font-medium text-primary hover:underline font-mono"
                            >
                              {allele.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {allele.paperCount} {allele.paperCount === 1 ? 'paper' : 'papers'}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]" title={allele.resistances.join(', ')}>
                            {allele.resistances.length > 0 ? (
                              <span>
                                {allele.resistances.slice(0, 2).join(', ')}
                                {allele.resistances.length > 2 && (
                                  <span className="text-muted-foreground"> +{allele.resistances.length - 2}</span>
                                )}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 max-w-[160px] italic" title={allele.organisms.join(', ')}>
                            {allele.organisms.length > 0 ? (
                              <span>
                                {allele.organisms[0]}
                                {allele.organisms.length > 1 && (
                                  <span className="not-italic text-muted-foreground"> +{allele.organisms.length - 1}</span>
                                )}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {allele.countries.join(', ') || '-'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {allele.years.join(', ') || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={allele.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* All papers */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>
                  Papers
                  <Badge variant="secondary" className="ml-2 text-sm font-normal">
                    {uniquePapers.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {uniquePapers.map((p, i) => (
                  <div key={`${p.pmid}-${i}`} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-semibold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      {p.title && (
                        <p className="text-sm font-medium leading-snug mb-1">{p.title}</p>
                      )}
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        PMID: {p.pmid}{p.year ? ` · ${p.year}` : ''}
                      </a>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar overview */}
          <div className="space-y-6">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {mechanismClass && (
                  <div>
                    <dt className="text-sm text-muted-foreground mb-1">Resistance Mechanism</dt>
                    <Badge variant="secondary" className="capitalize">
                      {mechanismClass.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                )}
                {allResistances.length > 0 && (
                  <div>
                    <dt className="text-sm text-muted-foreground mb-1">Drug Classes</dt>
                    <div className="flex flex-wrap gap-1">
                      {allResistances.map((r) => (
                        <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {allOrganisms.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <dt className="text-sm text-muted-foreground mb-1">Organisms</dt>
                      <ul className="space-y-1">
                        {allOrganisms.slice(0, 5).map((o) => (
                          <li key={o} className="text-sm italic">{o}</li>
                        ))}
                        {allOrganisms.length > 5 && (
                          <li className="text-xs text-muted-foreground">+{allOrganisms.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  </>
                )}
                <Separator />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{alleles.length} known alleles</p>
                  <p>{uniquePapers.length} papers in ResLit</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
