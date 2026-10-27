'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurationActions } from '@/components/curator/curation-actions'
import { EditGeneDialog } from '@/components/curator/edit-gene-dialog'
import { HistoryDialog } from '@/components/curator/history-dialog'
import { StatusBadge } from '@/components/browse/status-badge'
import { browseGenes, getFilterOptions } from '@/lib/actions/browse'
import type { AMRGene, BrowseFilters, PaginatedResult, FilterOptions, ValidationTier } from '@/lib/types'

export default function CuratorGenesPage() {
  const [genes, setGenes] = useState<AMRGene[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  
  // Filter state
  const [search, setSearch] = useState('')
  const [geneNameSearch, setGeneNameSearch] = useState('')
  const [alleleSearch, setAlleleSearch] = useState('')
  const [validationTier, setValidationTier] = useState<string>('')
  const [mechanismClass, setMechanismClass] = useState<string>('')
  const [antibiotic, setAntibiotic] = useState<string>('')
  const [encodes, setEncodes] = useState<string>('')
  const [sourceDatabase, setSourceDatabase] = useState<string>('')
  const [organism, setOrganism] = useState<string>('')
  const [country, setCountry] = useState<string>('')

  // Load filter options
  useEffect(() => {
    const loadOptions = async () => {
      const options = await getFilterOptions()
      setFilterOptions(options)
    }
    loadOptions()
  }, [])

  // Load genes with current filters
  useEffect(() => {
    const loadGenes = async () => {
      setLoading(true)
      const filters: BrowseFilters = {
        search: search || undefined,
        geneNameSearch: geneNameSearch || undefined,
        alleleSearch: alleleSearch || undefined,
        validationTier: (validationTier as ValidationTier) || undefined,
        mechanismClass: mechanismClass || undefined,
        antibiotic: antibiotic || undefined,
        encodes: encodes || undefined,
        organism: organism || undefined,
        country: country || undefined,
        sourceDatabases: sourceDatabase ? [sourceDatabase] : undefined,
      }
      const result: PaginatedResult<AMRGene> = await browseGenes(filters, page)
      setGenes(result.data)
      setTotalPages(result.totalPages)
      setLoading(false)
    }
    loadGenes()
  }, [page, search, geneNameSearch, alleleSearch, validationTier, mechanismClass, antibiotic, encodes, sourceDatabase, organism, country])

  const handleResetFilters = () => {
    setSearch('')
    setGeneNameSearch('')
    setAlleleSearch('')
    setValidationTier('')
    setMechanismClass('')
    setAntibiotic('')
    setEncodes('')
    setSourceDatabase('')
    setOrganism('')
    setCountry('')
    setPage(1)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/curator/dashboard" className="hover:text-foreground transition-colors">
            Curator Dashboard
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
          <span className="text-foreground font-medium">Genes</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Curator: Genes</h1>
          <p className="text-muted-foreground">
            Review and curate antimicrobial resistance genes
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <Card className="border-border/60 sticky top-4">
              <CardHeader>
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Gene Name Search */}
                <div className="space-y-2">
                  <Label htmlFor="geneNameSearch" className="text-sm">Gene Name</Label>
                  <Input
                    id="geneNameSearch"
                    placeholder="e.g., aac(2')-IIa"
                    value={geneNameSearch}
                    onChange={(e) => { setGeneNameSearch(e.target.value); setPage(1) }}
                  />
                </div>

                {/* Allele Search */}
                <div className="space-y-2">
                  <Label htmlFor="alleleSearch" className="text-sm">Allele</Label>
                  <Input
                    id="alleleSearch"
                    placeholder="e.g., blaADC-30"
                    value={alleleSearch}
                    onChange={(e) => { setAlleleSearch(e.target.value); setPage(1) }}
                  />
                </div>

                {/* Combined Search */}
                <div className="space-y-2">
                  <Label htmlFor="search" className="text-sm">Search All (name, allele, encodes)</Label>
                  <Input
                    id="search"
                    placeholder="Search across all fields…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  />
                </div>

                <Separator />

                {/* Validation Status */}
                <div className="space-y-2">
                  <Label htmlFor="validationTier" className="text-sm">Validation Status</Label>
                  <select
                    id="validationTier"
                    value={validationTier}
                    onChange={(e) => { setValidationTier(e.target.value); setPage(1) }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All statuses</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Established">Established</option>
                    <option value="Supported">Supported</option>
                    <option value="Candidate">Candidate</option>
                  </select>
                </div>

                {/* Mechanism Class */}
                <div className="space-y-2">
                  <Label htmlFor="mechanism" className="text-sm">Mechanism Class</Label>
                  <select
                    id="mechanism"
                    value={mechanismClass}
                    onChange={(e) => {
                      setMechanismClass(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All classes</option>
                    {filterOptions?.mechanismClasses.map((mc) => (
                      <option key={mc} value={mc}>
                        {mc.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Antibiotic */}
                <div className="space-y-2">
                  <Label htmlFor="antibiotic" className="text-sm">Antibiotic</Label>
                  <select
                    id="antibiotic"
                    value={antibiotic}
                    onChange={(e) => {
                      setAntibiotic(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All antibiotics</option>
                    {filterOptions?.antibiotics.map((ab) => (
                      <option key={ab} value={ab}>
                        {ab}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Encodes */}
                {filterOptions && filterOptions.encodes.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="encodes" className="text-sm">Encodes</Label>
                    <select
                      id="encodes"
                      value={encodes}
                      onChange={(e) => { setEncodes(e.target.value); setPage(1) }}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">All proteins</option>
                      {filterOptions.encodes.map((enc) => (
                        <option key={enc} value={enc}>{enc}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Source Database */}
                {filterOptions && filterOptions.sourceDatabases.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="sourceDb" className="text-sm">Source Database</Label>
                    <select
                      id="sourceDb"
                      value={sourceDatabase}
                      onChange={(e) => { setSourceDatabase(e.target.value); setPage(1) }}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value="">All databases</option>
                      {filterOptions.sourceDatabases.map((db) => (
                        <option key={db} value={db}>{db}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Organism */}
                <div className="space-y-2">
                  <Label htmlFor="organism" className="text-sm">Organism</Label>
                  <select
                    id="organism"
                    value={organism}
                    onChange={(e) => {
                      setOrganism(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All organisms</option>
                    {filterOptions?.organisms.map((org) => (
                      <option key={org} value={org}>
                        {org}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Country */}
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-sm">Country</Label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value)
                      setPage(1)
                    }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All countries</option>
                    {filterOptions?.countries.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <Separator />

                {/* Reset Filters */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="w-full"
                >
                  Reset Filters
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Genes List */}
          <div className="lg:col-span-3 space-y-4">
            {loading ? (
              <Card className="border-border/60">
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">Loading genes...</p>
                </CardContent>
              </Card>
            ) : genes.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">No genes found matching your filters</p>
                </CardContent>
              </Card>
            ) : (
              genes.map((gene) => (
                <Card key={gene.id} className="border-border/60">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link
                            href={`/browse/genes/${encodeURIComponent(gene.gene_name)}`}
                            prefetch={false}
                            className="text-lg font-semibold text-primary hover:underline"
                          >
                            {gene.gene_name}
                          </Link>
                          <StatusBadge status={gene.status} />
                        </div>
                        {gene.encodes && (
                          <p className="text-sm text-muted-foreground">{gene.encodes}</p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                        {gene.allele && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase">Allele</dt>
                            <dd className="font-medium">{gene.allele}</dd>
                          </div>
                        )}
                        {gene.resistance_mechanism_class && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase">Mechanism Class</dt>
                            <dd>
                              <Badge variant="secondary" className="capitalize">
                                {gene.resistance_mechanism_class.replace(/_/g, ' ')}
                              </Badge>
                            </dd>
                          </div>
                        )}
                        {gene.role_in_paper && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase">Role in Paper</dt>
                            <dd className="capitalize text-sm">{gene.role_in_paper.replace(/_/g, ' ')}</dd>
                          </div>
                        )}
                        {gene.isolation_country && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase">Country</dt>
                            <dd className="font-medium">{gene.isolation_country}</dd>
                          </div>
                        )}
                        {gene.confers_resistance_to && gene.confers_resistance_to.length > 0 && (
                          <div className="sm:col-span-2 md:col-span-1">
                            <dt className="text-xs text-muted-foreground uppercase">Confers Resistance To</dt>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {gene.confers_resistance_to.slice(0, 3).map((ab, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {ab}
                                </Badge>
                              ))}
                              {gene.confers_resistance_to.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{gene.confers_resistance_to.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                        {gene.paper_pmid && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase">PMID</dt>
                            <dd>
                              <a
                                href={`https://pubmed.ncbi.nlm.nih.gov/${gene.paper_pmid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm"
                              >
                                {gene.paper_pmid}
                              </a>
                            </dd>
                          </div>
                        )}
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between">
                        <Link
                          href={`/browse/genes/${encodeURIComponent(gene.gene_name)}`}
                          prefetch={false}
                          className="text-sm text-primary hover:underline"
                        >
                          View full details
                        </Link>
                        <div className="flex items-center gap-2">
                          <EditGeneDialog gene={gene} onSuccess={() => window.location.reload()} />
                          <HistoryDialog targetType="gene" targetId={gene.id} compact />
                          <CurationActions
                            type="gene"
                            id={gene.id}
                            onSuccess={() => {
                              window.location.reload()
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 mt-8">
            <Button
              variant="outline"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
