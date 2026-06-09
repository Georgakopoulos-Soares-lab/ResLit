import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { GenesTable } from '@/components/browse/genes-table'
import { MutationsTable } from '@/components/browse/mutations-table'
import { getPaperDetail } from '@/lib/actions/browse'

interface PageProps {
  params: Promise<{ pmid: string }>
}

export default async function PaperDetailPage({ params }: PageProps) {
  const { pmid } = await params
  const paper = await getPaperDetail(pmid)

  if (!paper) notFound()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/browse/papers"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to papers
          </Link>
        </div>

        {/* Paper header */}
        <div className="mb-8 p-6 rounded-xl border border-border/60 bg-card">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight leading-snug">
                {paper.title ?? <span className="text-muted-foreground italic">No title available</span>}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono font-medium text-foreground">PMID: {paper.pmid}</span>
                {paper.year && <span>{paper.year}</span>}
                {paper.geographic_location && (
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {paper.geographic_location}
                  </span>
                )}
              </div>
              {paper.key_findings && (
                <div className="mt-4 pt-4 border-t border-border/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Key Findings</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{paper.key_findings}</p>
                </div>
              )}
            </div>

            {/* PubMed link */}
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors text-sm font-medium shrink-0"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              View on PubMed
            </a>
          </div>

          {/* Summary counts */}
          <div className="mt-5 flex gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10">
              <span className="text-lg font-bold text-primary">{paper.genes.length}</span>
              <span className="text-sm text-muted-foreground">gene {paper.genes.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-100">
              <span className="text-lg font-bold text-violet-700">{paper.mutations.length}</span>
              <span className="text-sm text-muted-foreground">mutation {paper.mutations.length === 1 ? 'entry' : 'entries'}</span>
            </div>
          </div>
        </div>

        {/* Genes */}
        {paper.genes.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">AMR Genes</h2>
            <GenesTable genes={paper.genes} />
          </section>
        )}

        {/* Mutations */}
        {paper.mutations.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">AMR Mutations</h2>
            <MutationsTable mutations={paper.mutations} />
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}
