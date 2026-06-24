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
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              {paper.title_pmid ? (
                <p className="font-semibold text-sm leading-snug">{paper.title_pmid}</p>
              ) : null}
              {paper.status === 'curated' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Curated
                </span>
              )}
            </div>
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

      {/* All gene details in a single card */}
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
          {paper.source_database && (
            <div>
              <dt className="text-sm text-muted-foreground">Source Database</dt>
              <dd>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  {paper.source_database}
                </span>
              </dd>
            </div>
          )}
          {paper.mechanism && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">Mechanism</dt>
              <dd className="font-medium">{paper.mechanism}</dd>
            </div>
          )}
          {paper.confers_resistance_to && paper.confers_resistance_to.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground mb-1">Confers Resistance To</dt>
              <dd className="flex flex-wrap gap-1">
                {paper.confers_resistance_to.map((antibiotic, i) => (
                  <Badge key={i} variant="outline">
                    {antibiotic}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
          {paper.organisms_tested_in && paper.organisms_tested_in.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground mb-1">Organisms Tested In</dt>
              <dd>
                {paper.organisms_tested_in.map((organism, i) => (
                  <div key={i} className="text-sm">• {organism}</div>
                ))}
              </dd>
            </div>
          )}
          {(paper.geographic_location || paper.isolation_country) && (
            <div>
              <dt className="text-sm text-muted-foreground">Geographic Location</dt>
              <dd className="font-medium">{paper.geographic_location || paper.isolation_country}</dd>
            </div>
          )}
          {paper.validation_method && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">Validation Method</dt>
              <dd className="font-medium">{paper.validation_method}</dd>
            </div>
          )}
          {paper.sequence_accession && (
            <div>
              <dt className="text-sm text-muted-foreground">Sequence Accession</dt>
              <dd className="font-medium font-mono">
                <a
                  href={`https://www.ncbi.nlm.nih.gov/nuccore/${paper.sequence_accession}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {paper.sequence_accession}
                </a>
              </dd>
            </div>
          )}
          {paper.protein_accession && (
            <div>
              <dt className="text-sm text-muted-foreground">Protein Accession</dt>
              <dd className="font-medium font-mono">
                <a
                  href={`https://www.ncbi.nlm.nih.gov/protein/${paper.protein_accession}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {paper.protein_accession}
                </a>
              </dd>
            </div>
          )}
          {paper.notes && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">Notes</dt>
              <dd className="font-medium">{paper.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </>
  )
}
