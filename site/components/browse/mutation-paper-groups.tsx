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

interface MutationPaperGroupsProps {
  mutations: AMRMutation[]
}

export function MutationPaperGroups({ mutations }: MutationPaperGroupsProps) {
  if (mutations.length === 0) return null

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle>
          Papers
          <Badge variant="secondary" className="ml-2 text-sm font-normal">
            {new Set(mutations.map((m) => m.paper_pmid).filter(Boolean)).size}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {mutations.map((mutation, idx) => (
            <MutationPaperEntry key={mutation.id} mutation={mutation} entryNumber={idx + 1} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function MutationPaperEntry({ mutation, entryNumber }: { mutation: AMRMutation; entryNumber: number }) {
  const colorClass = colors[(entryNumber - 1) % colors.length]

  return (
    <>
      {/* Paper Header — identical structure to GenePaperContent */}
      <div className={`border-2 rounded-lg p-4 space-y-3 ${colorClass}`}>
        <div className="flex items-start gap-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white font-bold text-sm shrink-0 mt-0.5">
            {entryNumber}
          </div>
          <div className="space-y-1">
            {mutation.title_pmid && (
              <p className="font-semibold text-sm leading-snug">{mutation.title_pmid}</p>
            )}
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${mutation.paper_pmid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              PMID {mutation.paper_pmid || 'N/A'}
              {mutation.year_pmid ? ` · ${mutation.year_pmid}` : ''}
            </a>
          </div>
        </div>
        {mutation.key_findings && (
          <div className="ml-10 pt-2 border-t border-current/20">
            <p className="text-sm font-medium leading-relaxed">{mutation.key_findings}</p>
          </div>
        )}
      </div>

      {/* Mutation Information Card — mirrors Gene Information Card */}
      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-4">Mutation Information</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Gene Name</dt>
              <dd className="font-medium font-mono">{mutation.gene_name}</dd>
            </div>
            {mutation.nucleotide_change && (
              <div>
                <dt className="text-sm text-muted-foreground">Nucleotide Change</dt>
                <dd className="font-medium font-mono">{mutation.nucleotide_change}</dd>
              </div>
            )}
            {mutation.protein_change && (
              <div>
                <dt className="text-sm text-muted-foreground">Protein Change</dt>
                <dd className="font-medium font-mono">{mutation.protein_change}</dd>
              </div>
            )}
            {mutation.position_in_molecule && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">Position</dt>
                <dd className="font-medium">{mutation.position_in_molecule}</dd>
              </div>
            )}
            {mutation.mutation_type && (
              <div>
                <dt className="text-sm text-muted-foreground">Mutation Type</dt>
                <dd>
                  <Badge variant="secondary" className="capitalize">
                    {mutation.mutation_type}
                  </Badge>
                </dd>
              </div>
            )}
            {mutation.origin && (
              <div>
                <dt className="text-sm text-muted-foreground">Origin</dt>
                <dd className="font-medium capitalize">{mutation.origin.replace(/_/g, ' ')}</dd>
              </div>
            )}
            {mutation.validated_by && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">Validation Method</dt>
                <dd className="font-medium">{mutation.validated_by}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Effect on Function — mirrors Mechanism Card */}
        {mutation.effect_on_function && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Effect on Function</h3>
            <p className="text-sm text-muted-foreground">{mutation.effect_on_function}</p>
          </div>
        )}

        {/* Confers Resistance To — identical to gene version */}
        {mutation.confers_resistance_to && mutation.confers_resistance_to.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Confers Resistance To</h3>
            <div className="flex flex-wrap gap-2">
              {mutation.confers_resistance_to.map((antibiotic, i) => (
                <Badge key={i} variant="outline">{antibiotic}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Organisms Observed In — mirrors Organisms Tested In */}
        {mutation.organisms_observed_in && mutation.organisms_observed_in.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Organisms Observed In</h3>
            <div className="space-y-2">
              {mutation.organisms_observed_in.map((organism, i) => (
                <div key={i} className="text-sm text-muted-foreground">• {organism}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
