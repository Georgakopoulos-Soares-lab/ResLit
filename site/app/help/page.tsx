import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { ValidationTierBadge } from '@/components/browse/validation-tier-badge'

export const metadata = {
  title: 'Help | ResLit - AMR Database',
  description: 'How to browse, search, download, and curate antimicrobial resistance genes and mutations on ResLit.',
}

const sections = [
  { id: 'what-is-reslit', title: 'What is ResLit?' },
  { id: 'evidence-tiers', title: 'Evidence tiers' },
  { id: 'browsing-genes', title: 'Browsing genes' },
  { id: 'gene-detail-view', title: 'Gene detail view' },
  { id: 'browsing-mutations', title: 'Browsing mutations' },
  { id: 'mutation-detail-view', title: 'Mutation detail view' },
  { id: 'for-curators', title: 'For curators' },
  { id: 'downloading-data', title: 'Downloading data' },
  { id: 'data-sources', title: 'Data sources and how ResLit is built' },
  { id: 'faq', title: 'Frequently asked questions' },
  { id: 'feedback', title: 'Feedback and bug reports' },
]

const tierCards = [
  {
    tier: 'Confirmed' as const,
    border: 'border-emerald-200 bg-emerald-50/50',
    description:
      'Recorded in two or more sources — an external reference database plus ResLit’s own literature extraction, or two external databases — or manually verified by a curator.',
  },
  {
    tier: 'Established' as const,
    border: 'border-blue-200 bg-blue-50/50',
    description:
      'Recorded in one external reference database, but not independently found in the literature ResLit searched — often because the source paper is paywalled, non-English, or outside the searched corpus.',
  },
  {
    tier: 'Supported' as const,
    border: 'border-amber-200 bg-amber-50/50',
    description: 'Not in any reference database, but reported in three or more independent papers found by ResLit.',
  },
  {
    tier: 'Candidate' as const,
    border: 'border-slate-200 bg-slate-50/50',
    description: 'Not in any reference database, and reported in fewer than three papers.',
  },
]

const geneColumns: [string, string][] = [
  ['Gene Name', 'The resistance gene, in canonical form.'],
  ['Alleles', 'Number of distinct alleles recorded for this gene.'],
  ['Encodes', 'The product the gene encodes (e.g. a bifunctional aminoglycoside-modifying enzyme).'],
  ['Confers Resistance To', 'The antibiotic(s) the gene confers resistance to.'],
  ['Organisms', 'The species in which the gene has been reported.'],
  ['Database', 'Which reference database(s) contain this gene (CARD, ResFinder, Reference Gene Catalog), or ResLit if literature-only.'],
  ['Validation Status', 'The evidence tier (Confirmed / Established / Supported / Candidate).'],
]

const mutationColumns: [string, string][] = [
  ['Gene', 'The gene carrying the mutation.'],
  ['Protein Change', 'The mutation at the protein level (e.g. D179Y), where applicable.'],
  ['Nucleotide Change', 'The mutation at the nucleotide level (e.g. A-14G), where applicable.'],
  ['Mechanism', 'How the mutation confers resistance (e.g. promoter-region change).'],
  ['Organism', 'The species in which the mutation has been reported.'],
  ['Resistance To', 'The antibiotic(s) affected.'],
  ['Database', 'Which reference database(s) contain this mutation, or ResLit if literature-only.'],
  ['Validation Status', 'The evidence tier.'],
]

