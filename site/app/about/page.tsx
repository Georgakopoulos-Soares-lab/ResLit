import Image from "next/image"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "About | ResLit - AMR Database",
  description: "Learn about ResLit, an automatically curated database of antimicrobial resistance genes and mutations extracted from scientific literature using a large language model pipeline.",
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-primary/5 border-b border-border py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <Image
                src="/logo_reslit.png"
                alt="ResLit logo"
                width={180}
                height={98}
                className="h-28 w-auto mx-auto mb-6"
                priority
              />
              <h1 className="text-4xl font-bold text-foreground mb-4">
                About ResLit
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                ResLit is an automatically curated database of antimicrobial resistance (AMR) genes and mutations, built by systematically mining the peer-reviewed scientific literature using a large language model pipeline.
              </p>
            </div>
          </div>
        </section>

        {/* Mission Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-6">Our Mission</h2>
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <p className="text-muted-foreground leading-relaxed mb-4">
                  ResLit serves two audiences with a shared need: access to the AMR literature at scale.
                </p>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  <strong className="text-foreground">For curators</strong> working on databases like CARD, ResFinder, or institutional collections, ResLit acts as a discovery tool, surfacing genes, mutations, and papers that warrant manual review and curation, prioritized by evidence strength. Instead of searching the literature from scratch, curators can use ResLit to identify what is already well-supported, what is newly reported, and where their attention will have the most impact.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">For scientists</strong>, ResLit provides a real-time snapshot of what the literature contains, both curated and uncurated. Researchers can explore resistance findings across organisms, antibiotics, and geographic regions, see how well-established each entry is, and follow every finding back to its source publication. Whether a gene is Confirmed across multiple reference databases or a Candidate reported in a single paper, that distinction is always visible.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-10 text-center">
                How It Works
              </h2>
              <div className="space-y-8">
                {/* Step 1 */}
                <div className="flex gap-5">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">1</div>
                    <div className="w-px flex-1 bg-border mt-2" />
                  </div>
                  <div className="pb-4">
                    <h3 className="text-lg font-semibold text-foreground mb-2">Literature Search</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Over 1.5 million AMR-relevant publications were retrieved from PubMed using targeted search queries covering resistance genes, mutations, organisms, and antibiotic classes. 150,000 full-text articles were obtained through PubMed Central Open Access, publisher APIs, and institutional access agreements.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-5">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">2</div>
                    <div className="w-px flex-1 bg-border mt-2" />
                  </div>
                  <div className="pb-4">
                    <h3 className="text-lg font-semibold text-foreground mb-2">LLM-Based Extraction</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Each paper is processed by a two-pass pipeline powered by Qwen3-30B-A3B, an open-source large language model. The first pass performs high-recall extraction of genes, mutations, organisms, antibiotics, and geographic locations. The second pass audits each extracted entity individually against the source text, verifying it reflects the paper&apos;s own experimental findings and not background citations or prior literature. Papers exceeding the model&apos;s context window are split into overlapping chunks and merged after extraction.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-5">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">3</div>
                    <div className="w-px flex-1 bg-border mt-2" />
                  </div>
                  <div className="pb-4">
                    <h3 className="text-lg font-semibold text-foreground mb-2">Normalization</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Raw extracted entries undergo multi-layer normalization before entering the database. Gene names are resolved to canonical gene family names using a curated allele-to-family mapping, handling allele variants such as bla<sub>TEM-1</sub>, tetA(1), and aac(6&apos;)-Ib. Antibiotic names and abbreviations are standardized against a reference list covering all major drug classes. Mutation notation is normalized to standard nucleotide and protein change formats, with special handling for rRNA genes, promoter mutations, indels, and frameshifts.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-5">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">4</div>
                    <div className="w-px flex-1 bg-border mt-2" />
                  </div>
                  <div className="pb-4">
                    <h3 className="text-lg font-semibold text-foreground mb-2">Cross-Database Validation</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Normalized entries are cross-referenced against three established reference databases: CARD, ResFinder, and the NCBI Reference Gene Catalog, using gene name as the primary matching key. This cross-referencing both validates pipeline precision and anchors ResLit findings within the broader AMR knowledge ecosystem.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex gap-5">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">5</div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Evidence Grading</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Each entry is assigned one of four confidence tiers — Confirmed, Established, Supported, or Candidate — based on the number of external databases it appears in and the number of independent publications reporting it. This tiering gives users a transparent, reproducible signal of evidence strength without requiring manual review of every entry.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Evidence Tiers Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-8">Evidence Tiers</h2>
              <div className="grid gap-4">
                <Card className="border-emerald-200 bg-emerald-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 shrink-0 text-sm px-3 py-1">Confirmed</Badge>
                      <p className="text-muted-foreground">
                        Present in 2+ databases (CARD, ResFinder, NCBI RGC, ResLit) — independently curated by more than one reference source.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Badge className="bg-blue-100 text-blue-800 border-blue-300 shrink-0 text-sm px-3 py-1">Established</Badge>
                      <p className="text-muted-foreground">
                        Present in exactly one external database — high confidence, but not yet cross-validated across references.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 shrink-0 text-sm px-3 py-1">Supported</Badge>
                      <p className="text-muted-foreground">
                        Extracted by ResLit from 3 or more independent publications — replicated in the literature but absent from external databases.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-slate-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Badge className="bg-slate-100 text-slate-700 border-slate-300 shrink-0 text-sm px-3 py-1">Candidate</Badge>
                      <p className="text-muted-foreground">
                        Extracted by ResLit from fewer than 3 papers — single or limited reports; highest false-positive risk and highest priority for manual review.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Data Coverage Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-6">Data Coverage</h2>
              <p className="text-muted-foreground leading-relaxed">
                ResLit covers resistance mechanisms across all major antibiotic classes, including beta-lactams, aminoglycosides, fluoroquinolones, glycopeptides, macrolides, tetracyclines, and polymyxins. Both acquired resistance genes and chromosomal mutations are represented, spanning a wide range of clinically and epidemiologically relevant bacterial species.
              </p>
            </div>
          </div>
        </section>

        {/* Citation Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-6">How to Cite</h2>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">
                    A manuscript describing ResLit is currently in preparation. Please check back for citation details.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4">
                Start Exploring
              </h2>
              <p className="text-muted-foreground mb-8">
                Browse our database of AMR genes and mutations, or learn how
                you can contribute as a curator.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg">
                  <Link href="/browse/genes">Browse Genes</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/browse/mutations">Browse Mutations</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/collaborators">Join as Curator</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
