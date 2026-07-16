import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AMRMutation } from '@/lib/types'

const colors = [
  'bg-blue-100 text-blue-900 hover:bg-blue-200',
  'bg-purple-100 text-purple-900 hover:bg-purple-200',
  'bg-green-100 text-green-900 hover:bg-green-200',
  'bg-orange-100 text-orange-900 hover:bg-orange-200',
  'bg-pink-100 text-pink-900 hover:bg-pink-200',
  'bg-teal-100 text-teal-900 hover:bg-teal-200',
  'bg-indigo-100 text-indigo-900 hover:bg-indigo-200',
  'bg-amber-100 text-amber-900 hover:bg-amber-200',
]

interface MergedPaper {
  pmid: string
  title: string | null
  year: number | null
  key_findings: string[]
  mutations: { id: string; gene_name: string; nucleotide_change: string | null; protein_change: string | null }[]
  organisms: string[]
  resistances: string[]
  effects: string[]
  databases: string[]
  validated_by: string[]
  mutation_types: string[]
  positions: string[]
}

function groupByPmid(mutations: AMRMutation[]): MergedPaper[] {
  const groups = new Map<string, MergedPaper>()

  for (const m of mutations) {
    const pmid = m.paper_pmid || m.id
    const existing = groups.get(pmid)
    if (existing) {
      const mutKey = `${m.gene_name}:${m.protein_change || m.nucleotide_change}`
      if (!existing.mutations.some((em) => `${em.gene_name}:${em.protein_change || em.nucleotide_change}` === mutKey)) {
        existing.mutations.push({ id: m.id, gene_name: m.gene_name, nucleotide_change: m.nucleotide_change, protein_change: m.protein_change })
      }
      if (m.key_findings && !existing.key_findings.includes(m.key_findings)) existing.key_findings.push(m.key_findings)
      for (const o of m.organisms_observed_in ?? []) { if (!existing.organisms.includes(o)) existing.organisms.push(o) }
      for (const r of m.confers_resistance_to ?? []) { if (!existing.resistances.includes(r)) existing.resistances.push(r) }
      if (m.effect_on_function && !existing.effects.includes(m.effect_on_function)) existing.effects.push(m.effect_on_function)
      if (m.source_database && !existing.databases.includes(m.source_database)) existing.databases.push(m.source_database)
      if (m.validated_by && !existing.validated_by.includes(m.validated_by)) existing.validated_by.push(m.validated_by)
      if (m.mutation_type && !existing.mutation_types.includes(m.mutation_type)) existing.mutation_types.push(m.mutation_type)
      if (m.position_in_molecule && !existing.positions.includes(m.position_in_molecule)) existing.positions.push(m.position_in_molecule)
      if (!existing.title && m.title_pmid) existing.title = m.title_pmid
      if (!existing.year && m.year_pmid) existing.year = m.year_pmid
    } else {
      groups.set(pmid, {
        pmid: m.paper_pmid || '',
        title: m.title_pmid,
        year: m.year_pmid,
        key_findings: m.key_findings ? [m.key_findings] : [],
        mutations: [{ id: m.id, gene_name: m.gene_name, nucleotide_change: m.nucleotide_change, protein_change: m.protein_change }],
        organisms: [...(m.organisms_observed_in ?? [])],
        resistances: [...(m.confers_resistance_to ?? [])],
        effects: m.effect_on_function ? [m.effect_on_function] : [],
        databases: m.source_database ? [m.source_database] : [],
        validated_by: m.validated_by ? [m.validated_by] : [],
        mutation_types: m.mutation_type ? [m.mutation_type] : [],
        positions: m.position_in_molecule ? [m.position_in_molecule] : [],
      })
    }
  }

  return [...groups.values()]
}

interface MutationPaperGroupsProps {
  mutations: AMRMutation[]
}

