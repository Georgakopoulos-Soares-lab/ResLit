'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GenePaperTabs } from './gene-paper-tabs'
import { GroupedMutationPapers } from './mutation-paper-groups'
import type { AMRGene, AMRMutation } from '@/lib/types'

interface CombinedPapersSectionProps {
  genePapers: AMRGene[]
  mutations: AMRMutation[]
}

export function CombinedPapersSection({ genePapers, mutations }: CombinedPapersSectionProps) {
  const mutationsWithPapers = mutations.filter((m) => m.paper_pmid)
  const hasGenePapers = genePapers.length > 0
  const hasMutationPapers = mutationsWithPapers.length > 0

  const [source, setSource] = useState<'genes' | 'mutations'>(hasGenePapers ? 'genes' : 'mutations')
  const [selectedAllele, setSelectedAllele] = useState('all')
  const [selectedMutation, setSelectedMutation] = useState('all')

  // Allele names for gene papers filter
  const alleleNames = [...new Set(genePapers.map((p) => p.allele || p.gene_name).filter(Boolean) as string[])]
  const hasMultipleAlleles = alleleNames.length > 1

  const filteredGenePapers =
    selectedAllele === 'all'
      ? genePapers
      : genePapers.filter((p) => (p.allele || p.gene_name) === selectedAllele)

  // Deduplicate mutation filter buttons by identity (protein_change or nucleotide_change)
  const mutationIdentities = [...new Map(
    mutationsWithPapers.map((m) => {
      const label = m.protein_change || m.nucleotide_change || m.mutation_name || m.id
      return [label, { label, id: m.id }]
    })
  ).values()]
  const hasMultipleMutations = mutationIdentities.length > 1

  const filteredMutations =
    selectedMutation === 'all'
      ? mutationsWithPapers
      : mutationsWithPapers.filter((m) =>
          (m.protein_change || m.nucleotide_change || m.mutation_name || m.id) === selectedMutation
        )

  const totalPapers = new Set([
    ...genePapers.map((p) => p.paper_pmid || p.pmid).filter(Boolean),
    ...mutationsWithPapers.map((m) => m.paper_pmid).filter(Boolean),
  ]).size

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>
          Papers
          <Badge variant="secondary" className="ml-2 text-sm font-normal">
            {totalPapers}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Source toggle — only when both types exist */}
        {hasGenePapers && hasMutationPapers && (
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 gap-1">
            <button
              onClick={() => { setSource('genes'); setSelectedAllele('all') }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                source === 'genes'
                  ? 'bg-white shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              AMR Gene Papers
            </button>
            <button
              onClick={() => { setSource('mutations'); setSelectedMutation('all') }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                source === 'mutations'
                  ? 'bg-white shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Mutation Papers
            </button>
          </div>
        )}

        {/* Gene papers */}
        {source === 'genes' && (
          <div className="space-y-4">
            {hasMultipleAlleles && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedAllele('all')}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    selectedAllele === 'all'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  All alleles
                </button>
                {alleleNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedAllele(name)}
                    className={`px-3 py-1 text-sm font-mono rounded-full border transition-colors ${
                      selectedAllele === name
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <GenePaperTabs papers={filteredGenePapers} />
          </div>
        )}

        {/* Mutation papers */}
        {source === 'mutations' && (
          <div className="space-y-4">
            {hasMultipleMutations && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedMutation('all')}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    selectedMutation === 'all'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  All mutations
                </button>
                {mutationIdentities.map((mi) => (
                  <button
                    key={mi.label}
                    onClick={() => setSelectedMutation(mi.label)}
                    className={`px-3 py-1 text-sm font-mono rounded-full border transition-colors ${
                      selectedMutation === mi.label
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {mi.label}
                  </button>
                ))}
              </div>
            )}
            <GroupedMutationPapers mutations={filteredMutations} />
          </div>
        )}

      </CardContent>
    </Card>
  )
}
