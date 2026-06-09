# Database Input Format Guide

This guide explains the input format required to import AMR data into the ResLit database. Your QWEN3 extraction output is **already in the correct format**!

## Overview

The data comes from QWEN3 AI extraction from scientific papers in this JSON structure:

```json
{
  "pmid": "string - PubMed ID",
  "paper_type": "single_gene | multi_gene_resistome | review",
  "genes": { /* genes object */ },
  "mutations": { /* mutations object */ },
  "key_findings": "string - main findings from paper",
  "methodology": "string - methods used",
  "geographic_location": ["array", "of", "countries"],
  "sample_size": 123
}
```

---

## 1. Papers Table

**Input from QWEN3:**
```json
{
  "pmid": "22660700",
  "paper_type": "single_gene",
  "key_findings": "The study identified the aac(2′)-IIa gene...",
  "methodology": "Cloning, transformation, acetyltransferase activity assays...",
  "geographic_location": ["Japan"],
  "sample_size": 27
}
```

**Database Fields:**
| Field | Type | Example | Source |
|-------|------|---------|--------|
| pmid | TEXT (PRIMARY KEY) | "22660700" | QWEN3 `pmid` |
| paper_type | TEXT | "single_gene", "multi_gene_resistome", "review" | QWEN3 `paper_type` |
| key_findings | TEXT | "The study identified..." | QWEN3 `key_findings` |
| methodology | TEXT | "Cloning, transformation..." | QWEN3 `methodology` |
| geographic_location | TEXT[] | ["Japan", "USA"] | QWEN3 `geographic_location` array |
| sample_size | INTEGER | 27 | QWEN3 `sample_size` |
| created_at | TIMESTAMPTZ | auto | Auto-generated |
| updated_at | TIMESTAMPTZ | auto | Auto-generated |

---

## 2. AMR Genes Table

**Input from QWEN3:**
```json
{
  "genes": {
    "aac(2')-IIa": {
      "allele": "IIa",
      "encodes": "Kasugamycin 2′-N-acetyltransferase",
      "mechanism": "Inactivates kasugamycin by acetylating...",
      "confers_resistance_to": ["kasugamycin"],
      "resistance_mechanism_class": "enzymatic_inactivation",
      "organisms_tested_in": ["Burkholderia glumae", "Acidovorax avenae"],
      "role_in_paper": "experimentally_characterized",
      "validation_method": "Cloning, transformation, acetyltransferase activity assays"
    }
  }
}
```

**Database Fields:**
| Field | Type | Example | Source |
|-------|------|---------|--------|
| id | UUID | auto | Auto-generated |
| gene_name | TEXT | "aac(2')-IIa" | QWEN3 `genes` object key |
| allele | TEXT | "IIa" | QWEN3 `allele` |
| encodes | TEXT | "Kasugamycin 2′-N-acetyltransferase" | QWEN3 `encodes` |
| mechanism | TEXT | "Inactivates kasugamycin by..." | QWEN3 `mechanism` |
| resistance_mechanism_class | TEXT | "enzymatic_inactivation", "efflux", "target_modification" | QWEN3 `resistance_mechanism_class` |
| confers_resistance_to | TEXT[] | ["kasugamycin", "gentamicin"] | QWEN3 `confers_resistance_to` array |
| organisms_tested_in | TEXT[] | ["Burkholderia glumae", "E. coli"] | QWEN3 `organisms_tested_in` array |
| role_in_paper | TEXT | "experimentally_characterized", "mentioned" | QWEN3 `role_in_paper` |
| validation_method | TEXT | "Cloning, transformation, assays..." | QWEN3 `validation_method` |
| paper_pmid | TEXT (FK) | "22660700" | QWEN3 `pmid` |
| isolation_location | TEXT | "Japan" | From papers geographic_location (optional) |
| isolation_country | TEXT | "Japan" | From papers geographic_location (optional) |
| year | INTEGER | 2012 | Can be extracted from PMID or paper metadata |
| pmid | TEXT | "22660700" | QWEN3 `pmid` (duplicate reference) |
| status | TEXT | "pending", "curated", "rejected" | Curator workflow |
| created_at | TIMESTAMPTZ | auto | Auto-generated |
| updated_at | TIMESTAMPTZ | auto | Auto-generated |

