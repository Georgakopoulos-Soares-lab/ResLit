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
import type { GeneWithMutationCount } from '@/lib/types'

interface GenesForMutationsTableProps {
  genes: GeneWithMutationCount[]
}

export function GenesForMutationsTable({ genes }: GenesForMutationsTableProps) {
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <h3 className="font-medium text-lg mb-1">No genes found</h3>
        <p className="text-muted-foreground text-sm">
          Try adjusting your search terms
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/60 border-b-2 border-border">
            <TableHead className="font-bold text-foreground">Gene Name</TableHead>
            <TableHead className="font-bold text-foreground">Mutations</TableHead>
            <TableHead className="font-bold text-foreground">Resistance To</TableHead>
            <TableHead className="font-bold text-foreground">Validation Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {genes.map((gene) => (
            <TableRow key={gene.gene_name} className="hover:bg-primary/5 transition-colors">
              <TableCell>
                <Link
                  href={`/browse/genes/${encodeURIComponent(gene.gene_name)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {gene.gene_name}
                </Link>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 border border-violet-200">
                  {gene.mutation_count} {gene.mutation_count === 1 ? 'mutation' : 'mutations'}
                </span>
              </TableCell>
              <TableCell>
                {gene.resistances.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {gene.resistances.slice(0, 3).map((r) => (
                      <span key={r} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                        {r}
                      </span>
                    ))}
                    {gene.resistances.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{gene.resistances.length - 3}</span>
                    )}
                  </div>
                ) : '-'}
              </TableCell>
              <TableCell>
                {gene.validation_tier ? (
                  <ValidationTierBadge tier={gene.validation_tier} />
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
