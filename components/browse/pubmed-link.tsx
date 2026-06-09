import { cn } from '@/lib/utils'

interface PubMedLinkProps {
  pmid: string | null
  className?: string
  showIcon?: boolean
}

export function PubMedLink({ pmid, className, showIcon = true }: PubMedLinkProps) {
  if (!pmid) {
    return <span className="text-muted-foreground text-sm">-</span>
  }

  const pmids = pmid.split(',').map(p => p.trim())

  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {pmids.map((id, index) => (
        <a
          key={id}
          href={`https://pubmed.ncbi.nlm.nih.gov/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline text-sm font-medium"
        >
          {showIcon && index === 0 && (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          )}
          {id}
        </a>
      ))}
    </span>
  )
}
