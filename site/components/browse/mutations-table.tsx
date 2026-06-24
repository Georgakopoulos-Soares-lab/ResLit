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
import type { AMRMutation } from '@/lib/types'

interface MutationsTableProps {
  mutations: AMRMutation[]
  hideGene?: boolean
}

interface MergedMutation {
  ids: string[]
  gene_name: string | null
  protein_change: string | null
  nucleotide_changes: string[]
  mechanisms: string[]
  organisms: string[]
  resistances: string[]
  databases: string[]
  validation_tier?: AMRMutation['validation_tier']
}

const tierPriority: Record<string, number> = { Confirmed: 0, Established: 1, Supported: 2, Candidate: 3 }

function groupMutations(mutations: AMRMutation[]): MergedMutation[] {
  const groups = new Map<string, MergedMutation>()

  for (const m of mutations) {
    const identity = m.protein_change ? `p:${m.protein_change}` : (m.nucleotide_change ? `n:${m.nucleotide_change}` : m.id)
    const key = `${m.gene_name ?? ''}::${identity}`
    const existing = groups.get(key)
    if (existing) {
      existing.ids.push(m.id)
      if (m.nucleotide_change && !existing.nucleotide_changes.includes(m.nucleotide_change)) {
        existing.nucleotide_changes.push(m.nucleotide_change)
      }
      if (m.effect_on_function && !existing.mechanisms.includes(m.effect_on_function)) {
        existing.mechanisms.push(m.effect_on_function)
      }
      for (const o of m.organisms_observed_in ?? []) {
        if (!existing.organisms.includes(o)) existing.organisms.push(o)
      }
      for (const r of m.confers_resistance_to ?? []) {
        if (!existing.resistances.includes(r)) existing.resistances.push(r)
      }
      const dbs = m.all_databases ?? (m.source_database ? [m.source_database] : [])
      for (const db of dbs) {
        if (!existing.databases.includes(db)) existing.databases.push(db)
      }
      if (m.validation_tier && (tierPriority[m.validation_tier] ?? 99) < (tierPriority[existing.validation_tier ?? ''] ?? 99)) {
        existing.validation_tier = m.validation_tier
      }
    } else {
      groups.set(key, {
        ids: [m.id],
        gene_name: m.gene_name,
        protein_change: m.protein_change,
        nucleotide_changes: m.nucleotide_change ? [m.nucleotide_change] : [],
        mechanisms: m.effect_on_function ? [m.effect_on_function] : [],
        organisms: [...(m.organisms_observed_in ?? [])],
        resistances: [...(m.confers_resistance_to ?? [])],
        databases: [...(m.all_databases ?? (m.source_database ? [m.source_database] : []))],
        validation_tier: m.validation_tier,
      })
    }
  }

  return [...groups.values()]
}

export function MutationsTable({ mutations, hideGene }: MutationsTableProps) {
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

  const grouped = groupMutations(mutations)

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {!hideGene && <TableHead className="font-semibold">Gene</TableHead>}
            <TableHead className="font-semibold">Protein Change</TableHead>
            <TableHead className="font-semibold">Nucleotide Change</TableHead>
            <TableHead className="font-semibold">Mechanism</TableHead>
            <TableHead className="font-semibold">Organism</TableHead>
            <TableHead className="font-semibold">Resistance To</TableHead>
            <TableHead className="font-semibold">Database</TableHead>
            <TableHead className="font-semibold">Validation Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.map((row) => (
            <TableRow key={row.ids[0]} className="hover:bg-muted/30 align-top">
              {!hideGene && (
                <TableCell>
                  {row.gene_name ? (
                    <Link
                      href={`/browse/genes/${encodeURIComponent(row.gene_name)}`}
                      className="text-primary text-sm hover:underline font-medium"
                    >
                      {row.gene_name}
                    </Link>
                  ) : (
                    '-'
                  )}
                </TableCell>
              )}
              <TableCell className="font-mono text-sm">
                {row.protein_change ? (
                  <Link
                    href={`/browse/mutations/${row.ids[0]}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {row.protein_change}
                  </Link>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {row.nucleotide_changes.length > 0 ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {row.nucleotide_changes.map((nc, i) => (
                      <Link
                        key={nc}
                        href={`/browse/mutations/${row.ids[i] ?? row.ids[0]}`}
                        className="text-primary hover:underline"
                      >
                        {nc}
                      </Link>
                    ))}
                  </div>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="text-sm">
                {row.mechanisms.length > 0 ? row.mechanisms.join(', ') : '-'}
              </TableCell>
              <TableCell className="text-sm">
                {row.organisms.length > 0 ? (
                  <span className="italic text-emerald-700">{row.organisms.join(', ')}</span>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="text-sm">
                {row.resistances.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.resistances.slice(0, 3).map((r) => (
                      <span key={r} className="text-xs bg-muted px-2 py-1 rounded">
                        {r}
                      </span>
                    ))}
                    {row.resistances.length > 3 && (
                      <span
                        className="text-xs text-muted-foreground cursor-default"
                        title={row.resistances.slice(3).join(', ')}
                      >
                        +{row.resistances.length - 3} more
                      </span>
                    )}
                  </div>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                {row.databases.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.databases.map((db) => (
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
                {row.validation_tier ? (
                  <ValidationTierBadge tier={row.validation_tier} />
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