function ColumnTable({ columns, caption }: { columns: [string, string][]; caption: string }) {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow className="bg-muted/60 border-b-2 border-border hover:bg-muted/60">
            <TableHead scope="col" className="font-bold text-foreground w-[220px]">Column</TableHead>
            <TableHead scope="col" className="font-bold text-foreground">What it shows</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map(([name, desc]) => (
            <TableRow key={name}>
              <TableCell className="font-medium">{name}</TableCell>
              <TableCell className="text-muted-foreground">{desc}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="max-w-3xl mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">Help</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            How to find, evaluate, and curate antimicrobial resistance evidence on ResLit.
          </p>
        </div>

        {/* Mobile table of contents */}
        <details className="lg:hidden mb-8 rounded-lg border border-border/60 bg-card p-4">
          <summary className="cursor-pointer font-medium text-foreground">On this page</summary>
          <nav aria-label="Table of contents" className="mt-3">
            <ul className="space-y-2 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground transition-colors">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </details>

        <div className="flex flex-col lg:flex-row gap-10">
          {/* Desktop sticky table of contents */}
          <aside className="hidden lg:block w-64 shrink-0">
            <nav aria-label="Table of contents" className="sticky top-24 rounded-lg border border-border/60 bg-card p-4">
              <p className="text-sm font-semibold text-foreground mb-3">On this page</p>
              <ul className="space-y-2 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground transition-colors">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 max-w-3xl space-y-16">
            <section>
              <h2 id="what-is-reslit" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                What is ResLit?
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                ResLit is a database of antimicrobial resistance (AMR) evidence mined automatically from the published
                scientific literature. It extracts resistance genes and mutations from full-text papers, links every
                entry to the paper it came from, and cross-references each against three curated reference databases
                &mdash; CARD, ResFinder, and the NCBI Reference Gene Catalog.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                ResLit is built for two audiences. Researchers can look up what the literature reports for a gene,
                mutation, organism, or antibiotic in one place. Curators can find determinants that appear in papers
                but not yet in reference databases, and check existing curated entries against their cited sources.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Every entry carries an evidence tier that shows how well supported it is (explained below), and a
                link to its source publication so you can verify it yourself.
              </p>
            </section>

            <section>
              <h2 id="evidence-tiers" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Evidence tiers
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Every gene and mutation is assigned one of four tiers, based on two independent lines of evidence:
                whether it is recorded in a reference database (CARD, ResFinder, or the NCBI Reference Gene Catalog),
                and whether ResLit independently found it in the literature it searched.
              </p>
              <div className="grid gap-4 mb-6">
                {tierCards.map((t) => (
                  <div key={t.tier} className={`rounded-lg border p-4 ${t.border}`}>
                    <div className="flex items-start gap-4">
                      <ValidationTierBadge tier={t.tier} className="shrink-0 mt-0.5" />
                      <p className="text-muted-foreground">{t.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Confirmed and Established entries both rest on reference-database curation (or, for some Confirmed
                entries, direct curator review) &mdash; the difference is only whether ResLit&rsquo;s own literature
                search also turned them up. Supported and Candidate entries are literature findings with no
                reference-database backing yet, and are the best starting point for curation.
              </p>
            </section>

            <section>
              <h2 id="browsing-genes" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Browsing genes
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                The{' '}
                <Link href="/browse/genes" className="text-primary hover:underline">
                  Browse AMR Genes
                </Link>{' '}
                page lists resistance genes extracted from the literature. Use the filters on the left to narrow the
                list, the search box to find a gene by name, and the Download button to export the current (filtered)
                table.
              </p>

              <h3 className="text-lg font-semibold text-foreground mb-2">What you can do here</h3>
              <ul className="list-disc pl-6 text-muted-foreground leading-relaxed space-y-1 mb-6">
                <li>Search for a gene by name (or by allele, in By Allele view).</li>
                <li>
                  Switch between one row per gene (By Gene) and one row per allele (By Allele) with the toggle at the
                  top of the page.
                </li>
                <li>Filter the list using the sidebar (see filters below).</li>
                <li>Page through results.</li>
                <li>Click any row to open its full detail view.</li>
                <li>Download the filtered results as a table.</li>
              </ul>

              <h3 className="text-lg font-semibold text-foreground mb-2">Filters (left sidebar)</h3>
              <ul className="list-disc pl-6 text-muted-foreground leading-relaxed space-y-1 mb-6">
                <li><span className="text-foreground font-medium">Validation Status</span> &mdash; restrict to one evidence tier (Confirmed / Established / Supported / Candidate).</li>
                <li><span className="text-foreground font-medium">Resistance Mechanism</span> &mdash; filter by mechanism of action (e.g. antibiotic inactivation, efflux).</li>
                <li><span className="text-foreground font-medium">Antibiotic</span> &mdash; show only genes conferring resistance to a chosen antibiotic.</li>
                <li><span className="text-foreground font-medium">Encodes</span> &mdash; filter by the product the gene encodes.</li>
                <li><span className="text-foreground font-medium">Source Database</span> &mdash; show genes recorded in a chosen reference database, or in ResLit only.</li>
                <li><span className="text-foreground font-medium">Organism</span> &mdash; filter by the species the gene was found in.</li>
                <li><span className="text-foreground font-medium">PMID</span> &mdash; find genes extracted from a specific PubMed paper.</li>
                <li><span className="text-foreground font-medium">Country</span> &mdash; filter by country of isolate origin.</li>
              </ul>

              <h3 className="text-lg font-semibold text-foreground mb-2">Column reference (genes table)</h3>
              <ColumnTable columns={geneColumns} caption="Genes table column reference" />
            </section>

            <section>
              <h2 id="gene-detail-view" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Gene detail view
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Clicking a gene opens its detail page, which gathers everything ResLit knows about that gene. The
                header shows the gene&rsquo;s mechanism, validation method, drug classes, organisms, geographic
                locations, allele count (if more than one), paper count, source databases, and &mdash; if mutations
                are recorded for this gene &mdash; how many.
              </p>

              <h3 className="text-lg font-semibold text-foreground mb-2">External links</h3>
              <ul className="list-disc pl-6 text-muted-foreground leading-relaxed space-y-1 mb-4">
                <li><span className="text-foreground font-medium">NCBI Pathogen Isolates</span> &mdash; bacterial genomes carrying this gene.</li>
                <li><span className="text-foreground font-medium">NCBI Reference Gene Catalog</span> &mdash; known alleles and reference sequences.</li>
                <li><span className="text-foreground font-medium">UniProt</span> &mdash; protein entries for this gene.</li>
                <li><span className="text-foreground font-medium">AMR Rules</span> &mdash; whether the gene confers resistance under manually defined rules.</li>
              </ul>

              <p className="text-muted-foreground leading-relaxed mb-4">
                If a gene has more than one recorded allele, an Allele Variants table breaks down papers, databases,
                drug classes, organisms, countries, years, and sequence/protein accessions per allele.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                <span className="text-foreground font-medium">Papers</span> &mdash; every publication ResLit extracted
                this gene from is listed, each linked to its PubMed record, along with the gene name and allele,
                encoded product, source database, mechanism, antibiotics it confers resistance to, organisms tested
                in, and sequence and protein accessions (linked out to the corresponding NCBI records). If the gene
                also has mutations, you can toggle between gene papers and mutation papers. Visitors can leave
                comments on the entry below the papers list.
              </p>

              <p className="text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">Validation status and history</span> &mdash; the
                Validation Status badge shows the gene&rsquo;s current evidence tier. Next to it, a View history
                control shows how the entry has been curated over time &mdash; visible to everyone, not just
                signed-in curators.
              </p>
            </section>

            <section>
              <h2 id="browsing-mutations" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Browsing mutations
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                The{' '}
                <Link href="/browse/mutations" className="text-primary hover:underline">
                  Browse AMR Mutations
                </Link>{' '}
                page lists resistance mutations extracted from the literature. It works like the genes page, with
                filters tailored to mutations. Use the toggle at the top to view mutations as a flat list (All
                Mutations) or grouped by their target gene (Browse by Gene).
              </p>

              <h3 className="text-lg font-semibold text-foreground mb-2">What you can do here</h3>
              <ul className="list-disc pl-6 text-muted-foreground leading-relaxed space-y-1 mb-6">
                <li>Search by nucleotide change, gene, protein change, effect, or paper.</li>
                <li>Switch between the flat list and the by-gene grouping.</li>
                <li>Filter using the sidebar.</li>
                <li>Page through results.</li>
                <li>Click any row to open its detail view.</li>
                <li>Download the filtered results as a table.</li>
              </ul>

              <h3 className="text-lg font-semibold text-foreground mb-2">Filters (left sidebar)</h3>
              <ul className="list-disc pl-6 text-muted-foreground leading-relaxed space-y-1 mb-6">
                <li><span className="text-foreground font-medium">Validation Status</span> &mdash; restrict to one evidence tier.</li>
                <li><span className="text-foreground font-medium">Antibiotic</span> &mdash; show mutations conferring resistance to a chosen antibiotic.</li>
                <li><span className="text-foreground font-medium">Source Database</span> &mdash; show mutations recorded in a chosen reference database, or ResLit only.</li>
                <li><span className="text-foreground font-medium">Gene Name</span> &mdash; filter by the gene carrying the mutation (hidden while in Browse by Gene mode).</li>
                <li><span className="text-foreground font-medium">Mutation Type</span> &mdash; filter by type (e.g. substitution, promoter).</li>
                <li><span className="text-foreground font-medium">PMID</span> &mdash; find mutations extracted from a specific paper.</li>
                <li><span className="text-foreground font-medium">Country</span> &mdash; filter by country of isolate origin.</li>
              </ul>

              <h3 className="text-lg font-semibold text-foreground mb-2">Column reference (mutations table)</h3>
              <ColumnTable columns={mutationColumns} caption="Mutations table column reference" />
            </section>

            <section>
              <h2 id="mutation-detail-view" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Mutation detail view
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Clicking a mutation opens its detail page. The header shows the gene (linked to its own detail page),
                the protein and/or nucleotide change, the current Validation Status, and which databases record this
                mutation, next to a View history control &mdash; visible to everyone, not just curators. Below that,
                an overview lists the mechanism, antibiotics affected, organisms, and how many papers describe it.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                <span className="text-foreground font-medium">Paper information</span> &mdash; every publication
                ResLit extracted this mutation from is listed, each linked to PubMed, showing the protein and/or
                nucleotide change, mutation type, position, organism, antibiotics affected, effect on function,
                validation method, and source database reported in that paper.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Visitors can leave comments on the entry.
              </p>
            </section>

            <section>
              <h2 id="for-curators" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                For curators
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Signed-in curators have a dedicated review interface for genes and mutations, reached from the
                Curator Dashboard after logging in. It mirrors the public catalogues but adds per-entry curation
                controls.
              </p>

              <h3 className="text-lg font-semibold text-foreground mb-2">What curators can do</h3>
              <ul className="list-disc pl-6 text-muted-foreground leading-relaxed space-y-1 mb-6">
                <li>Review each gene or mutation alongside its extracted fields and current validation status.</li>
                <li>Edit an entry to correct a field.</li>
                <li>Approve or Reject an entry.</li>
                <li>View history to see how an entry has changed over time.</li>
                <li>Jump from a curation entry to its corresponding public browse page (&ldquo;View full details&rdquo;).</li>
                <li>
                  Use the same faceted filters as the public catalogues (validation status, source database,
                  organism, antibiotic, and more) to target entries for review.
                </li>
              </ul>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Edits and status changes update the live record, but every change is also logged &mdash; what
                changed, from what to what, and when &mdash; to that entry&rsquo;s history, visible via View history.
                That keeps the extraction pipeline auditable against curator judgement even though the record itself
                shows only the current value.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                <span className="text-foreground font-medium">Candidate</span>-tier entries &mdash; determinants
                found in the literature but absent from all reference databases &mdash; are the natural starting
                point for curation. Filter to the Candidate tier to focus on them.
              </p>

              <p className="text-muted-foreground leading-relaxed">
                To request a curator account,{' '}
                <Link href="/curator/signup" className="text-primary hover:underline">
                  apply as a curator
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 id="downloading-data" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Downloading data
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Both the genes and mutations catalogues can be downloaded as CSV tables using the Download button on
                each browse page. You can download the filtered results, curated-only entries, or the entire table
                (including pending entries). The filtered download respects whatever filters and search you have
                applied, so you can export exactly the subset you need &mdash; for example, all Candidate-tier
                mutations in a chosen organism &mdash; rather than the whole table.
              </p>
            </section>

            <section>
              <h2 id="data-sources" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Data sources and how ResLit is built
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                ResLit assembles its corpus from PubMed, screens papers for AMR relevance, retrieves full text where
                available, and extracts genes and mutations using a large language model pipeline with a
                verification step. Each entry is then cross-referenced against CARD, ResFinder, and the NCBI
                Reference Gene Catalog to assign its evidence tier. See{' '}
                <Link href="/about" className="text-primary hover:underline">
                  About
                </Link>{' '}
                for a fuller walkthrough of the pipeline.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                A manuscript describing ResLit&rsquo;s methodology in full is currently in preparation. The pipeline
                source code is available on{' '}
                <a
                  href="https://github.com/Georgakopoulos-Soares-lab/ResLit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                </a>
                .
              </p>
            </section>

            <section>
              <h2 id="faq" className="scroll-mt-24 text-2xl font-bold text-foreground mb-6">
                Frequently asked questions
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Why isn&rsquo;t a gene/mutation I know about in ResLit?
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    It may be described only in a paper behind a paywall that ResLit could not retrieve, or in a
                    non-English or non-indexed journal, or its association may not have been stated in the paper in
                    a form the extraction step could identify.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    What does it mean if something is &ldquo;Candidate&rdquo;?
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    It has literature support but is not yet in any reference database and was reported in fewer
                    than three papers. It may be a genuinely novel determinant, or a variant name for a known one
                    &mdash; treat it as a lead to verify, not a confirmed fact.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Can I trust the extracted data?</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Every entry links to its source paper so you can check it. ResLit is tuned for precision, and
                    each entry passes an automated verification step, but it is machine-extracted and not a
                    substitute for reading the source. Curated (Confirmed/Established) entries additionally carry
                    expert curation.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">How often is ResLit updated?</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    ResLit is updated annually &mdash; the database is re-run against new literature and re-indexed
                    against the latest releases of CARD, ResFinder, and the NCBI Reference Gene Catalog once a year.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 id="feedback" className="scroll-mt-24 text-2xl font-bold text-foreground mb-4">
                Feedback and bug reports
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Spotted a bug, or have a suggestion for ResLit? Send an email to{' '}
                <a href="mailto:skulakis@gmail.com" className="text-primary hover:underline">
                  skulakis@gmail.com
                </a>
                .
              </p>
            </section>

            <div className="pt-8 border-t border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-sm text-muted-foreground">Last updated August 3, 2026.</p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/browse/genes">Browse Genes</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/browse/mutations">Browse Mutations</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
