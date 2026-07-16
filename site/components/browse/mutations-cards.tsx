"use client"

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './status-badge'
import type { AMRMutation } from '@/lib/types'

interface MutationsCardsProps {
  mutations: AMRMutation[]
}

export function MutationsCards({ mutations }: MutationsCardsProps) {
  if (mutations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="h-12 w-12 text-muted-foreground/50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <h3 className="font-medium text-lg mb-1">No mutations found</h3>
        <p className="text-muted-foreground text-sm">
          Try adjusting your filters or search terms
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {mutations.map((mutation) => (
        <Link key={mutation.id} href={`/browse/mutations/${mutation.id}`} prefetch={false}>
          <Card className="h-full border-border/60 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg font-semibold text-primary font-mono">
                  {mutation.nucleotide_change || 'Unknown'}
                </CardTitle>
                <StatusBadge status={mutation.status} />
              </div>
              {mutation.gene_name && (
                <p className="text-sm text-muted-foreground">
                  Gene: <span className="text-primary">{mutation.gene_name}</span>
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Mutation Type */}
              {mutation.mutation_type && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Type
                  </span>
                  <p className="text-sm capitalize">
                    {mutation.mutation_type}
                  </p>
                </div>
              )}

              {/* Protein Change */}
              {mutation.protein_change && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Protein Change
                  </span>
                  <p className="text-sm font-mono font-medium">
                    {mutation.protein_change}
                  </p>
                </div>
              )}

              {/* Effect */}
              {mutation.effect_on_function && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Effect
                  </span>
                  <p className="text-sm line-clamp-3" title={mutation.effect_on_function}>
                    {mutation.effect_on_function}
                  </p>
                </div>
              )}

              {/* Resistance To */}
              {mutation.confers_resistance_to && mutation.confers_resistance_to.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
                    Resistance To
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {mutation.confers_resistance_to.map((antibiotic) => (
                      <Badge key={antibiotic} variant="secondary" className="text-xs">
                        {antibiotic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Info */}
              {mutation.validated_by && (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                    Validated By
                  </span>
                  <p className="text-sm">
                    {mutation.validated_by}
                  </p>
                </div>
              )}

              {/* PMID */}
              {mutation.paper_pmid && (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide block mb-1">
                    PubMed
                  </span>
                  <a 
                    href={`https://pubmed.ncbi.nlm.nih.gov/${mutation.paper_pmid}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {mutation.paper_pmid}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
