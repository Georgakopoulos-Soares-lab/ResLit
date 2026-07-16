import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ValidationTierBadge } from './validation-tier-badge'

import type { AMRGene } from '@/lib/types'


interface GenesTableProps {
  genes: AMRGene[]
}

export function GenesTable({ genes }: GenesTableProps) {
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

  // Group rows by gene_name so each gene appears once with a papers count
  const grouped = genes.reduce<Record<string, AMRGene[]>>((acc, gene) => {
    const key = gene.gene_name
    if (!acc[key]) acc[key] = []
    acc[key].push(gene)
    return acc
  }, {})

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/60 border-b-2 border-border">
            <TableHead className="font-bold text-foreground w-[11%]">Gene Name</TableHead>
            <TableHead className="font-bold text-foreground w-[5%] text-center">Alleles</TableHead>
            <TableHead className="font-bold text-foreground w-[13%]">Encodes</TableHead>
            <TableHead className="font-bold text-foreground w-[25%]">Confers Resistance To</TableHead>
            <TableHead className="font-bold text-foreground w-[17%]">Organisms</TableHead>
            <TableHead className="font-bold text-foreground w-[16%]">Database</TableHead>
            <TableHead className="font-bold text-foreground w-[13%]">Validation Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(grouped).map(([geneName, group]) => {
            const primary = group[0]

            // Aggregate across all papers for this gene
            const allResistances = [
              ...new Set(group.flatMap((g) => g.confers_resistance_to ?? [])),
            ]
            const allOrganisms = [
              ...new Set(group.flatMap((g) => g.organisms_tested_in ?? [])),
            ]
            const allDatabases = [
              ...new Set(group.map((g) => g.source_database).filter(Boolean)),
            ].sort()
            const alleleCount = new Set(group.map((g) => g.allele || g.gene_name).filter(Boolean)).size
            return (
              <TableRow key={geneName} className="hover:bg-primary/5 align-top transition-colors">
                <TableCell>
                  <Link
                    href={`/browse/genes/${encodeURIComponent(primary.gene_name)}`}
                    prefetch={false}
                    className="font-medium text-primary hover:underline"
                  >
                    {geneName}
                  </Link>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-sm font-medium text-muted-foreground">{alleleCount}</span>
                </TableCell>
                <TableCell>
                  {primary.encodes ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize bg-purple-50 text-purple-700 border border-purple-200 leading-snug whitespace-normal">
                      {primary.encodes}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {allResistances.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {allResistances.slice(0, 9).map((r) => (
                        <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {r}
                        </span>
                      ))}
                      {allResistances.length > 9 && (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-600 border border-indigo-200 cursor-default"
                          title={allResistances.slice(9).join(', ')}
                        >
                          +{allResistances.length - 9} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {allOrganisms.length > 0 ? (
                    <ul className="space-y-0.5">
                      {allOrganisms.slice(0, 5).map((o) => (
                        <li key={o} className="italic text-emerald-700">{o}</li>
                      ))}
                      {allOrganisms.length > 5 && (
                        <li>
                          <Link
                            href={`/browse/genes/${encodeURIComponent(primary.gene_name)}`}
                            prefetch={false}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            +{allOrganisms.length - 5} more
                          </Link>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {allDatabases.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {allDatabases.map((db) => (
                        <span key={db} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {db}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {primary.validation_tier ? (
                    <ValidationTierBadge tier={primary.validation_tier} />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
