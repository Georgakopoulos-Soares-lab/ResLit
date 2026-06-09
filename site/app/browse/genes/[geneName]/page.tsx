import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/browse/status-badge'
import { CommentsSection } from '@/components/comments/comments-section'
import { CombinedPapersSection } from '@/components/browse/combined-papers-section'
import { HistoryDialog } from '@/components/curator/history-dialog'
import { getGeneAllPapers, getMutationsByGeneName } from '@/lib/actions/browse'
import { getComments } from '@/lib/actions/comments'
import { createClient } from '@/lib/supabase/server'


interface PageProps {
  params: Promise<{ geneName: string }>
}

export default async function GeneDetailPage({ params }: PageProps) {
  const { geneName } = await params
  const decodedName = decodeURIComponent(geneName)

  const [genePapers, mutations, supabase] = await Promise.all([
    getGeneAllPapers(decodedName),
    getMutationsByGeneName(decodedName),
    createClient(),
  ])

  if (genePapers.length === 0 && mutations.length === 0) {
    notFound()
  }

  const gene = genePapers[0] ?? null

  const comments = gene ? await getComments('gene', gene.id) : []

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Group papers by allele (supports both data models)
  const alleleMap = genePapers.reduce<Record<string, typeof genePapers>>((acc, p) => {
    const key = p.allele || p.gene_name
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})
  const hasMultipleAlleles = Object.keys(alleleMap).length > 1

  // Rich per-allele summaries for the allele table
  const alleleEntries = Object.entries(alleleMap).map(([name, rows]) => ({
    name,
    paperCount: rows.length,
    resistances: [...new Set(rows.flatMap((r) => r.confers_resistance_to ?? []))],
    organisms: [...new Set(rows.flatMap((r) => r.organisms_tested_in ?? []))],
    countries: [...new Set(rows.map((r) => r.geographic_location || r.isolation_country).filter(Boolean) as string[])],
    years: [...new Set(rows.map((r) => r.year_pmid || r.year).filter(Boolean) as number[])].sort((a, b) => a - b),
    status: rows.reduce((best, r) => {
      const pri: Record<string, number> = { curated: 0, pending: 1, rejected: 2 }
      return (pri[r.status] ?? 99) < (pri[best.status] ?? 99) ? r : best
    }).status,
  }))

  // Overview aggregates (family-level)
  const allResistances = [...new Set(genePapers.flatMap((r) => r.confers_resistance_to ?? []))]
  const allOrganisms = [...new Set(genePapers.flatMap((r) => r.organisms_tested_in ?? []))]
  const mechanismClass = gene?.resistance_mechanism_class
    ?? genePapers.find((r) => r.resistance_mechanism_class)?.resistance_mechanism_class
  const uniquePaperCount = new Set(genePapers.map((r) => r.paper_pmid || r.pmid).filter(Boolean)).size

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/browse/genes" className="hover:text-foreground transition-colors">
            Browse Genes
          </Link>
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground font-medium">{decodedName}</span>
        </nav>

        {/* Header hero */}
        <div className="mb-8 rounded-xl border border-border/60 bg-gradient-to-br from-slate-50 via-white to-blue-50/50 p-6">

          {/* Gene name + PubMed button */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-1">
            <h1 className="text-4xl font-bold tracking-tight text-slate-800">{decodedName}</h1>
            {gene?.pmid && (
              <Button variant="outline" asChild className="shrink-0">
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${gene.pmid.split(',')[0].trim()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View on PubMed
                </a>
              </Button>
            )}
          </div>
          {gene?.encodes && (
            <p className="text-muted-foreground mb-5">{gene.encodes}</p>
          )}

          {/* External links + curation status */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://www.ncbi.nlm.nih.gov/pathogens/isolates/#AMR_genotypes:${decodedName}*`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors group"
              >
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-blue-400 group-hover:text-blue-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <div>
                  <div className="text-sm font-semibold leading-tight text-blue-900">NCBI Pathogen Isolates</div>
                  <div className="text-xs text-blue-600 mt-0.5">Bacterial genomes carrying this gene</div>
                </div>
              </a>
              <a
                href={`https://www.ncbi.nlm.nih.gov/pathogens/refgene/#${decodedName}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors group"
              >
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-indigo-400 group-hover:text-indigo-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <div>
                  <div className="text-sm font-semibold leading-tight text-indigo-900">NCBI Reference Gene Catalog</div>
                  <div className="text-xs text-indigo-600 mt-0.5">Known alleles and reference sequences</div>
                </div>
              </a>
              {gene?.encodes && (
                <a
                  href={`https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(gene.encodes)}+${encodeURIComponent(decodedName)}+AND+(taxonomy_id%3A2)`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors group"
                >
                  <svg className="h-4 w-4 mt-0.5 shrink-0 text-amber-400 group-hover:text-amber-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <div>
                    <div className="text-sm font-semibold leading-tight text-amber-900">UniProt</div>
                    <div className="text-xs text-amber-600 mt-0.5">Protein entries specific to {decodedName}</div>
                  </div>
                </a>
              )}
            </div>
            {gene && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-border bg-white shadow-sm">
                  <span className="text-xs text-muted-foreground">Curation Status</span>
                  <StatusBadge status={gene.gene_status} />
                </div>
                <HistoryDialog targetType="gene" targetId={gene.id} />
              </div>
            )}
          </div>

          {/* Overview */}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4">
            <p className="text-base font-bold text-foreground mb-3">Overview</p>
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              {mechanismClass && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Resistance Mechanism</dt>
                  <dd className="text-base font-medium capitalize">{mechanismClass.replace(/_/g, ' ')}</dd>
                </div>
              )}
              {allResistances.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Drug Classes</dt>
                  <dd className="text-base">{allResistances.join(', ')}</dd>
                </div>
              )}
              {allOrganisms.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Organisms</dt>
                  <dd className="text-base italic">
                    {allOrganisms.slice(0, 3).join(', ')}
                    {allOrganisms.length > 3 && <span className="not-italic text-muted-foreground"> +{allOrganisms.length - 3} more</span>}
                  </dd>
                </div>
              )}
              {hasMultipleAlleles && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Alleles</dt>
                  <dd className="text-base font-semibold">{alleleEntries.length}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-muted-foreground mb-1">Papers</dt>
                <dd className="text-base font-semibold">{uniquePaperCount}</dd>
              </div>
              {mutations.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Mutations</dt>
                  <dd className="text-base font-semibold">{mutations.length}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Main content — full width */}
        <div className="space-y-6">
            {/* Mutations — immediately below overview */}
            {mutations.length > 0 && (
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>
                    Mutations
                    <Badge variant="secondary" className="ml-2 text-sm font-normal">
                      {mutations.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left font-semibold px-4 py-3">Nucleotide Change</th>
                          <th className="text-left font-semibold px-4 py-3">Protein Change</th>
                          <th className="text-left font-semibold px-4 py-3">Type</th>
                          <th className="text-left font-semibold px-4 py-3">Effect on Function</th>
                          <th className="text-left font-semibold px-4 py-3">Resistance To</th>
                          <th className="text-left font-semibold px-4 py-3">Year</th>
                          <th className="text-left font-semibold px-4 py-3">Paper</th>
                          <th className="text-left font-semibold px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mutations.map((mutation) => (
                          <tr key={mutation.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <Link
                                href={`/browse/mutations/${mutation.id}`}
                                className="font-mono font-medium text-primary hover:underline"
                              >
                                {mutation.nucleotide_change || '-'}
                              </Link>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm">{mutation.protein_change || '-'}</td>
                            <td className="px-4 py-3 capitalize text-sm">{mutation.mutation_type || '-'}</td>
                            <td className="px-4 py-3 max-w-[200px] text-sm" title={mutation.effect_on_function || undefined}>
                              <span className="line-clamp-2">{mutation.effect_on_function || '-'}</span>
                            </td>
                            <td className="px-4 py-3">
                              {mutation.confers_resistance_to && mutation.confers_resistance_to.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {mutation.confers_resistance_to.slice(0, 2).map((ab) => (
                                    <span key={ab} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                                      {ab}
                                    </span>
                                  ))}
                                  {mutation.confers_resistance_to.length > 2 && (
                                    <span className="text-xs text-muted-foreground">+{mutation.confers_resistance_to.length - 2}</span>
                                  )}
                                </div>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                              {mutation.year_pmid ?? '-'}
                            </td>
                            <td className="px-4 py-3 max-w-[200px]">
                              {mutation.paper_pmid ? (
                                <div className="space-y-0.5">
                                  {mutation.title_pmid && (
                                    <p className="text-xs leading-tight line-clamp-2" title={mutation.title_pmid}>
                                      {mutation.title_pmid}
                                    </p>
                                  )}
                                  <a
                                    href={`https://pubmed.ncbi.nlm.nih.gov/${mutation.paper_pmid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline"
                                  >
                                    PMID: {mutation.paper_pmid}
                                  </a>
                                </div>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={mutation.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Allele Variants — shown when multiple alleles are present */}
            {hasMultipleAlleles && (
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>
                    Allele Variants
                    <Badge variant="secondary" className="ml-2 text-sm font-normal">
                      {alleleEntries.length}
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
                        {alleleEntries.map((allele) => (
                          <tr key={allele.name} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium font-mono">
                              {allele.name}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {allele.paperCount}
                            </td>
                            <td className="px-4 py-3 max-w-[180px]" title={allele.resistances.join(', ')}>
                              {allele.resistances.length > 0 ? (
                                <span>
                                  {allele.resistances.slice(0, 2).join(', ')}
                                  {allele.resistances.length > 2 && <span className="text-muted-foreground"> +{allele.resistances.length - 2}</span>}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 max-w-[160px] italic" title={allele.organisms.join(', ')}>
                              {allele.organisms.length > 0 ? (
                                <span>
                                  {allele.organisms[0]}
                                  {allele.organisms.length > 1 && <span className="not-italic text-muted-foreground"> +{allele.organisms.length - 1}</span>}
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
            )}

            {/* Papers — combined toggle between gene papers and mutation papers */}
            {(genePapers.length > 0 || mutations.some((m) => m.paper_pmid)) && (
              <CombinedPapersSection genePapers={genePapers} mutations={mutations} />
            )}

            {/* Comments Section */}
            {gene && (
              <CommentsSection
                targetType="gene"
                targetId={gene.id}
                initialComments={comments}
                currentUserId={user?.id}
              />
            )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
