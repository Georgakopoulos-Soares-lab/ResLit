import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, FileText, Users, Search, CheckCircle, BookOpen } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "About | ResLit - AMR Database",
  description: "Learn about ResLit, a curated database of antimicrobial resistance genes and mutations extracted from scientific literature.",
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
              <h1 className="text-4xl font-bold text-foreground mb-4">
                About ResLit
              </h1>
              <p className="text-lg text-muted-foreground">
                ResLit is a comprehensive, curated database of antimicrobial resistance 
                (AMR) genes and mutations extracted from peer-reviewed scientific literature.
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
                  Antimicrobial resistance (AMR) is one of the most pressing global health 
                  challenges of our time. Understanding the genetic basis of resistance is 
                  crucial for developing new treatments and surveillance strategies.
                </p>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  ResLit aims to bridge the gap between scientific literature and actionable 
                  knowledge by systematically extracting, curating, and organizing information 
                  about AMR genes and mutations from PubMed publications.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Our database is designed to be a resource for researchers, clinicians, and 
                  public health professionals working to combat antimicrobial resistance.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-8 text-center">
                How It Works
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <Search className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">1. Literature Mining</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      We systematically search PubMed for publications describing antimicrobial 
                      resistance genes and mutations, using targeted search strategies.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">2. Data Extraction</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Key information including gene names, mutations, organisms, antibiotics, 
                      and geographic locations are extracted from each publication.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <CheckCircle className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">3. Expert Curation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Each entry is reviewed by expert curators who validate the information 
                      and add additional context and annotations.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Data Coverage Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-8">Data Coverage</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      AMR Genes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Beta-lactamases</Badge>
                        TEM, CTX-M, NDM, KPC, OXA
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Aminoglycosides</Badge>
                        aac, aph, ant, armA
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Fluoroquinolones</Badge>
                        qnr, aac(6&apos;)-Ib-cr
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Glycopeptides</Badge>
                        vanA, vanB, vanC
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">And more...</Badge>
                        Macrolides, Tetracyclines, Polymyxins
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      Mutation Types
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Substitution</Badge>
                        Single amino acid changes
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Insertion</Badge>
                        Amino acid insertions
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Deletion</Badge>
                        Amino acid deletions
                      </li>
                      <li className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">Frameshift</Badge>
                        Reading frame alterations
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Citation Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-6">How to Cite</h2>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    If you use ResLit in your research, please cite:
                  </p>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    ResLit: A Curated Database of Antimicrobial Resistance Genes and Mutations 
                    from Scientific Literature. Available at: https://reslit.org
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4">
                Start Exploring
              </h2>
              <p className="text-muted-foreground mb-8">
                Browse our curated database of AMR genes and mutations, or learn how 
                you can contribute as a curator.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg">
                  <Link href="/browse/genes">Browse Genes</Link>
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
