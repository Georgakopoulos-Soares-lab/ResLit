"use client"

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './status-badge'
import type { AMRGene } from '@/lib/types'

interface GenesCardsProps {
  genes: AMRGene[]
}

export function GenesCards({ genes }: GenesCardsProps) {
  if (genes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="h-12 w-12 text-muted-foreground/50 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-2.569.428a7.5 7.5 0 01-10.132 0l-2.57-.428c-1.716-.293-2.298-2.379-1.066-3.61L5 14.5"
          />
        </svg>
        <h3 className="font-medium text-lg mb-1">No genes found</h3>
        <p className="text-muted-foreground text-sm">
          Try adjusting your filters or search terms
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {genes.map((gene) => {
        const pmid = gene.paper_pmid || gene.pmid || null
        const country = gene.geographic_location || gene.isolation_country || null
        const year = gene.year_pmid || gene.year || null

        return (
          <Link key={gene.id} href={`/browse/genes/${encodeURIComponent(gene.gene_name)}`} prefetch={false}>
            <Card className="h-full border-border/60 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-semibold text-primary">
                    {gene.gene_name}
                  </CardTitle>
                  <StatusBadge status={gene.gene_status} />
                </div>
                {gene.resistance_mechanism_class && (
                  <Badge variant="outline" className="w-fit text-xs capitalize mt-1">
                    {gene.resistance_mechanism_class.replace(/_/g, ' ')}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Confers resistance to */}
                {gene.confers_resistance_to && gene.confers_resistance_to.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                      Confers Resistance To
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {gene.confers_resistance_to.slice(0, 3).map((ab) => (
                        <Badge key={ab} variant="secondary" className="text-xs">
                          {ab}
                        </Badge>
                      ))}
                      {gene.confers_resistance_to.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{gene.confers_resistance_to.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Encodes */}
                {gene.encodes && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                      Encodes
                    </span>
                    <p className="text-sm font-medium truncate" title={gene.encodes}>
                      {gene.encodes}
                    </p>
                  </div>
                )}

                {/* Organisms */}
                {gene.organisms_tested_in && gene.organisms_tested_in.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                      Organisms Tested In
                    </span>
                    <p
                      className="text-sm font-medium truncate italic"
                      title={gene.organisms_tested_in.join(', ')}
                    >
                      {gene.organisms_tested_in[0]}
                      {gene.organisms_tested_in.length > 1 && (
                        <span className="not-italic text-muted-foreground">
                          {' '}+{gene.organisms_tested_in.length - 1}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Geographic Location */}
                {country && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                      Geographic Location
                    </span>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <svg
                        className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      {country}
                    </div>
                  </div>
                )}

                {/* Paper title + PMID */}
                {pmid && (
                  <div className="pt-2 border-t border-border/40" onClick={(e) => e.preventDefault()}>
                    {gene.title_pmid && (
                      <p
                        className="text-xs text-foreground leading-snug line-clamp-2 mb-1"
                        title={gene.title_pmid}
                      >
                        {gene.title_pmid}
                      </p>
                    )}
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      PMID: {pmid}{year ? ` · ${year}` : ''}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
