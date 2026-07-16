import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PaperEntry } from '@/lib/types'

interface PapersTableProps {
  papers: PaperEntry[]
}

export function PapersTable({ papers }: PapersTableProps) {
  if (papers.length === 0) {
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
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <h3 className="font-medium text-lg mb-1">No papers found</h3>
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
            <TableHead className="font-bold text-foreground">PMID</TableHead>
            <TableHead className="font-bold text-foreground">Title</TableHead>
            <TableHead className="font-bold text-foreground">Year</TableHead>
            <TableHead className="font-bold text-foreground">Location</TableHead>
            <TableHead className="font-bold text-foreground text-center">Genes</TableHead>
            <TableHead className="font-bold text-foreground text-center">Mutations</TableHead>
            <TableHead className="font-bold text-foreground">Antibiotics</TableHead>
            <TableHead className="font-bold text-foreground">Database</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {papers.map((paper) => (
            <TableRow key={paper.pmid} className="hover:bg-primary/5 align-top transition-colors">
              <TableCell className="whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/browse/papers/${paper.pmid}`}
                    prefetch={false}
                    className="font-medium text-primary hover:underline"
                  >
                    {paper.pmid}
                  </Link>
                  <a
                    href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on PubMed"
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                </div>
              </TableCell>

              <TableCell className="max-w-sm">
                {paper.title ? (
                  <span className="text-sm leading-snug">{paper.title}</span>
                ) : (
                  <span className="text-muted-foreground text-sm italic">No title</span>
                )}
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm">
                {paper.year ?? <span className="text-muted-foreground">—</span>}
              </TableCell>

              <TableCell className="text-sm whitespace-nowrap">
                {paper.geographic_location ?? <span className="text-muted-foreground">—</span>}
              </TableCell>

              <TableCell className="text-center">
                {paper.gene_count > 0 ? (
                  <Link
                    href={`/browse/genes?search=`}
                    className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
                  >
                    {paper.gene_count}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>

              <TableCell className="text-center">
                {paper.mutation_count > 0 ? (
                  <span className="inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-full bg-violet-100 text-violet-700 text-sm font-semibold">
                    {paper.mutation_count}
                  </span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>

              <TableCell>
                {paper.antibiotics.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {paper.antibiotics.slice(0, 3).map((ab) => (
                      <span
                        key={ab}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {ab}
                      </span>
                    ))}
                    {paper.antibiotics.length > 3 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-muted-foreground border border-border">
                        +{paper.antibiotics.length - 3}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>

              <TableCell className="text-sm">
                {paper.source_database ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    {paper.source_database}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
