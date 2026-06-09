'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GenePaperTabs } from './gene-paper-tabs'
import type { AMRGene } from '@/lib/types'

interface AlleleFilteredPapersProps {
  papers: AMRGene[]
}

export function AlleleFilteredPapers({ papers }: AlleleFilteredPapersProps) {
  const [selected, setSelected] = useState<string>('all')

  const alleleNames = [...new Set(papers.map((p) => p.allele || p.gene_name).filter(Boolean))]

  const filtered = selected === 'all'
    ? papers
    : papers.filter((p) => (p.allele || p.gene_name) === selected)

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>
          Papers
          {selected !== 'all' && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">for {selected}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelected('all')}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              selected === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted'
            }`}
          >
            All alleles
          </button>
          {alleleNames.map((name) => (
            <button
              key={name}
              onClick={() => setSelected(name)}
              className={`px-3 py-1 text-sm font-mono rounded-full border transition-colors ${
                selected === name
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <GenePaperTabs papers={filtered} />
      </CardContent>
    </Card>
  )
}
