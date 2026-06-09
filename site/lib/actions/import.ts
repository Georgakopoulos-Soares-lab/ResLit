"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ------------------------------------------------------------
// Flat import row types (manual CSV/JSON import)
// ------------------------------------------------------------

interface GeneImportRow {
  gene_name: string
  antibiotic?: string                 // single value; mapped to confers_resistance_to array
  resistance_mechanism_class?: string
  organisms_tested_in?: string        // single value; mapped to organisms_tested_in array
  encodes?: string
  mechanism?: string
  validation_method?: string
  role_in_paper?: string
  isolation_location?: string
  isolation_country?: string
  year?: number | string
  pmid?: string
}

interface MutationImportRow {
  gene_name: string                   // used to link to gene
  mutation_name: string
  position?: number | string
  mutation_type?: string
  wild_type?: string
  mutant?: string
  effect?: string
  nucleotide_change?: string
  origin?: string
  validated_by?: string
  pmid?: string
}

export interface ImportResult {
  success: boolean
  message: string
  imported: number
  errors: string[]
}

// ------------------------------------------------------------
// QWEN3 extraction types
// ------------------------------------------------------------

export interface Qwen3GeneData {
  allele?: string
  encodes?: string
  mechanism?: string
  confers_resistance_to?: string[]
  resistance_mechanism_class?: string
  organisms_tested_in?: string[]
  role_in_paper?: string
  validation_method?: string
}

export interface Qwen3MutationEntry {
  notation?: string
  nucleotide_change?: string
  protein_change?: string
  confers_resistance_to?: string[]
  organisms_observed_in?: string[]
  effect_on_function?: string
  mutation_type?: string
  validated_by?: string
  origin?: string
}

export interface Qwen3MutationData {
  mutations_found?: Qwen3MutationEntry[]
}

export interface Qwen3PaperJson {
  pmid?: string
  title?: string
  year?: number
  paper_type?: string
  genes?: Record<string, Qwen3GeneData>
  mutations?: Record<string, Qwen3MutationData>
  key_findings?: string
  methodology?: string
  geographic_location?: string[]
  sample_size?: number
}

export interface Qwen3ImportResult extends ImportResult {
  papersProcessed: number
  genesImported: number
  mutationsImported: number
}

// ------------------------------------------------------------
// parseQwen3Text – exported synchronous function
// Parses a QWEN3 extraction log or raw JSON into an array of Qwen3PaperJson
// ------------------------------------------------------------

export function parseQwen3Text(text: string): Qwen3PaperJson[] {
  const trimmed = text.trim()

  // 1. Try direct JSON parse (single object or array)
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed as Qwen3PaperJson[]
    }
    return [parsed as Qwen3PaperJson]
  } catch {
    // fall through to log-file parsing
  }

  // 2. Log file parsing:
  //    Split on "📋 EXTRACTED JSON:" marker, then find content between
  //    pairs of separator lines (10+ dashes)
  const results: Qwen3PaperJson[] = []
  const separatorRegex = /^-{10,}/

  const sections = text.split("📋 EXTRACTED JSON:")
  // sections[0] is everything before the first marker; skip it
  for (let s = 1; s < sections.length; s++) {
    const section = sections[s]
    const lines = section.split("\n")

    // Find the first separator line
    let startIdx = -1
    let endIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (separatorRegex.test(lines[i].trim())) {
        if (startIdx === -1) {
          startIdx = i
        } else {
          endIdx = i
          break
        }
      }
    }

    if (startIdx === -1) continue

    // Content is between the two separator lines
    const contentLines =
      endIdx !== -1
        ? lines.slice(startIdx + 1, endIdx)
        : lines.slice(startIdx + 1)

    const jsonStr = contentLines.join("\n").trim()
    if (!jsonStr) continue

    try {
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) {
        results.push(...(parsed as Qwen3PaperJson[]))
      } else {
        results.push(parsed as Qwen3PaperJson)
      }
    } catch {
      // Skip malformed JSON blocks
    }
  }

  return results
}

