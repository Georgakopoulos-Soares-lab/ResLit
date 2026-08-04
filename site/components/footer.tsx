import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <svg
                  className="h-4 w-4 text-primary-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-2.569.428a7.5 7.5 0 01-10.132 0l-2.57-.428c-1.716-.293-2.298-2.379-1.066-3.61L5 14.5"
                  />
                </svg>
              </div>
              <span className="font-semibold">ResLit</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A curated database of antimicrobial resistance genes and mutations extracted from scientific literature.
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-3">Browse</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/browse/genes" className="hover:text-foreground transition-colors">
                  AMR Genes
                </Link>
              </li>
              <li>
                <Link href="/browse/mutations" className="hover:text-foreground transition-colors">
                  AMR Mutations
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium mb-3">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-foreground transition-colors">
                  About ResLit
                </Link>
              </li>
              <li>
                <Link href="/collaborators" className="hover:text-foreground transition-colors">
                  Collaborators
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-foreground transition-colors">
                  Help
                </Link>
              </li>
              <li>
                <a href="https://pubmed.ncbi.nlm.nih.gov/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  PubMed
                </a>
              </li>
              <li>
                <a href="https://www.ncbi.nlm.nih.gov/pathogens/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  NCBI Pathogens
                </a>
              </li>
              <li>
                <a href="https://www.uniprot.org/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  UniProt
                </a>
              </li>
              <li>
                <a href="https://card.mcmaster.ca/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  CARD
                </a>
              </li>
              <li>
                <a href="https://bitbucket.org/genomicepidemiology/resfinder_db/src/master/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  ResFinder DB
                </a>
              </li>
              <li>
                <a href="https://bitbucket.org/genomicepidemiology/pointfinder_db/src/master/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  PointFinder DB
                </a>
              </li>
              <li>
                <a href="https://browse.amrrules.org/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  AMR Rules
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium mb-3">Curators</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/curator/login" className="hover:text-foreground transition-colors">
                  Curator Login
                </Link>
              </li>
              <li>
                <Link href="/curator/dashboard" className="hover:text-foreground transition-colors">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ResLit. Data sourced from PubMed literature analysis.
          </p>
          <p className="text-sm text-muted-foreground">
            Built for antimicrobial resistance research
          </p>
        </div>
      </div>
    </footer>
  )
}
