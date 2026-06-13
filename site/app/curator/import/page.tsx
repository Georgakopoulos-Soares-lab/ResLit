"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  importGenes,
  importMutations,
  importQwen3,
  type ImportResult,
  type Qwen3ImportResult,
} from "@/lib/actions/import"
import { parseCSV, parseJSON } from "@/lib/utils/parse"
import { Upload, FileJson, FileSpreadsheet, CheckCircle, AlertCircle, ArrowLeft, Cpu } from "lucide-react"
import Link from "next/link"

export default function ImportPage() {
  // QWEN3 state
  const [qwen3Data, setQwen3Data] = useState("")
  const [qwen3Result, setQwen3Result] = useState<Qwen3ImportResult | null>(null)
  const [isImportingQwen3, setIsImportingQwen3] = useState(false)

  // Genes state
  const [geneData, setGeneData] = useState("")
  const [geneFormat, setGeneFormat] = useState<"csv" | "json">("csv")
  const [geneResult, setGeneResult] = useState<ImportResult | null>(null)
  const [isImportingGenes, setIsImportingGenes] = useState(false)

  // Mutations state
  const [mutationData, setMutationData] = useState("")
  const [mutationFormat, setMutationFormat] = useState<"csv" | "json">("csv")
  const [mutationResult, setMutationResult] = useState<ImportResult | null>(null)
  const [isImportingMutations, setIsImportingMutations] = useState(false)

  const handleQwen3Import = async () => {
    setIsImportingQwen3(true)
    setQwen3Result(null)

    try {
      const result = await importQwen3(qwen3Data)
      setQwen3Result(result)
      if (result.success) {
        setQwen3Data("")
      }
    } catch (error) {
      setQwen3Result({
        success: false,
        message: "Import failed",
        imported: 0,
        errors: [(error as Error).message],
        papersProcessed: 0,
        genesImported: 0,
        mutationsImported: 0,
      })
    } finally {
      setIsImportingQwen3(false)
    }
  }

  const handleGeneImport = async () => {
    setIsImportingGenes(true)
    setGeneResult(null)

    try {
      const parsed = geneFormat === "csv" ? parseCSV(geneData) : parseJSON(geneData)
      if (parsed.length === 0) {
        setGeneResult({
          success: false,
          message: "No data to import",
          imported: 0,
          errors: ["Could not parse input data"],
        })
        return
      }
      const result = await importGenes(parsed as any)
      setGeneResult(result)
      if (result.success) {
        setGeneData("")
      }
    } catch (error) {
      setGeneResult({
        success: false,
        message: "Import failed",
        imported: 0,
        errors: [(error as Error).message],
      })
    } finally {
      setIsImportingGenes(false)
    }
  }

  const handleMutationImport = async () => {
    setIsImportingMutations(true)
    setMutationResult(null)

    try {
      const parsed =
        mutationFormat === "csv" ? parseCSV(mutationData) : parseJSON(mutationData)
      if (parsed.length === 0) {
        setMutationResult({
          success: false,
          message: "No data to import",
          imported: 0,
          errors: ["Could not parse input data"],
        })
        return
      }
      const result = await importMutations(parsed as any)
      setMutationResult(result)
      if (result.success) {
        setMutationData("")
      }
    } catch (error) {
      setMutationResult({
        success: false,
        message: "Import failed",
        imported: 0,
        errors: [(error as Error).message],
      })
    } finally {
      setIsImportingMutations(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-6">
            <Button variant="ghost" asChild className="mb-4">
              <Link href="/curator/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Import Data</h1>
            <p className="text-muted-foreground mt-2">
              Import AMR genes and mutations from QWEN3 extraction output, CSV, or JSON
            </p>
          </div>

          <Tabs defaultValue="qwen3" className="space-y-6">
            <TabsList>
              <TabsTrigger value="qwen3">QWEN3 Format</TabsTrigger>
              <TabsTrigger value="genes">Import Genes</TabsTrigger>
              <TabsTrigger value="mutations">Import Mutations</TabsTrigger>
            </TabsList>

            {/* ─── QWEN3 Tab ─── */}
            <TabsContent value="qwen3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5" />
                    QWEN3 Extraction Import
                  </CardTitle>
                  <CardDescription>
                    Paste the QWEN3 extraction log file or a JSON object. Genes and
                    mutations are created automatically from the structured output.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Description */}
                  <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Accepts two input formats:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                      <li>
                        A raw JSON object or array matching the QWEN3 extraction schema
                      </li>
                      <li>
                        A QWEN3 log file containing{" "}
                        <code className="font-mono text-xs bg-muted px-1 rounded">
                          📋 EXTRACTED JSON:
                        </code>{" "}
                        markers with JSON blocks between separator lines
                      </li>
                    </ul>
                  </div>

                  {/* Example */}
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Example JSON format:</h4>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
{`{
  "pmid": "22660700",
  "paper_type": "single_gene",
  "genes": {
    "aac(2')-IIa": {
      "allele": "IIa",
      "encodes": "Kasugamycin 2'-N-acetyltransferase",
      "mechanism": "Inactivates kasugamycin by acetylating the 2'-amino group",
      "confers_resistance_to": ["kasugamycin"],
      "resistance_mechanism_class": "enzymatic_inactivation",
      "organisms_tested_in": ["Burkholderia glumae", "Escherichia coli"],
      "role_in_paper": "experimentally_characterized",
      "validation_method": "Cloning, transformation, acetyltransferase activity assays"
    }
  },
  "mutations": {
    "aac(2')-IIa": {
      "mutations_found": [{
        "notation": "S146T",
        "nucleotide_change": "T436A",
        "protein_change": "S146T",
        "confers_resistance_to": ["kasugamycin"],
        "organisms_observed_in": ["Acidovorax avenae"],
        "effect_on_function": "Substitution increases MIC to kasugamycin",
        "mutation_type": "substitution",
        "validated_by": "sequence analysis",
        "origin": "naturally_occurring"
      }]
    }
  },
  "key_findings": "aac(2')-IIa encodes kasugamycin resistance...",
  "methodology": "Cloning and biochemical assays",
  "geographic_location": ["Japan"],
  "sample_size": 27
}`}
                    </pre>
                  </div>

                  {/* Input Area */}
                  <Textarea
                    placeholder="Paste your QWEN3 JSON or log file here..."
                    value={qwen3Data}
                    onChange={(e) => setQwen3Data(e.target.value)}
                    className="min-h-[250px] font-mono text-sm"
                  />

                  {/* Result */}
                  {qwen3Result && (
                    <Alert variant={qwen3Result.success ? "default" : "destructive"}>
                      {qwen3Result.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      <AlertTitle>{qwen3Result.message}</AlertTitle>
                      <AlertDescription>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span>
                            Papers:{" "}
                            <strong>{qwen3Result.papersProcessed}</strong>
                          </span>
                          <span>
                            Genes:{" "}
                            <strong>{qwen3Result.genesImported}</strong>
                          </span>
                          <span>
                            Mutations:{" "}
                            <strong>{qwen3Result.mutationsImported}</strong>
                          </span>
                        </div>
                        {qwen3Result.errors.length > 0 && (
                          <ul className="list-disc list-inside mt-2 text-sm">
                            {qwen3Result.errors.slice(0, 5).map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                            {qwen3Result.errors.length > 5 && (
                              <li>
                                ...and {qwen3Result.errors.length - 5} more errors
                              </li>
                            )}
                          </ul>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Submit */}
                  <Button
                    onClick={handleQwen3Import}
                    disabled={!qwen3Data.trim() || isImportingQwen3}
                    className="w-full sm:w-auto"
                  >
                    {isImportingQwen3 ? (
                      <>
                        <Spinner className="mr-2" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Cpu className="h-4 w-4 mr-2" />
                        Import QWEN3 Data
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Genes Tab ─── */}
            <TabsContent value="genes">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Import AMR Genes
                  </CardTitle>
                  <CardDescription>
                    Upload gene data in CSV or JSON format. All imported entries will
                    have &quot;pending&quot; status.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Format Selection */}
                  <div className="flex gap-4">
                    <Button
                      variant={geneFormat === "csv" ? "default" : "outline"}
                      onClick={() => setGeneFormat("csv")}
                      className="flex items-center gap-2"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      CSV
                    </Button>
                    <Button
                      variant={geneFormat === "json" ? "default" : "outline"}
                      onClick={() => setGeneFormat("json")}
                      className="flex items-center gap-2"
                    >
                      <FileJson className="h-4 w-4" />
                      JSON
                    </Button>
                  </div>

                  {/* Expected Format */}
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Expected Fields:</h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="default">gene_name *</Badge>
                      <Badge variant="secondary">resistance_mechanism_class</Badge>
                      <Badge variant="secondary">antibiotic</Badge>
                      <Badge variant="secondary">organisms_tested_in</Badge>
                      <Badge variant="secondary">encodes</Badge>
                      <Badge variant="secondary">mechanism</Badge>
                      <Badge variant="secondary">validation_method</Badge>
                      <Badge variant="secondary">role_in_paper</Badge>
                      <Badge variant="secondary">isolation_location</Badge>
                      <Badge variant="secondary">isolation_country</Badge>
                      <Badge variant="secondary">year</Badge>
                      <Badge variant="secondary">pmid</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      * Required field. antibiotic and organisms_tested_in accept a single
                      value (mapped to arrays internally).
                    </p>
                  </div>

                  {/* Example */}
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">
                      Example ({geneFormat.toUpperCase()}):
                    </h4>
                    <pre className="text-xs overflow-x-auto">
                      {geneFormat === "csv"
                        ? `gene_name,resistance_mechanism_class,antibiotic,organisms_tested_in,isolation_country,year,pmid
blaTEM-2,enzymatic_inactivation,Ampicillin,E. coli,USA,2023,12345678
blaOXA-48,enzymatic_inactivation,Meropenem,K. pneumoniae,Turkey,2022,87654321`
                        : `[
  {
    "gene_name": "blaTEM-2",
    "resistance_mechanism_class": "enzymatic_inactivation",
    "antibiotic": "Ampicillin",
    "organisms_tested_in": "E. coli",
    "isolation_country": "USA",
    "year": 2023,
    "pmid": "12345678"
  }
]`}
                    </pre>
                  </div>

                  {/* Input Area */}
                  <Textarea
                    placeholder={`Paste your ${geneFormat.toUpperCase()} data here...`}
                    value={geneData}
                    onChange={(e) => setGeneData(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />

                  {/* Result */}
                  {geneResult && (
                    <Alert variant={geneResult.success ? "default" : "destructive"}>
                      {geneResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      <AlertTitle>{geneResult.message}</AlertTitle>
                      {geneResult.errors.length > 0 && (
                        <AlertDescription>
                          <ul className="list-disc list-inside mt-2 text-sm">
                            {geneResult.errors.slice(0, 5).map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                            {geneResult.errors.length > 5 && (
                              <li>
                                ...and {geneResult.errors.length - 5} more errors
                              </li>
                            )}
                          </ul>
                        </AlertDescription>
                      )}
                    </Alert>
                  )}

                  {/* Submit */}
                  <Button
                    onClick={handleGeneImport}
                    disabled={!geneData.trim() || isImportingGenes}
                    className="w-full sm:w-auto"
                  >
                    {isImportingGenes ? (
                      <>
                        <Spinner className="mr-2" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Genes
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Mutations Tab ─── */}
            <TabsContent value="mutations">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Import AMR Mutations
                  </CardTitle>
                  <CardDescription>
                    Upload mutation data in CSV or JSON format. Mutations will be linked
                    to existing genes by gene_name.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Format Selection */}
                  <div className="flex gap-4">
                    <Button
                      variant={mutationFormat === "csv" ? "default" : "outline"}
                      onClick={() => setMutationFormat("csv")}
                      className="flex items-center gap-2"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      CSV
                    </Button>
                    <Button
                      variant={mutationFormat === "json" ? "default" : "outline"}
                      onClick={() => setMutationFormat("json")}
                      className="flex items-center gap-2"
                    >
                      <FileJson className="h-4 w-4" />
                      JSON
                    </Button>
                  </div>

                  {/* Expected Format */}
                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Expected Fields:</h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="default">gene_name *</Badge>
                      <Badge variant="default">mutation_name *</Badge>
                      <Badge variant="secondary">position</Badge>
                      <Badge variant="secondary">mutation_type</Badge>
                      <Badge variant="secondary">wild_type</Badge>
                      <Badge variant="secondary">mutant</Badge>
                      <Badge variant="secondary">effect</Badge>
                      <Badge variant="secondary">nucleotide_change</Badge>
                      <Badge variant="secondary">origin</Badge>
                      <Badge variant="secondary">validated_by</Badge>
                      <Badge variant="secondary">pmid</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      * Required fields. mutation_type can be: substitution, insertion,
                      deletion, frameshift, other
                    </p>
                  </div>

                  {/* Example */}
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">
                      Example ({mutationFormat.toUpperCase()}):
                    </h4>
                    <pre className="text-xs overflow-x-auto">
                      {mutationFormat === "csv"
                        ? `gene_name,mutation_name,position,mutation_type,wild_type,mutant,nucleotide_change,origin,effect,pmid
blaTEM-1,E104K,104,substitution,E,K,G310A,naturally_occurring,Increases ceftazidime hydrolysis,12345678
blaNDM-1,V88L,88,substitution,V,L,G262T,laboratory,Alters substrate specificity,87654321`
                        : `[
  {
    "gene_name": "blaTEM-1",
    "mutation_name": "E104K",
    "position": 104,
    "mutation_type": "substitution",
    "wild_type": "E",
    "mutant": "K",
    "nucleotide_change": "G310A",
    "origin": "naturally_occurring",
    "effect": "Increases ceftazidime hydrolysis",
    "pmid": "12345678"
  }
]`}
                    </pre>
                  </div>

                  {/* Input Area */}
                  <Textarea
                    placeholder={`Paste your ${mutationFormat.toUpperCase()} data here...`}
                    value={mutationData}
                    onChange={(e) => setMutationData(e.target.value)}
                    className="min-h-[200px] font-mono text-sm"
                  />

                  {/* Result */}
                  {mutationResult && (
                    <Alert
                      variant={mutationResult.success ? "default" : "destructive"}
                    >
                      {mutationResult.success ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      <AlertTitle>{mutationResult.message}</AlertTitle>
                      {mutationResult.errors.length > 0 && (
                        <AlertDescription>
                          <ul className="list-disc list-inside mt-2 text-sm">
                            {mutationResult.errors.slice(0, 5).map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                            {mutationResult.errors.length > 5 && (
                              <li>
                                ...and {mutationResult.errors.length - 5} more errors
                              </li>
                            )}
                          </ul>
                        </AlertDescription>
                      )}
                    </Alert>
                  )}

                  {/* Submit */}
                  <Button
                    onClick={handleMutationImport}
                    disabled={!mutationData.trim() || isImportingMutations}
                    className="w-full sm:w-auto"
                  >
                    {isImportingMutations ? (
                      <>
                        <Spinner className="mr-2" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import Mutations
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  )
}