// ------------------------------------------------------------
// importQwen3 – server action
// Upserts papers, genes, and mutations from QWEN3 output text
// ------------------------------------------------------------

export async function importQwen3(text: string): Promise<Qwen3ImportResult> {
  const supabase = await createClient()

  // Auth checks
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      success: false,
      message: "Not authenticated",
      imported: 0,
      errors: ["Please log in as a curator"],
      papersProcessed: 0,
      genesImported: 0,
      mutationsImported: 0,
    }
  }

  const { data: curator } = await supabase
    .from("curators")
    .select("id")
    .eq("id", user.id)
    .single()

  if (!curator) {
    return {
      success: false,
      message: "Not authorized",
      imported: 0,
      errors: ["Only curators can import data"],
      papersProcessed: 0,
      genesImported: 0,
      mutationsImported: 0,
    }
  }

  const papers = parseQwen3Text(text)
  if (papers.length === 0) {
    return {
      success: false,
      message: "No valid QWEN3 records found",
      imported: 0,
      errors: ["Could not parse any paper records from input"],
      papersProcessed: 0,
      genesImported: 0,
      mutationsImported: 0,
    }
  }

  const errors: string[] = []
  let papersProcessed = 0
  let genesImported = 0
  let mutationsImported = 0

  const mutationNotationRegex = /^([A-Za-z*]+)(\d+)([A-Za-z*]+)$/

  for (const paper of papers) {
    const pmid = paper.pmid?.trim() || null

    // 1. Upsert into papers table (if we have a pmid)
    if (pmid) {
      const { error: paperError } = await supabase
        .from("papers")
        .upsert(
          {
            pmid,
            title: paper.title || null,
            year: paper.year ?? null,
            paper_type: paper.paper_type || null,
            key_findings: paper.key_findings || null,
            methodology: paper.methodology || null,
            geographic_location: paper.geographic_location || null,
            sample_size: paper.sample_size ?? null,
          },
          { onConflict: "pmid" }
        )

      if (paperError) {
        errors.push(`Paper ${pmid}: ${paperError.message}`)
      } else {
        papersProcessed++
      }
    }

    // 2. Insert genes
    const geneEntries = Object.entries(paper.genes || {})
    const geneIdMap = new Map<string, string>() // gene_name → inserted id

    for (const [geneName, geneData] of geneEntries) {
      // Build a description string from the rich fields for backward compat / search
      const descriptionParts: string[] = []
      if (geneData.encodes) descriptionParts.push(`Encodes: ${geneData.encodes}`)
      if (geneData.mechanism) descriptionParts.push(`Mechanism: ${geneData.mechanism}`)
      if (geneData.validation_method)
        descriptionParts.push(`Validation: ${geneData.validation_method}`)
      if (geneData.role_in_paper)
        descriptionParts.push(`Role: ${geneData.role_in_paper}`)
      if (paper.key_findings)
        descriptionParts.push(`Key findings: ${paper.key_findings}`)

      const { data: insertedGene, error: geneError } = await supabase
        .from("amr_genes")
        .insert({
          gene_name: geneName.trim(),
          allele: geneData.allele || null,
          encodes: geneData.encodes || null,
          mechanism: geneData.mechanism || null,
          resistance_mechanism_class: geneData.resistance_mechanism_class || null,
          confers_resistance_to: geneData.confers_resistance_to || null,
          organisms_tested_in: geneData.organisms_tested_in || null,
          role_in_paper: geneData.role_in_paper || null,
          validation_method: geneData.validation_method || null,
          paper_pmid: pmid,
          pmid: pmid,
          status: "pending",
        })
        .select("id")
        .single()

      if (geneError) {
        errors.push(`Gene "${geneName}" (paper ${pmid || "unknown"}): ${geneError.message}`)
      } else if (insertedGene) {
        genesImported++
        geneIdMap.set(geneName, insertedGene.id)
      }
    }

    // 3. Insert mutations linked to gene IDs
    const mutationEntries = Object.entries(paper.mutations || {})

    for (const [geneName, mutationData] of mutationEntries) {
      const geneId = geneIdMap.get(geneName) || null

      // If the gene wasn't just inserted, try to find it in the DB
      let resolvedGeneId = geneId
      if (!resolvedGeneId && geneName) {
        const { data: existingGene } = await supabase
          .from("amr_genes")
          .select("id")
          .eq("gene_name", geneName.trim())
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
        resolvedGeneId = existingGene?.id || null
      }

      const mutationsFound = mutationData.mutations_found || []

      for (const mut of mutationsFound) {
        const notation = mut.notation || mut.protein_change || ""

        // Parse notation into wild_type / position / mutant
        let wildType: string | null = null
        let position: number | null = null
        let mutant: string | null = null

        const match = mutationNotationRegex.exec(notation)
        if (match) {
          wildType = match[1]
          position = parseInt(match[2], 10)
          mutant = match[3]
        }

        const validMutationTypes = [
          "substitution",
          "insertion",
          "deletion",
          "frameshift",
          "other",
        ]
        let mutationType = mut.mutation_type?.toLowerCase().trim() || null
        if (mutationType && !validMutationTypes.includes(mutationType)) {
          mutationType = "other"
        }

        const { error: mutError } = await supabase.from("amr_mutations").insert({
          gene_id: resolvedGeneId,
          gene_name: geneName,
          mutation_name: notation || `mutation_${mutationsImported + 1}`,
          position,
          mutation_type: mutationType,
          wild_type: wildType,
          mutant,
          effect: mut.effect_on_function || null,
          nucleotide_change: mut.nucleotide_change || null,
          protein_change: mut.protein_change || null,
          confers_resistance_to: mut.confers_resistance_to || null,
          organisms_observed_in: mut.organisms_observed_in || null,
          validated_by: mut.validated_by || null,
          origin: mut.origin || null,
          pmid: pmid,
          status: "pending",
        })

        if (mutError) {
          errors.push(
            `Mutation "${notation}" for gene "${geneName}" (paper ${pmid || "unknown"}): ${mutError.message}`
          )
        } else {
          mutationsImported++
        }
      }
    }
  }

  revalidatePath("/browse/genes")
  revalidatePath("/browse/mutations")
  revalidatePath("/curator/dashboard")

  const totalImported = genesImported + mutationsImported
  return {
    success: totalImported > 0 || papersProcessed > 0,
    message: `Processed ${papersProcessed} papers, imported ${genesImported} genes and ${mutationsImported} mutations`,
    imported: totalImported,
    errors,
    papersProcessed,
    genesImported,
    mutationsImported,
  }
}