**Resistance Mechanism Classes:**
- `enzymatic_inactivation` - Enzyme inactivates the antibiotic
- `efflux` - Efflux pump removes antibiotic from cell
- `target_modification` - Modifies antibiotic's target
- `target_protection` - Protects the target
- `reduced_permeability` - Reduces antibiotic entry

---

## 3. AMR Mutations Table

**Input from QWEN3:**
```json
{
  "mutations": {
    "aac(2')-IIa": {
      "gene_type": "amr_gene",
      "mutations_found": [
        {
          "notation": "S146T",
          "nucleotide_change": "T436A",
          "protein_change": "S146T",
          "position_in_molecule": "position 146 in AAC(2′)-IIa",
          "confers_resistance_to": ["kasugamycin"],
          "organisms_observed_in": ["Acidovorax avenae subsp. avenae"],
          "effect_on_function": "Substitution may increase MIC to kasugamycin",
          "mutation_type": "substitution",
          "validated_by": "sequence analysis",
          "origin": "naturally_occurring"
        }
      ]
    }
  }
}
```

**Database Fields:**
| Field | Type | Example | Source |
|-------|------|---------|--------|
| id | UUID | auto | Auto-generated |
| gene_id | UUID (FK) | UUID of parent gene | Link to amr_genes |
| mutation_name | TEXT | "S146T", "Δ50-100" | QWEN3 `notation` |
| position | INTEGER | 146 | QWEN3 `position_in_molecule` (extracted number) |
| mutation_type | TEXT | "substitution", "insertion", "deletion", "frameshift", "other" | QWEN3 `mutation_type` |
| wild_type | TEXT | "S" | QWEN3 protein change before position |
| mutant | TEXT | "T" | QWEN3 protein change after position |
| effect | TEXT | "Substitution may increase MIC..." | QWEN3 `effect_on_function` |
| nucleotide_change | TEXT | "T436A" | QWEN3 `nucleotide_change` |
| protein_change | TEXT | "S146T" | QWEN3 `protein_change` |
| confers_resistance_to | TEXT[] | ["kasugamycin"] | QWEN3 `confers_resistance_to` array |
| organisms_observed_in | TEXT[] | ["Acidovorax avenae"] | QWEN3 `organisms_observed_in` array |
| validated_by | TEXT | "sequence analysis", "MIC testing", "functional assay" | QWEN3 `validated_by` |
| origin | TEXT | "naturally_occurring", "laboratory", "clinical" | QWEN3 `origin` |
| pmid | TEXT | "22660700" | QWEN3 `pmid` |
| status | TEXT | "pending", "curated", "rejected" | Curator workflow |
| created_at | TIMESTAMPTZ | auto | Auto-generated |
| updated_at | TIMESTAMPTZ | auto | Auto-generated |

**Mutation Types:**
- `substitution` - One amino acid replaced with another (e.g., S146T)
- `insertion` - One or more amino acids added
- `deletion` - One or more amino acids removed
- `frameshift` - Insertion/deletion causing frame shift
- `other` - Any other type

---

## Import Process Steps

### Step 1: Prepare Data
Extract JSON from QWEN3 output files (like `QWEN3_small.txt`)

### Step 2: Create Import Script
Create a TypeScript/JavaScript import function that:

```typescript
// Example import function structure
async function importFromQWEN3(jsonData: any) {
  // 1. Insert paper
  await insertPaper({
    pmid: jsonData.pmid,
    paper_type: jsonData.paper_type,
    key_findings: jsonData.key_findings,
    methodology: jsonData.methodology,
    geographic_location: jsonData.geographic_location,
    sample_size: jsonData.sample_size,
  })
  
  // 2. Insert genes
  for (const [geneName, geneData] of Object.entries(jsonData.genes)) {
    await insertGene({
      gene_name: geneName,
      allele: geneData.allele,
      encodes: geneData.encodes,
      mechanism: geneData.mechanism,
      resistance_mechanism_class: geneData.resistance_mechanism_class,
      confers_resistance_to: geneData.confers_resistance_to,
      organisms_tested_in: geneData.organisms_tested_in,
      role_in_paper: geneData.role_in_paper,
      validation_method: geneData.validation_method,
      paper_pmid: jsonData.pmid,
      status: 'pending', // Requires curator review
    })
  }
  
  // 3. Insert mutations
  for (const [geneName, mutationData] of Object.entries(jsonData.mutations)) {
    const gene = await getGeneByName(geneName)
    for (const mutation of mutationData.mutations_found) {
      await insertMutation({
        gene_id: gene.id,
        mutation_name: mutation.notation,
        position: extractPosition(mutation.position_in_molecule),
        mutation_type: mutation.mutation_type,
        effect: mutation.effect_on_function,
        nucleotide_change: mutation.nucleotide_change,
        protein_change: mutation.protein_change,
        confers_resistance_to: mutation.confers_resistance_to,
        organisms_observed_in: mutation.organisms_observed_in,
        validated_by: mutation.validated_by,
        origin: mutation.origin,
        pmid: jsonData.pmid,
        status: 'pending', // Requires curator review
      })
    }
  }
}
```

