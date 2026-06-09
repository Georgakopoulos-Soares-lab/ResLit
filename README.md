# ResLit — Antimicrobial Resistance Gene & Mutation Database

A curated database of AMR genes and mutations extracted from scientific literature. Researchers can browse genes, mutations, and papers with direct PubMed links, filter by antibiotic, organism, location, and year, and download results as CSV.

## Tech Stack

- **Next.js** — React framework with server-side rendering
- **TypeScript** — type-safe throughout
- **Tailwind CSS + shadcn/ui** — UI components
- **Supabase** — PostgreSQL database with authentication and RLS

## Getting Started

### Prerequisites

- Node.js 20+ (see note below) and pnpm
- Supabase project with credentials in `.env.local`

> **Node version:** The system may have an older Node. Use nvm's Node 20 for all scripts:
> `~/.nvm/versions/node/v20.11.0/bin/node`

### Install and run

```bash
pnpm install
pnpm dev
# open http://localhost:3000
```

### Environment variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## Database Setup

Run the SQL migrations in order in the Supabase SQL editor:

1. `supabase_migration.sql` — core tables, RLS policies, indexes
2. `supabase_migration_curation.sql` — curation history and notes tables
3. `supabase_add_direct_fields.sql` — adds `geographic_location`, `key_findings`, `title_pmid`, `year_pmid` columns
4. `supabase_add_paper_title_year.sql` — paper title/year fields
5. `supabase_add_affiliation.sql` — curator affiliation field
6. `supabase_add_curator_tracking.sql` — curator tracking columns
7. `supabase_mutations_schema.sql` — additional mutation columns (`country`, `paper_pmid`, etc.)

---

## Importing Data

All import scripts are in `scripts/` and must be run with **Node 20** from inside the project directory.

```bash
cd /path/to/b_KNfmUgaXkR6
```

### Import genes from CSV

```bash
~/.nvm/versions/node/v20.11.0/bin/node scripts/import-genes-csv.mjs ../genes_extracted.csv
```

Expected CSV columns:
```
gene_name, allele, encodes, mechanism, confers_resistance_to,
resistance_mechanism_class, organisms_tested_in, role_in_paper,
validation_method, paper_pmid, key_findings, geographic_location,
Title_PMID, YEAR_PMID
```

### Import mutations from CSV

```bash
~/.nvm/versions/node/v20.11.0/bin/node scripts/import-mutations-csv.mjs ../mutations_extracted.csv
```

Expected CSV columns:
```
gene_name, notation, nucleotide_change, protein_change, position_in_molecule,
confers_resistance_to, organisms_observed_in, effect_on_function,
mutation_type, validated_by, origin, paper_pmid, key_findings,
geographic_location, Title_PMID, YEAR_PMID
```

### Backfill mutation country (for data imported before the country fix)

If mutations were imported before the `geographic_location → country` mapping was added, run:

```bash
~/.nvm/versions/node/v20.11.0/bin/node scripts/backfill-mutation-country.mjs ../mutations_extracted.csv
```

### Import QWEN3 extraction output (JSON format)

```bash
~/.nvm/versions/node/v20.11.0/bin/node scripts/import-qwen3.js path/to/qwen3_output.txt
```

---

## Other Useful Scripts

| Script | Purpose |
|--------|---------|
| `scripts/clear-data.mjs` | Delete all genes and mutations (keeps schema) |
| `scripts/check-data.mjs` | Print row counts for all tables |
| `scripts/check-db.mjs` | Verify database connection and schema |
| `scripts/deduplicate.mjs` | Remove duplicate gene/mutation rows |
| `scripts/setup-curator.mjs` | Promote a user to curator role |
| `scripts/rebuild-database.mjs` | Drop and recreate all tables |

All scripts read credentials from `.env.local` automatically.

---

## Project Structure

```
app/
  page.tsx                  # Homepage — live stats
  browse/
    genes/                  # Browse AMR genes with filters
    mutations/              # Browse AMR mutations with filters
    papers/                 # Browse papers; [pmid]/ for detail view
  curator/
    dashboard/              # Review pending entries
    import/                 # Bulk import UI
    login/                  # Curator authentication
  download/                 # CSV export
  about/
  collaborators/

components/
  browse/
    filter-sidebar.tsx      # Filters for genes and mutations
    paper-filter-sidebar.tsx # Filters for papers
    genes-table.tsx
    mutations-table.tsx
    papers-table.tsx
    download-filtered-button.tsx
    search-bar.tsx
    browse-pagination.tsx
  curator/
  ui/                       # shadcn/ui components

lib/
  types.ts                  # TypeScript interfaces
  actions/
    browse.ts               # All browse/filter/pagination queries
    download.ts             # CSV export with enrichment columns
    import.ts               # In-app import server actions
    comments.ts
    curator.ts
  supabase/
    client.ts
    server.ts

scripts/                    # Node.js data management scripts
```

---

## Browse Features

### Genes (`/browse/genes`)
Filters: resistance mechanism, antibiotic, organism, country (with "Missing" option).

### Mutations (`/browse/mutations`)
Filters: gene name, resistance mechanism, antibiotic, organism, country.
Two modes: browse individual mutations, or browse by gene.

### Papers (`/browse/papers`)
Lists all unique papers referenced in the dataset. Shows gene count, mutation count, and top antibiotics per paper.
Filters: location, antibiotic, organism, publication year range.
Click a PMID to see the full detail page (genes + mutations from that paper, key findings, PubMed link).

---

## CSV Download Columns

Downloaded files include enrichment columns beyond what is stored per row:

**Genes CSV:** Gene Name, Resistance Mechanism Class, Confers Resistance To, Organisms Tested In, Encodes, Mechanism, Validation Method, Role in Paper, Country, Year, **PMID** (all papers citing this gene), **Status** ("Reslit"), **Validated** (No/Validated), **Validated From**, **Comments**

**Mutations CSV:** Mutation Name, Gene Name, Position, Mutation Type, Wild Type, Mutant, Nucleotide Change, Protein Change, Confers Resistance To, Organisms Observed In, Effect, Origin, Validated By, Country, Year, **PMID** (all papers citing this gene), **Status** ("Reslit"), **Validated**, **Validated From**, **Comments**

---

## Database Tables

| Table | Description |
|-------|-------------|
| `papers` | Paper metadata — PMID, title, year, key findings, geographic location |
| `amr_genes` | Gene entries with resistance mechanisms, organisms, location |
| `amr_mutations` | Mutation records with nucleotide/protein changes |
| `curators` | Curator user profiles |
| `curation_history` | Audit log of approve/reject actions |
| `curation_notes` | Curator annotations on entries |
| `comments` | Public comments on genes and mutations |

---

## Role-Based Access

| Role | Capabilities |
|------|-------------|
| Public | Browse, search, filter, download, add comments |
| Curator | All public + import data, review and approve/reject entries |
| Admin | All curator + manage users |