// ------------------------------------------------------------
// importGenes – flat manual import (CSV/JSON)
// Maps single antibiotic/organism values to new array columns
// ------------------------------------------------------------

export async function importGenes(data: GeneImportRow[]): Promise<ImportResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      success: false,
      message: "Not authenticated",
      imported: 0,
      errors: ["Please log in as a curator"],
    }
  }

  const { data: curator } = await supabase
    .from("curators")
    .select("id")
    .eq("id", user.id)
    .single()

  if (!curator) {
    return {
      success: false,
      message: "Not authorized",
      imported: 0,
      errors: ["Only curators can import data"],
    }
  }

  const errors: string[] = []
  let imported = 0

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    if (!row.gene_name || row.gene_name.trim() === "") {
      errors.push(`Row ${i + 1}: gene_name is required`)
      continue
    }

    let year: number | null = null
    if (row.year) {
      year = typeof row.year === "string" ? parseInt(row.year, 10) : row.year
      if (isNaN(year)) year = null
    }

    // Map single-value antibiotic/organism to arrays
    const confers_resistance_to = row.antibiotic?.trim()
      ? [row.antibiotic.trim()]
      : null

    const organisms_tested_in = row.organisms_tested_in?.trim()
      ? [row.organisms_tested_in.trim()]
      : null

    const { error } = await supabase.from("amr_genes").insert({
      gene_name: row.gene_name.trim(),
      encodes: row.encodes?.trim() || null,
      mechanism: row.mechanism?.trim() || null,
      resistance_mechanism_class: row.resistance_mechanism_class?.trim() || null,
      confers_resistance_to,
      organisms_tested_in,
      role_in_paper: row.role_in_paper?.trim() || null,
      validation_method: row.validation_method?.trim() || null,
      isolation_location: row.isolation_location?.trim() || null,
      isolation_country: row.isolation_country?.trim() || null,
      year,
      pmid: row.pmid?.trim() || null,
      status: "pending",
    })

    if (error) {
      errors.push(`Row ${i + 1}: ${error.message}`)
    } else {
      imported++
    }
  }

  revalidatePath("/browse/genes")
  revalidatePath("/curator/dashboard")

  return {
    success: imported > 0,
    message: `Imported ${imported} of ${data.length} genes`,
    imported,
    errors,
  }
}

