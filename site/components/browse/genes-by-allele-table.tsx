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

import type { GeneAllele } from '@/lib/types'

interface GenesByAlleleTableProps {
  alleles: GeneAllele[]
}

export function GenesByAlleleTable({ alleles }: GenesByAlleleTableProps) {
  if (alleles.length === 0) {
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
        <h3 className="font-medium text-lg mb-1">No alleles found</h3>
        <p className="text-muted-foreground text-sm">
          Try adjusting your filters or search terms
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/60 border-b-2 border-border">
            <TableHead className="font-bold text-foreground w-[11%]">Gene Name</TableHead>
            <TableHead className="font-bold text-foreground w-[11%]">Allele</TableHead>
            <TableHead className="font-bold text-foreground w-[11%]">Encodes</TableHead>
            <TableHead className="font-bold text-foreground w-[19%]">Confers Resistance To</TableHead>
            <TableHead className="font-bold text-foreground w-[13%]">Organisms</TableHead>
            <TableHead className="font-bold text-foreground w-[14%]">Database</TableHead>
            <TableHead className="font-bold text-foreground w-[6%] text-center">Papers</TableHead>
            <TableHead className="font-bold text-foreground w-[15%]">Validation Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alleles.map((allele) => (
            <TableRow key={`${allele.gene_name}::${allele.allele}`} className="hover:bg-primary/5 align-top transition-colors">
              <TableCell>
                <Link
                  href={`/browse/genes/${encodeURIComponent(allele.gene_name)}`}
                  prefetch={false}
                  className="font-medium text-primary hover:underline"
                >
                  {allele.gene_name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-sm">{allele.allele}</TableCell>
              <TableCell>
                {allele.encodes ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize bg-purple-50 text-purple-700 border border-purple-200 leading-snug whitespace-normal">
                    {allele.encodes}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                {allele.resistances.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {allele.resistances.slice(0, 9).map((r) => (
                      <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {r}
                      </span>
                    ))}
                    {allele.resistances.length > 9 && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-600 border border-indigo-200 cursor-default"
                        title={allele.resistances.slice(9).join(', ')}
                      >
                        +{allele.resistances.length - 9} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {allele.organisms.length > 0 ? (
                  <ul className="space-y-0.5">
                    {allele.organisms.slice(0, 5).map((o) => (
                      <li key={o} className="italic text-emerald-700">{o}</li>
                    ))}
                    {allele.organisms.length > 5 && (
                      <li>
                        <Link
                          href={`/browse/genes/${encodeURIComponent(allele.gene_name)}`}
                          prefetch={false}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          +{allele.organisms.length - 5} more
                        </Link>
                      </li>
                    )}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                {allele.databases.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {allele.databases.map((db) => (
                      <span key={db} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {db}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <span className="text-sm font-medium text-muted-foreground">{allele.paper_count}</span>
              </TableCell>
              <TableCell>
                {allele.validation_tier ? (
                  <ValidationTierBadge tier={allele.validation_tier} />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
