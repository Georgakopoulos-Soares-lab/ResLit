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
import { EditMutationDialog } from '@/components/curator/edit-mutation-dialog'
import { HistoryDialog } from '@/components/curator/history-dialog'
import { StatusBadge } from '@/components/browse/status-badge'
import { browseMutations, getFilterOptions } from '@/lib/actions/browse'
import type { AMRMutation, BrowseFilters, PaginatedResult, FilterOptions, ValidationTier } from '@/lib/types'

export default function CuratorMutationsPage() {
  const [mutations, setMutations] = useState<AMRMutation[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [validationTier, setValidationTier] = useState<string>('')
  const [antibiotic, setAntibiotic] = useState<string>('')
  const [mutationType, setMutationType] = useState<string>('')
  const [geneName, setGeneName] = useState<string>('')
  const [sourceDatabase, setSourceDatabase] = useState<string>('')
  const [country, setCountry] = useState<string>('')

  useEffect(() => {
    getFilterOptions().then(setFilterOptions)
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const filters: BrowseFilters = {
        search: search || undefined,
        validationTier: (validationTier as ValidationTier) || undefined,
        antibiotic: antibiotic || undefined,
        mutationType: mutationType || undefined,
        geneName: geneName || undefined,
        country: country || undefined,
        sourceDatabases: sourceDatabase ? [sourceDatabase] : undefined,
        curatedOnly: false,
      }
      const result: PaginatedResult<AMRMutation> = await browseMutations(filters, page)
      setMutations(result.data)
      setTotal(result.total)
      setTotalPages(result.totalPages)
      setLoading(false)
    }
    load()
  }, [page, search, validationTier, antibiotic, mutationType, geneName, sourceDatabase, country])

  const handleReset = () => {
    setSearch('')
    setValidationTier('')
    setAntibiotic('')
    setMutationType('')
    setGeneName('')
    setSourceDatabase('')
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
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground font-medium">Mutations</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Curator: Mutations</h1>
          <p className="text-muted-foreground">
            Review and curate antimicrobial resistance mutations
            {!loading && <span className="ml-2 text-sm">— {total} {total === 1 ? 'entry' : 'entries'}</span>}
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
                {/* Search */}
                <div className="space-y-2">
                  <Label htmlFor="search" className="text-sm">Search</Label>
                  <Input
                    id="search"
                    placeholder="Mutation name, gene, change…"
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

                {/* Gene Name */}
                <div className="space-y-2">
                  <Label htmlFor="geneName" className="text-sm">Gene</Label>
                  <select
                    id="geneName"
                    value={geneName}
                    onChange={(e) => { setGeneName(e.target.value); setPage(1) }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All genes</option>
                    {filterOptions?.mutationGeneNames.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Mutation Type */}
                <div className="space-y-2">
                  <Label htmlFor="mutationType" className="text-sm">Mutation Type</Label>
                  <select
                    id="mutationType"
                    value={mutationType}
                    onChange={(e) => { setMutationType(e.target.value); setPage(1) }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All types</option>
                    {filterOptions?.mutationTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Antibiotic */}
                <div className="space-y-2">
                  <Label htmlFor="antibiotic" className="text-sm">Antibiotic</Label>
                  <select
                    id="antibiotic"
                    value={antibiotic}
                    onChange={(e) => { setAntibiotic(e.target.value); setPage(1) }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All antibiotics</option>
                    {filterOptions?.mutationAntibiotics.map((ab) => (
                      <option key={ab} value={ab}>{ab}</option>
                    ))}
                  </select>
                </div>

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

                {/* Country */}
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-sm">Country</Label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => { setCountry(e.target.value); setPage(1) }}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">All countries</option>
                    {filterOptions?.mutationCountries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <Separator />

                <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
                  Reset Filters
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Mutations List */}
          <div className="lg:col-span-3 space-y-4">
            {loading ? (
              <Card className="border-border/60">
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">Loading mutations…</p>
                </CardContent>
              </Card>
            ) : mutations.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">No mutations found matching your filters</p>
                </CardContent>
              </Card>
            ) : (
              mutations.map((mutation) => (
                <Card key={mutation.id} className="border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <Link
                            href={`/browse/mutations/${mutation.id}`}
                            className="text-lg font-semibold text-primary hover:underline"
                          >
                            {mutation.mutation_name ?? mutation.nucleotide_change ?? `Mutation #${mutation.id}`}
                          </Link>
                          <StatusBadge status={mutation.status} />
                          {mutation.mutation_type && (
                            <Badge variant="secondary" className="capitalize text-xs">
                              {mutation.mutation_type}
                            </Badge>
                          )}
                        </div>
                        {mutation.gene_name && (
                          <p className="text-sm text-muted-foreground">
                            Gene:{' '}
                            <Link
                              href={`/browse/genes/${encodeURIComponent(mutation.gene_name)}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {mutation.gene_name}
                            </Link>
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {/* Nucleotide change */}
                        {mutation.nucleotide_change && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Nucleotide Change</dt>
                            <dd className="font-mono font-medium text-sm mt-0.5">{mutation.nucleotide_change}</dd>
                          </div>
                        )}

                        {/* Protein change */}
                        {mutation.protein_change && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Protein Change</dt>
                            <dd className="font-mono font-medium text-sm mt-0.5">{mutation.protein_change}</dd>
                          </div>
                        )}

                        {/* Wild-type → Mutant */}
                        {mutation.wild_type && mutation.mutant && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Change</dt>
                            <dd className="font-mono text-sm mt-0.5">
                              {mutation.wild_type}{' '}
                              <span className="text-muted-foreground">→</span>{' '}
                              {mutation.mutant}
                            </dd>
                          </div>
                        )}

                        {/* Position */}
                        {mutation.position_in_molecule && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Position</dt>
                            <dd className="font-medium text-sm mt-0.5">{mutation.position_in_molecule}</dd>
                          </div>
                        )}

                        {/* Origin */}
                        {mutation.origin && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Origin</dt>
                            <dd className="text-sm mt-0.5 capitalize">{mutation.origin.replace(/_/g, ' ')}</dd>
                          </div>
                        )}

                        {/* Country */}
                        {mutation.country && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Country</dt>
                            <dd className="font-medium text-sm mt-0.5">{mutation.country}</dd>
                          </div>
                        )}

                        {/* Confers resistance to */}
                        {mutation.confers_resistance_to && mutation.confers_resistance_to.length > 0 && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Confers Resistance To</dt>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {mutation.confers_resistance_to.slice(0, 5).map((ab, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{ab}</Badge>
                              ))}
                              {mutation.confers_resistance_to.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{mutation.confers_resistance_to.length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Organisms */}
                        {mutation.organisms_observed_in && mutation.organisms_observed_in.length > 0 && (
                          <div className="sm:col-span-2">
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Organisms Observed In</dt>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {mutation.organisms_observed_in.slice(0, 3).map((org, i) => (
                                <Badge key={i} variant="outline" className="text-xs bg-muted/40">{org}</Badge>
                              ))}
                              {mutation.organisms_observed_in.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{mutation.organisms_observed_in.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Effect on function */}
                        {mutation.effect_on_function && (
                          <div className="sm:col-span-2 md:col-span-3">
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">Effect on Function</dt>
                            <dd className="text-sm mt-0.5 text-foreground/80">{mutation.effect_on_function}</dd>
                          </div>
                        )}

                        {/* PMID */}
                        {mutation.paper_pmid && (
                          <div>
                            <dt className="text-xs text-muted-foreground uppercase tracking-wide">PMID</dt>
                            <dd className="mt-0.5">
                              <a
                                href={`https://pubmed.ncbi.nlm.nih.gov/${mutation.paper_pmid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm"
                              >
                                {mutation.paper_pmid}
                              </a>
                              {mutation.year_pmid && (
                                <span className="text-xs text-muted-foreground ml-1">({mutation.year_pmid})</span>
                              )}
                            </dd>
                          </div>
                        )}
                      </div>

                      {/* Paper title */}
                      {mutation.title_pmid && (
                        <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
                          {mutation.title_pmid}
                        </p>
                      )}

                      <Separator />

                      <div className="flex items-center justify-between">
                        <Link
                          href={`/browse/mutations/${mutation.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          View full details
                        </Link>
                        <div className="flex items-center gap-2">
                          <EditMutationDialog mutation={mutation} onSuccess={() => window.location.reload()} />
                          <HistoryDialog targetType="mutation" targetId={mutation.id} compact />
                          <CurationActions
                            type="mutation"
                            id={mutation.id}
                            onSuccess={() => window.location.reload()}
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
              disabled={page === 1 || loading}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || loading}
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
