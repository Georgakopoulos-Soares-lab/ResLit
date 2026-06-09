import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from './status-badge'
import type { AMRMutation } from '@/lib/types'

interface MutationsTableProps {
  mutations: AMRMutation[]
}

export function MutationsTable({ mutations }: MutationsTableProps) {
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
    <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Nucleotide Change</TableHead>
            <TableHead className="font-semibold">Gene</TableHead>
            <TableHead className="font-semibold">Protein Change</TableHead>
            <TableHead className="font-semibold">Effect</TableHead>
            <TableHead className="font-semibold">Type</TableHead>
            <TableHead className="font-semibold">Resistance To</TableHead>
            <TableHead className="font-semibold">Database</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mutations.map((mutation) => {
            return (
              <TableRow key={mutation.id} className="hover:bg-muted/30">
                <TableCell>
                  <Link
                    href={`/browse/mutations/${mutation.id}`}
                    className="font-medium text-primary hover:underline font-mono text-sm"
                  >
                    {mutation.nucleotide_change || '-'}
                  </Link>
                </TableCell>
                <TableCell>
                  {mutation.gene_name ? (
                    <Link
                      href={`/browse/mutations/gene/${encodeURIComponent(mutation.gene_name)}`}
                      className="text-primary text-sm hover:underline"
                    >
                      {mutation.gene_name}
                    </Link>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm max-w-[150px] truncate">
                  {mutation.protein_change || '-'}
                </TableCell>
                <TableCell
                  className="max-w-[180px] truncate text-sm"
                  title={mutation.effect_on_function || undefined}
                >
                  {mutation.effect_on_function || '-'}
                </TableCell>
                <TableCell className="text-sm capitalize">
                  {mutation.mutation_type || '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {mutation.confers_resistance_to && mutation.confers_resistance_to.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {mutation.confers_resistance_to.slice(0, 2).map((antibiotic) => (
                        <span key={antibiotic} className="text-xs bg-muted px-2 py-1 rounded">
                          {antibiotic}
                        </span>
                      ))}
                      {mutation.confers_resistance_to.length > 2 && (
                        <span className="text-xs text-muted-foreground">
                          +{mutation.confers_resistance_to.length - 2}
                        </span>
                      )}
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {mutation.source_database ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {mutation.source_database}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={mutation.status} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
