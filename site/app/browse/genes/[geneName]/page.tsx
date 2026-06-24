import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ValidationTierBadge } from '@/components/browse/validation-tier-badge'
import { MutationsTable } from '@/components/browse/mutations-table'
import { CommentsSection } from '@/components/comments/comments-section'
import { CombinedPapersSection } from '@/components/browse/combined-papers-section'
import { HistoryDialog } from '@/components/curator/history-dialog'
import { getGeneAllPapers, getMutationsByGeneName, getValidationTiers, getMutationValidationTiers } from '@/lib/actions/browse'
import { getComments } from '@/lib/actions/comments'
import { createClient } from '@/lib/supabase/server'
import type { ValidationTier } from '@/lib/types'


interface PageProps {
  params: Promise<{ geneName: string }>
}

export default async function GeneDetailPage({ params }: PageProps) {
  const { geneName } = await params
  const decodedName = decodeURIComponent(geneName)

  const [genePapers, rawMutations, supabase, tiers, mutTiers] = await Promise.all([
    getGeneAllPapers(decodedName),
    getMutationsByGeneName(decodedName),
    createClient(),
    getValidationTiers(),
    getMutationValidationTiers(),
  ])

  const mutations = rawMutations.map((m) => ({
    ...m,
    validation_tier: (mutTiers.get(m.id)?.tier ?? 'Candidate') as ValidationTier,
    all_databases: mutTiers.get(m.id)?.databases ?? (m.source_database ? [m.source_database] : []),
  }))

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
    databases: [...new Set(rows.map((r) => r.source_database).filter(Boolean) as string[])].sort(),
    resistances: [...new Set(rows.flatMap((r) => r.confers_resistance_to ?? []))],
    organisms: [...new Set(rows.flatMap((r) => r.organisms_tested_in ?? []))],
    countries: [...new Set(rows.map((r) => r.geographic_location || r.isolation_country).filter(Boolean) as string[])],
    years: [...new Set(rows.map((r) => r.year_pmid || r.year).filter(Boolean) as number[])].sort((a, b) => a - b),
    sequenceAccession: rows.map((r) => r.sequence_accession).find(Boolean) ?? null,
    proteinAccession: rows.map((r) => r.protein_accession).find(Boolean) ?? null,
  }))

  // Overview aggregates (family-level)
  const allResistances = [...new Set(genePapers.flatMap((r) => r.confers_resistance_to ?? []))]
  const allOrganisms = [...new Set(genePapers.flatMap((r) => r.organisms_tested_in ?? []))]
  const mechanismClass = gene?.resistance_mechanism_class
    ?? genePapers.find((r) => r.resistance_mechanism_class)?.resistance_mechanism_class
  const mechanism = gene?.mechanism ?? genePapers.find((r) => r.mechanism)?.mechanism
  const validationMethod = gene?.validation_method ?? genePapers.find((r) => r.validation_method)?.validation_method
  const allLocations = [...new Set(genePapers.map((r) => r.geographic_location || r.isolation_country).filter(Boolean) as string[])].sort()
  const uniquePaperCount = new Set([
    ...genePapers.map((r) => r.paper_pmid || r.pmid).filter(Boolean),
    ...mutations.map((m) => m.paper_pmid).filter(Boolean),
  ]).size
  const allDatabases = [...new Set(genePapers.map((r) => r.source_database).filter(Boolean))].sort() as string[]
  const validationInfo = tiers.get(decodedName)
  const validationTier = validationInfo?.tier ?? 'Candidate'
  const confirmationReason = validationInfo?.reason

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
              <a
                href={`https://browse.amrrules.org/?search=${encodeURIComponent(decodedName.toLowerCase())}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors group"
              >
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400 group-hover:text-emerald-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <div>
                  <div className="text-sm font-semibold leading-tight text-emerald-900">AMR Rules</div>
                  <div className="text-xs text-emerald-600 mt-0.5">Browse AMR rules for {decodedName}</div>
                </div>
              </a>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-border bg-white shadow-sm">
                <span className="text-xs text-muted-foreground">Validation Status</span>
                <ValidationTierBadge tier={validationTier} reason={confirmationReason} />
              </div>
              {gene && <HistoryDialog targetType="gene" targetId={gene.id} allTargetIds={genePapers.map((g) => g.id)} confirmationReason={confirmationReason} />}
            </div>
          </div>

          {/* Overview */}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-5 py-4">
            <p className="text-base font-bold text-foreground mb-3">Overview</p>
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              {mechanism && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Mechanism</dt>
                  <dd className="text-base font-medium">{mechanism}</dd>
                </div>
              )}
              {validationMethod && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Validation Method</dt>
                  <dd className="text-base font-medium">{validationMethod}</dd>
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
                    {allOrganisms.join(', ')}
                  </dd>
                </div>
              )}
              {allLocations.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Geographic Location</dt>
                  <dd className="text-base">
                    {allLocations.slice(0, 5).join(', ')}
                    {allLocations.length > 5 && <span className="text-muted-foreground"> +{allLocations.length - 5} more</span>}
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
              {allDatabases.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Databases</dt>
                  <dd className="flex flex-wrap gap-1">
                    {allDatabases.map((db) => (
                      <span key={db} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {db}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {mutations.length > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground mb-1">Mutations</dt>
                  <dd className="text-base font-semibold">{new Set(mutations.map((m) => m.protein_change ? `p:${m.gene_name}:${m.protein_change}` : `n:${m.gene_name}:${m.nucleotide_change}`)).size}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Main content — full width */}
        <div className="space-y-6">
            {/* Mutations — grouped table */}
            {mutations.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-4">Mutations</h2>
                <MutationsTable mutations={mutations} hideGene />
              </div>
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
                          <th className="text-left font-semibold px-4 py-3">Database</th>
                          <th className="text-left font-semibold px-4 py-3">Papers</th>
                          <th className="text-left font-semibold px-4 py-3">Drug Classes</th>
                          <th className="text-left font-semibold px-4 py-3">Organisms</th>
                          <th className="text-left font-semibold px-4 py-3">Countries</th>
                          <th className="text-left font-semibold px-4 py-3">Years</th>
                          <th className="text-left font-semibold px-4 py-3">Sequence Accession</th>
                          <th className="text-left font-semibold px-4 py-3">Protein Accession</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alleleEntries.map((allele) => (
                          <tr key={allele.name} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium font-mono">
                              {allele.name}
                            </td>
                            <td className="px-4 py-3">
                              {allele.databases.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {allele.databases.map((db) => (
                                    <span key={db} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                      {db}
                                    </span>
                                  ))}
                                </div>
                              ) : '-'}
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
                            <td className="px-4 py-3 text-sm font-mono">
                              {allele.sequenceAccession ? (
                                <a
                                  href={`https://www.ncbi.nlm.nih.gov/nuccore/${allele.sequenceAccession}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {allele.sequenceAccession}
                                </a>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono">
                              {allele.proteinAccession ? (
                                <a
                                  href={`https://www.ncbi.nlm.nih.gov/protein/${allele.proteinAccession}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {allele.proteinAccession}
                                </a>
                              ) : '-'}
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