### Step 3: Database Setup
1. Run `supabase_migration.sql` in your Supabase dashboard
2. Ensure RLS policies allow curator insertions
3. Run import script

### Step 4: Curation
All imported data starts with `status: 'pending'` and requires curator approval to appear in public views.

---

## Example: Complete Data Entry

**QWEN3 JSON Input:**
```json
{
  "pmid": "22660700",
  "paper_type": "single_gene",
  "genes": {
    "aac(2')-IIa": {
      "allele": "IIa",
      "encodes": "Kasugamycin 2′-N-acetyltransferase",
      "mechanism": "Inactivates kasugamycin by acetylating the 2′-amino group",
      "confers_resistance_to": ["kasugamycin"],
      "resistance_mechanism_class": "enzymatic_inactivation",
      "organisms_tested_in": ["Burkholderia glumae"],
      "role_in_paper": "experimentally_characterized",
      "validation_method": "Cloning and activity assays"
    }
  },
  "mutations": {
    "aac(2')-IIa": {
      "mutations_found": [
        {
          "notation": "S146T",
          "nucleotide_change": "T436A",
          "protein_change": "S146T",
          "position_in_molecule": "position 146",
          "confers_resistance_to": ["kasugamycin"],
          "organisms_observed_in": ["Burkholderia glumae"],
          "effect_on_function": "Increases MIC",
          "mutation_type": "substitution",
          "validated_by": "sequence analysis",
          "origin": "naturally_occurring"
        }
      ]
    }
  },
  "key_findings": "aac(2′)-IIa identified as kasugamycin resistance mechanism",
  "methodology": "Cloning and activity assays",
  "geographic_location": ["Japan"],
  "sample_size": 27
}
```

**Results in Database:**

**papers table:**
```
pmid: 22660700
paper_type: single_gene
key_findings: aac(2′)-IIa identified...
methodology: Cloning and activity assays
geographic_location: ["Japan"]
sample_size: 27
```

**amr_genes table:**
```
id: <uuid>
gene_name: aac(2')-IIa
allele: IIa
encodes: Kasugamycin 2′-N-acetyltransferase
mechanism: Inactivates kasugamycin...
resistance_mechanism_class: enzymatic_inactivation
confers_resistance_to: ["kasugamycin"]
organisms_tested_in: ["Burkholderia glumae"]
role_in_paper: experimentally_characterized
validation_method: Cloning and activity assays
paper_pmid: 22660700
status: pending
```

**amr_mutations table:**
```
id: <uuid>
gene_id: <uuid from gene above>
mutation_name: S146T
position: 146
mutation_type: substitution
nucleotide_change: T436A
protein_change: S146T
confers_resistance_to: ["kasugamycin"]
organisms_observed_in: ["Burkholderia glumae"]
effect: Increases MIC
validated_by: sequence analysis
origin: naturally_occurring
pmid: 22660700
status: pending
```

---

## Null/Missing Value Handling

If QWEN3 doesn't extract a field, use `null`:

```json
{
  "allele": null,  // Not specified
  "encodes": "protein name",
  "organisms_tested_in": [],  // Empty if none mentioned
}
```

In database, these become:
- `NULL` for scalar fields (text, integer)
- `NULL` or `[]` for array fields

---

## Ready to Import?

Your `QWEN3_small.txt` file already contains perfectly formatted data! Next steps:

1. **Setup database:** Run migrations in Supabase
2. **Create import function:** Build TypeScript function following the pattern above
3. **Run import:** Parse QWEN3 JSON and insert into database
4. **Verify data:** Check in Supabase dashboard
5. **Curate entries:** Approve/reject in curator dashboard
6. **View on website:** Curated entries appear in browse page
