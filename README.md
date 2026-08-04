# ResLit — Antimicrobial Resistance Gene & Mutation Database

A curated database of AMR genes and mutations extracted from scientific literature, cross-referenced
against CARD, ResFinder, and the NCBI Reference Gene Catalog (AMRFinder). Researchers can browse genes,
mutations, and papers with direct PubMed links, filter by antibiotic, organism, location, and year, and
download results as CSV.

## Repository Structure

This repo has three top-level parts: the literature-extraction pipeline that produces the data, the
cross-database validation that checks it, and the web app that serves it.

```
ResLit/
├── site/                              # Next.js application — see site/README.md for full details
│   ├── app/                           # routes: browse/, curator/, download/, about/
│   ├── components/
│   ├── lib/
│   │   ├── db/schema.ts               # Drizzle/SQLite schema — source of truth for tables
│   │   └── actions/browse.ts          # validation-tier computation, filtering, pagination
│   └── scripts/
│       ├── seed-data/                 # the 4 harmonized CSVs actually loaded into the app's DB
│       └── seed-sqlite.mjs            # pnpm db:seed — clears + reloads papers/genes/mutations
│
├── pipeline/                          # literature → cleaned data
│   └── harmonised_pipeline/           # current pipeline (see its own README.md + PIPELINE.md)
│       ├── reslit/                    # our own extraction: papers → LLM (Qwen3) → clean/harmonize
│       │   ├── genes/                 #   → Full_list_genes_Reslit_harmonized_antib_bact.csv
│       │   └── mutations/             #   → Full_list_mutations_Reslit_antib_bact.csv
│       ├── other_databases/           # CARD + ResFinder + Reference Gene Catalog → merge/clean
│       │   ├── genes/                 #   → Full_list_genes_otherDatabases_..._corrected.csv
│       │   └── mutations/             #   → Full_list_mutations_otherDatabases_clean.csv
│       ├── reference_data/            # static lookups (e.g. CARD ARO index)
│       └── shared_scripts/            # scripts used by both pipelines
│
└── comparison_with_other_databases/   # does ResLit's own pipeline agree with the external DBs?
    ├── genes/                         # gene-level overlap: Venn diagrams, per-database membership
    └── mutations/                     # mutation-level overlap: Venn/UpSet plots, validation-tier
                                        # reproduction (Confirmed/Established/Supported/Candidate)
```

**How the pieces connect:** `pipeline/harmonised_pipeline/` turns raw papers and external-database
exports into four harmonized CSVs (2 from ResLit's own pipeline, 2 merged from CARD/ResFinder/Reference
Gene Catalog). `comparison_with_other_databases/` cross-checks those same four CSVs against each other —
this is where the validation-tier logic (see below) gets worked out and verified against the live app's
numbers. The identical four CSVs are copied into `site/scripts/seed-data/` and loaded into the app's
database by `pnpm db:seed`. Nothing in `site/` re-derives the CSVs; it only consumes them.

## Database

**SQLite** (`better-sqlite3` + Drizzle ORM), embedded and queried in-process — not Supabase/Postgres. This
replaced an earlier Supabase-based backend (Postgres + Supabase Auth), migrated off after the Supabase
project hit its free-tier egress quota. Auth is now hand-rolled (`site/lib/auth/`), not Supabase Auth.

See **`site/README.md`** for the full architecture writeup (why SQLite, deployment on Railway, backups)
and **`site/lib/db/schema.ts`** for the table definitions.

### Validation tiers

Every gene and mutation gets a confidence tier, computed live from cross-database presence and how many
distinct papers support it (`getMutationValidationTiers`/`getValidationTiers` in
`site/lib/actions/browse.ts`):

| Tier | Meaning |
|---|---|
| **Confirmed** | Reported in ≥ 2 source databases (ResLit + at least one of CARD/ResFinder/Reference Gene Catalog), or curator-approved |
| **Established** | Reported only in the external databases, not (yet) found by ResLit's own pipeline |
| **Supported** | ResLit-only, but backed by ≥ 3 distinct papers |
| **Candidate** | ResLit-only, backed by < 3 papers |

This is exactly what `comparison_with_other_databases/mutations/` and `.../genes/` verify independently
against static CSV snapshots — useful for sanity-checking the live app's tier counts without querying the
database directly.

The homepage (`site/app/page.tsx`) surfaces this live: **Unique Genes** and **Total Mutations** cards each
break down by tier (Confirmed / Established / Supported / Candidate), alongside **Publications** (distinct
papers cited across genes and mutations) and **Expert Curators** (accounts actively reviewing entries).

## Quick Start

```bash
cd site
pnpm install
pnpm db:migrate   # create/update the local SQLite schema
pnpm db:seed      # populate genes/mutations/papers from scripts/seed-data/*.csv
pnpm dev          # open http://localhost:3000
```

See `site/README.md` for environment variables, re-seeding, Drizzle Studio, and the Railway deployment
setup.

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

## Database Tables

| Table | Description |
|-------|-------------|
| `papers` | Paper metadata — PMID, title, year, key findings, geographic location |
| `amr_genes` | Gene entries with resistance mechanisms, organisms, location |
| `amr_mutations` | Mutation records with nucleotide/protein changes |
| `curators` | Curator accounts (hand-rolled auth — see `site/README.md`) |
| `sessions` | Curator login sessions (opaque tokens, hashed at rest) |
| `verification_tokens` | Single-use email verification / password reset tokens |
| `curation_history` | Audit log of approve/reject actions |
| `curation_notes` | Curator annotations on entries |
| `comments` | Public comments on genes and mutations |

## Role-Based Access

| Role | Capabilities |
|------|-------------|
| Public | Browse, search, filter, download, add comments |
| Curator | All public + import data, review and approve/reject entries |
| Admin | All curator + manage users |
