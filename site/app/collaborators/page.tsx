// Default Next.js behavior would statically pre-render this at build time
// (no request-specific data used) — but Railway's build stage can't see
// real data (the database only exists on a Volume mounted at runtime), so
// force live rendering instead.
export const dynamic = 'force-dynamic'

import { getAllCurators } from "@/lib/actions/curator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Building2, Users } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default async function CollaboratorsPage() {
  const curators = await getAllCurators()

  // Group curators by institution
  const byInstitution = curators.reduce((acc, curator) => {
    const inst = curator.affiliation || curator.institution || "Independent"
    if (!acc[inst]) acc[inst] = []
    acc[inst].push(curator)
    return acc
  }, {} as Record<string, typeof curators>)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-primary/5 border-b border-border py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl font-bold text-foreground mb-4">
                Our Collaborators
              </h1>
              <p className="text-lg text-muted-foreground">
                ResLit is made possible by the dedication of researchers and curators 
                who volunteer their expertise to review and validate antimicrobial 
                resistance data from the scientific literature.
              </p>
            </div>
          </div>
        </section>

        {/* Join Section */}
        <section className="py-12 border-b border-border">
          <div className="container mx-auto px-4">
            <Card className="max-w-2xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle>Become a Curator</CardTitle>
                <CardDescription>
                  Are you a researcher with expertise in antimicrobial resistance?
                  Join our team of curators and help validate AMR data from the literature.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  As a curator, you will:
                </p>
                <ul className="text-sm text-muted-foreground space-y-2 mb-6">
                  <li>Review and validate gene and mutation entries</li>
                  <li>Add expert annotations and notes</li>
                  <li>Help maintain data quality and accuracy</li>
                  <li>Be credited as a collaborator on the platform</li>
                </ul>
                <Link href="/curator/signup">
                  <Button size="lg" className="w-full sm:w-auto">
                    Apply as Curator
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-12 border-b border-border">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <Card className="text-center">
                <CardContent className="pt-6">
                  <Users className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-3xl font-bold text-foreground">{curators.length}</p>
                  <p className="text-sm text-muted-foreground">Active Curators</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="pt-6">
                  <Building2 className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-3xl font-bold text-foreground">{Object.keys(byInstitution).length}</p>
                  <p className="text-sm text-muted-foreground">Institutions</p>
                </CardContent>
              </Card>
              <Card className="text-center">
                <CardContent className="pt-6">
                  <svg className="h-8 w-8 text-primary mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-3xl font-bold text-foreground">Expert</p>
                  <p className="text-sm text-muted-foreground">Curation Quality</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Curators List */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            {curators.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  No Curators Yet
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Our curator team is being assembled. If you are interested in 
                  contributing to the curation of AMR data, please contact us.
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {Object.entries(byInstitution).map(([institution, members]) => (
                  <div key={institution}>
                    <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      {institution}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {members.map((curator) => (
                        <Card key={curator.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="pt-6">
                            <div className="flex items-start gap-4">
                              <Avatar className="h-12 w-12">
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                  {(curator.name || curator.email)
                                    .split(" ")
                                    .map((n: string) => n[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground truncate">
                                  {curator.name}
                                </h3>
                                <Badge 
                                  variant={curator.role === "admin" ? "default" : "secondary"}
                                  className="mt-2"
                                >
                                  {curator.role === "admin" ? "Administrator" : "Curator"}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>

      <Footer />
    </div>
  )
}
