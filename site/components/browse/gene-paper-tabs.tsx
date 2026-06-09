import { Badge } from '@/components/ui/badge'
import type { AMRGene } from '@/lib/types'

interface GenePaperTabsProps {
  papers: AMRGene[]
}

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

export function GenePaperTabs({ papers }: GenePaperTabsProps) {
  if (papers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No papers found for this gene
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {papers.map((paper, idx) => (
        <GenePaperContent key={paper.id} paper={paper} paperNumber={idx + 1} />
      ))}
    </div>
  )
}

function GenePaperContent({ paper, paperNumber }: { paper: AMRGene; paperNumber: number }) {
  const colorClass = colors[paperNumber - 1] || colors[0]
  
  return (
    <>
      {/* Paper Header with Number, Title, PMID and Key Findings */}
      <div className={`border-2 rounded-lg p-4 space-y-3 ${colorClass}`}>
        <div className="flex items-start gap-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white font-bold text-sm shrink-0 mt-0.5">
            {paperNumber}
          </div>
          <div className="space-y-1">
            {paper.title_pmid ? (
              <p className="font-semibold text-sm leading-snug">{paper.title_pmid}</p>
            ) : null}
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${paper.paper_pmid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              PMID {paper.paper_pmid || 'N/A'}
              {paper.year_pmid ? ` · ${paper.year_pmid}` : ''}
            </a>
          </div>
        </div>
        {paper.key_findings && (
          <div className="ml-10 pt-2 border-t border-current/20">
            <p className="text-sm font-medium leading-relaxed">{paper.key_findings}</p>
          </div>
        )}
      </div>

      {/* Gene Information Card */}
      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-4">Gene Information</h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Gene Name</dt>
              <dd className="font-medium font-mono">{paper.gene_name}</dd>
            </div>
            {paper.allele && (
              <div>
                <dt className="text-sm text-muted-foreground">Allele</dt>
                <dd className="font-medium font-mono">{paper.allele}</dd>
              </div>
            )}
            {paper.encodes && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">Encodes</dt>
                <dd className="font-medium">{paper.encodes}</dd>
              </div>
            )}
            {paper.resistance_mechanism_class && (
              <div>
                <dt className="text-sm text-muted-foreground">Resistance Mechanism Class</dt>
                <dd>
                  <Badge variant="secondary" className="capitalize">
                    {paper.resistance_mechanism_class.replace(/_/g, ' ')}
                  </Badge>
                </dd>
              </div>
            )}
            {paper.role_in_paper && (
              <div>
                <dt className="text-sm text-muted-foreground">Role in Paper</dt>
                <dd className="font-medium capitalize">
                  {paper.role_in_paper.replace(/_/g, ' ')}
                </dd>
              </div>
            )}
            {paper.validation_method && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">Validation Method</dt>
                <dd className="font-medium">{paper.validation_method}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Mechanism Card */}
        {paper.mechanism && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Mechanism</h3>
            <p className="text-sm text-muted-foreground">{paper.mechanism}</p>
          </div>
        )}

        {/* Antibiotic Resistance Card */}
        {paper.confers_resistance_to && paper.confers_resistance_to.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Confers Resistance To</h3>
            <div className="flex flex-wrap gap-2">
              {paper.confers_resistance_to.map((antibiotic, i) => (
                <Badge key={i} variant="outline">
                  {antibiotic}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Organisms Tested Card */}
        {paper.organisms_tested_in && paper.organisms_tested_in.length > 0 && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Organisms Tested In</h3>
            <div className="space-y-2">
              {paper.organisms_tested_in.map((organism, i) => (
                <div key={i} className="text-sm text-muted-foreground">
                  • {organism}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Isolation Details Card */}
        {(paper.geographic_location || paper.isolation_country || paper.isolation_location) && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Isolation Details</h3>
            <div className="space-y-2">
              {(paper.geographic_location || paper.isolation_country) && (
                <div>
                  <dt className="text-sm text-muted-foreground">Country</dt>
                  <dd className="text-sm font-medium">
                    {paper.geographic_location || paper.isolation_country}
                  </dd>
                </div>
              )}
              {paper.isolation_location && (
                <div>
                  <dt className="text-sm text-muted-foreground">Location</dt>
                  <dd className="text-sm font-medium">{paper.isolation_location}</dd>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