// ------------------------------------------------------------
// importMutations – flat manual import (CSV/JSON)
// ------------------------------------------------------------

export async function importMutations(data: MutationImportRow[]): Promise<ImportResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      success: false,
      message: "Not authenticated",
      imported: 0,
      errors: ["Please log in as a curator"],
    }
  }

  const { data: curator } = await supabase
    .from("curators")
    .select("id")
    .eq("id", user.id)
    .single()

  if (!curator) {
    return {
      success: false,
      message: "Not authorized",
      imported: 0,
      errors: ["Only curators can import data"],
    }
  }

  // Get all gene names and IDs for linking
  const { data: genes } = await supabase.from("amr_genes").select("id, gene_name")

  const geneMap = new Map<string, string>()
  genes?.forEach((g) => {
    geneMap.set(g.gene_name.toLowerCase(), g.id)
  })

  const errors: string[] = []
  let imported = 0

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    if (!row.mutation_name || row.mutation_name.trim() === "") {
      errors.push(`Row ${i + 1}: mutation_name is required`)
      continue
    }

    if (!row.gene_name || row.gene_name.trim() === "") {
      errors.push(`Row ${i + 1}: gene_name is required to link mutation`)
      continue
    }

    const geneId = geneMap.get(row.gene_name.toLowerCase().trim())
    if (!geneId) {
      errors.push(`Row ${i + 1}: Gene "${row.gene_name}" not found in database`)
      continue
    }

    let position: number | null = null
    if (row.position) {
      position =
        typeof row.position === "string" ? parseInt(row.position, 10) : row.position
      if (isNaN(position)) position = null
    }

    const validTypes = ["substitution", "insertion", "deletion", "frameshift", "other"]
    let mutationType = row.mutation_type?.toLowerCase().trim() || null
    if (mutationType && !validTypes.includes(mutationType)) {
      mutationType = "other"
    }

    const { error } = await supabase.from("amr_mutations").insert({
      gene_id: geneId,
      mutation_name: row.mutation_name.trim(),
      position,
      mutation_type: mutationType,
      wild_type: row.wild_type?.trim() || null,
      mutant: row.mutant?.trim() || null,
      effect: row.effect?.trim() || null,
      nucleotide_change: row.nucleotide_change?.trim() || null,
      validated_by: row.validated_by?.trim() || null,
      origin: row.origin?.trim() || null,
      pmid: row.pmid?.trim() || null,
      status: "pending",
    })

    if (error) {
      errors.push(`Row ${i + 1}: ${error.message}`)
    } else {
      imported++
    }
  }

  revalidatePath("/browse/mutations")
  revalidatePath("/curator/dashboard")

  return {
    success: imported > 0,
    message: `Imported ${imported} of ${data.length} mutations`,
    imported,
    errors,
  }
}

// ------------------------------------------------------------
// Helper: parse CSV text into array of records
// ------------------------------------------------------------
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/["\s]/g, "_"))
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
    const row: Record<string, string> = {}
    headers.forEach((header, j) => {
      row[header] = values[j] || ""
    })
    rows.push(row)
  }

  return rows
}

// ------------------------------------------------------------
// Helper: parse JSON text into array of records
// ------------------------------------------------------------
export function parseJSON(jsonText: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(jsonText)
    if (Array.isArray(parsed)) {
      return parsed
    }
    return [parsed]
  } catch {
    return []
  }
}