export function MutationPaperGroups({ mutations }: MutationPaperGroupsProps) {
  if (mutations.length === 0) return null

  const papers = groupByPmid(mutations)

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>
          Papers
          <Badge variant="secondary" className="ml-2 text-sm font-normal">
            {papers.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {papers.map((paper, idx) => (
            <MergedMutationPaperEntry key={paper.pmid || idx} paper={paper} entryNumber={idx + 1} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function MergedMutationPaperEntry({ paper, entryNumber }: { paper: MergedPaper; entryNumber: number }) {
  const colorClass = colors[(entryNumber - 1) % colors.length]

  return (
    <>
      <div className={`border-2 rounded-lg p-4 space-y-3 ${colorClass}`}>
        <div className="flex items-start gap-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white font-bold text-sm shrink-0 mt-0.5">
            {entryNumber}
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              {paper.title && (
                <p className="font-semibold text-sm leading-snug">{paper.title}</p>
              )}
            </div>
            {paper.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                PMID {paper.pmid}
                {paper.year ? ` · ${paper.year}` : ''}
              </a>
            )}
          </div>
        </div>
        {paper.key_findings.length > 0 && (
          <div className="ml-10 pt-2 border-t border-current/20 space-y-1">
            {paper.key_findings.map((kf, i) => (
              <p key={i} className="text-sm font-medium leading-relaxed">{kf}</p>
            ))}
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">Mutation Information</h3>

        {/* Mutation badges linking to detail pages */}
        <div className="flex flex-wrap gap-2 mb-4">
          {paper.mutations.map((mut) => (
            <Link
              key={mut.id}
              href={`/browse/mutations/${mut.id}`}
              prefetch={false}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium font-mono bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
            >
              {mut.gene_name}:{' '}
              {mut.protein_change && <span>p.{mut.protein_change}</span>}
              {mut.protein_change && mut.nucleotide_change && ' / '}
              {mut.nucleotide_change && <span>c.{mut.nucleotide_change}</span>}
              {!mut.protein_change && !mut.nucleotide_change && '?'}
            </Link>
          ))}
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          {paper.mutations.some((m) => m.protein_change) && (
            <div>
              <dt className="text-sm text-muted-foreground mb-1">Protein Change</dt>
              <dd className="font-medium font-mono">{[...new Set(paper.mutations.map((m) => m.protein_change).filter(Boolean))].join(', ')}</dd>
            </div>
          )}
          {paper.mutations.some((m) => m.nucleotide_change) && (
            <div>
              <dt className="text-sm text-muted-foreground mb-1">Nucleotide Change</dt>
              <dd className="font-medium font-mono">{[...new Set(paper.mutations.map((m) => m.nucleotide_change).filter(Boolean))].join(', ')}</dd>
            </div>
          )}
          {paper.organisms.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground mb-1">Organisms</dt>
              <dd className="text-sm italic">{paper.organisms.join(', ')}</dd>
            </div>
          )}
          {paper.resistances.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground mb-1">Confers Resistance To</dt>
              <dd className="flex flex-wrap gap-1">
                {paper.resistances.map((r, i) => (
                  <Badge key={i} variant="outline">{r}</Badge>
                ))}
              </dd>
            </div>
          )}
          {paper.effects.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground mb-1">Effect on Function</dt>
              <dd className="text-sm">{paper.effects.join('; ')}</dd>
            </div>
          )}
          {paper.mutation_types.length > 0 && (
            <div>
              <dt className="text-sm text-muted-foreground mb-1">Mutation Type</dt>
              <dd className="text-sm capitalize">{paper.mutation_types.join(', ')}</dd>
            </div>
          )}
          {paper.positions.length > 0 && (
            <div>
              <dt className="text-sm text-muted-foreground mb-1">Position</dt>
              <dd className="text-sm font-mono">{paper.positions.join(', ')}</dd>
            </div>
          )}
          {paper.validated_by.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground mb-1">Validation Method</dt>
              <dd className="text-sm">{paper.validated_by.join('; ')}</dd>
            </div>
          )}
          {paper.databases.length > 0 && (
            <div>
              <dt className="text-sm text-muted-foreground mb-1">Source Database</dt>
              <dd className="flex flex-wrap gap-1">
                {paper.databases.map((db) => (
                  <span key={db} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    {db}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </>
  )
}

export function GroupedMutationPapers({ mutations }: { mutations: AMRMutation[] }) {
  const papers = groupByPmid(mutations)
  return (
    <div className="space-y-6">
      {papers.map((paper, idx) => (
        <MergedMutationPaperEntry key={paper.pmid || idx} paper={paper} entryNumber={idx + 1} />
      ))}
    </div>
  )
}

export function MutationPaperEntry({ mutation, entryNumber }: { mutation: AMRMutation; entryNumber: number }) {
  return <MergedMutationPaperEntry paper={groupByPmid([mutation])[0]} entryNumber={entryNumber} />
}
