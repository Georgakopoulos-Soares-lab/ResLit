# ResLit 

### Antimicrobial resistance, straight from the literature.

**ResLit** is a searchable database of antimicrobial resistance (AMR) genes and mutations, mined automatically from the scientific literature and cross-referenced against the field's major curated resources — **CARD**, **ResFinder**, and the **NCBI Reference Gene Catalog** (AMRFinder).

Every entry links back to the paper it came from. Browse genes, mutations, and publications with direct PubMed links; filter by antibiotic, organism, country, or year; and export whatever you find as CSV. Each gene and mutation carries a **confidence tier** so you can see at a glance whether it's backed by curated databases, by the literature, or by both.

🔗 **Live at [reslit.info](https://www.reslit.info)** · No login required.

If you have any suggestions or bug reports, please send an email at skulakis@gmail.com   

This repository also serves as the data and code archive of the ResLit manuscript (Frontiers in Microbiology): the released tables, the PMID lists of every pipeline stage, the raw LLM extraction output, the benchmark PMID sets, the manual-audit and screening annotations with their analysis scripts, and the source code of the pipeline and the website.

Full-text articles are not included because of publisher licensing restrictions.

---

## Why ResLit?

Curated AMR databases are excellent but human-curated, so they inevitably lag behind a literature that grows every day. ResLit takes the opposite approach: it reads the papers at scale, extracts the resistance genes and mutations, and then checks its own findings against the curated databases. The result is a resource that's both **broad** (thousands of determinants pulled from the primary literature) and **grounded** (every one cross-referenced and tiered by how well it's supported). It's built for two kinds of people:

- 🔬 **Researchers** who want to see, in one place, everything the literature says about a gene, mutation, organism, or antibiotic.
- 📋 **Curators** who want to find determinants that appear in papers but not yet in reference databases — and flag existing entries worth a second look.

---

## Archive contents

| Archive item | Folder |
|---|---|
| (i) Gene and mutation tables, with evidence tiers, source PMIDs and publication types | [`data_tables/`](data_tables/) |
| (ii) PMID lists at each pipeline stage | [`pmid_lists/`](pmid_lists/) |
| (iii) Benchmark PMID sets | [`benchmark_pmid_sets/`](benchmark_pmid_sets/) |
| (iv) Manual-audit and screening-assessment annotations, with the scripts used to analyse them | [`revisions/`](revisions/) |
| (v) Source code of the pipeline and the website | [`pipeline/`](pipeline/), [`website/`](website/) |
| Raw LLM extraction output (Qwen3-30B-A3B), for re-analysis | [`llm_extractions/`](llm_extractions/) |
| Comparison of ResLit with CARD, ResFinder and the NCBI Reference Gene Catalog (manuscript figures) | [`comparison_with_other_databases/`](comparison_with_other_databases/) |

Each folder has its own README.

---

## How it's put together

Three moving parts: a **pipeline** that reads papers and produces the data, a **comparison** step that validates that data against the external databases, and a **web app** that serves it all. Around them sit the released data and the analyses of the manuscript revision.

```
ResLit/
├── website/                           # Next.js application — see website/README.md for full details
│   ├── app/                           # routes: browse/, curator/, download/, about/
│   ├── components/
│   ├── lib/
│   │   ├── db/schema.ts               # Drizzle/SQLite schema — source of truth for tables
│   │   └── actions/browse.ts          # validation-tier computation, filtering, pagination
│   └── scripts/
│       ├── seed-data/                 # the 4 harmonized CSVs actually loaded into the app's DB
│       └── seed-sqlite.mjs            # pnpm db:seed — clears + reloads papers/genes/mutations
│
├── pipeline/                          # literature → cleaned data (see pipeline/README.md for the full map)
│   ├── 01_pubmed_search/              # PubMed keyword search — ~80 hand-crafted AMR queries (ESearch)
│   ├── 02_biomistral_filtering/       # BioMistral-7B few-shot YES/NO relevance screen
│   ├── 03_scripts_dld/                # full-text retrieval: OA + publisher-API cascades, merge/dedupe/validate
│   │                                  #   (the retrieved full texts are not included: publisher licensing)
│   ├── 04_read_papers/                # Qwen3-30B-A3B (vLLM) structured extraction + field-level audit pass
│   ├── 05_harmonised_pipeline/        # current pipeline (see its own README.md)
│   │   ├── reslit/                    # our own extraction: papers → LLM (Qwen3) → clean/harmonize
│   │   │   ├── genes/                 #   → Full_list_genes_Reslit_harmonized_antib_bact.csv
│   │   │   └── mutations/             #   → Full_list_mutations_Reslit_antib_bact.csv
│   │   ├── other_databases/           # CARD + ResFinder + Reference Gene Catalog → merge/clean
│   │   │   ├── genes/                 #   → Full_list_genes_otherDatabases_..._corrected.csv
│   │   │   └── mutations/             #   → Full_list_mutations_otherDatabases_clean.csv
│   │   ├── reference_data/            # static lookups (e.g. CARD ARO index)
│   │   └── shared_scripts/            # scripts used by both pipelines
│   └── 06_final_output/               # delivered snapshot of the two Reslit CSVs from 05/reslit/
│
├── comparison_with_other_databases/   # does ResLit's own pipeline agree with the external DBs?
│   ├── genes/                         # gene-level overlap: Venn diagrams, per-database membership
│   └── mutations/                     # mutation-level overlap: Venn/UpSet plots, validation-tier
│                                      # reproduction (Confirmed/Established/Supported/Candidate)
│
├── data_tables/                       # the full gene and mutation tables as served by reslit.info
├── pmid_lists/                        # PMIDs at each pipeline stage + BioMistral screening scores
├── llm_extractions/                   # raw Qwen3 output: extraction_summary_batch1-6.json
├── benchmark_pmid_sets/               # human audit (50), screening validation (200), reference benchmark (100), seed lists
└── revisions/                         # analyses added in the revision, each runnable from this repository
    ├── human_audit/                   #   blind annotation of 50 papers by two annotators: precision, recall, agreement
    ├── validation_screening/          #   manual check of 200 BioMistral screening decisions
    ├── reference_benchmark/           #   ResLit vs CARD / ResFinder / NCBI RGC on 100 papers they cite
    ├── review_impact/                 #   effect of review articles on the evidence tiers
    ├── sensitivity_analysis_threshold_supported/  # sensitivity of the Supported tier to its paper threshold
    └── paper_type/                    #   publication type (Review / Research Article) of every PMID, from PubMed
```

**How the pieces connect:** `pipeline/01_pubmed_search/` through `04_read_papers/` take the pipeline from a raw PubMed search down to per-paper structured JSON (genes/mutations extracted by Qwen3; the raw output is in `llm_extractions/`). `05_harmonised_pipeline/` picks up from there and turns that JSON, plus external-database exports, into four harmonized CSVs — two from ResLit's own extraction, two merged from CARD/ResFinder/Reference Gene Catalog. `comparison_with_other_databases/` cross-checks those same four CSVs against each other; this is where the validation-tier logic (below) is worked out and verified against the live app's numbers. The identical four CSVs are then copied into `website/scripts/seed-data/` and loaded by `pnpm db:seed`. Nothing in `website/` re-derives the CSVs — it only consumes them.

### Reproducing the analyses

The analysis scripts in `revisions/` need Python 3 with `pandas` and `openpyxl` (tested with Python 3.8.10, pandas 1.4.3, openpyxl 3.1.5); the sensitivity analysis also needs `matplotlib`. Run each script from its own folder; every path is relative to this repository.

**Not included:** full-text articles (licensing); the local PubMed abstract database `papers.sqlite` (1.4 GB; the 200 validation abstracts are in `revisions/validation_screening/validation_200.csv`); NCBI's `PMC-ids.csv` (download from https://ftp.ncbi.nlm.nih.gov/pub/pmc/PMC-ids.csv.gz); the website's SQLite database (built from `website/scripts/seed-data/` by `website/scripts/seed-sqlite.mjs`).

**Processed-paper count:** the extraction batches hold 117,112 records, of which two are not papers (`10103189 copy`, a duplicate of 10103189, and `papers_downloaded`). The raw files are unchanged; `pmid_lists/04_fulltext_llm_processed.txt` lists the 117,110 PMIDs.

---

## The database

**SQLite** (`better-sqlite3` + Drizzle ORM), embedded and queried in-process — not Supabase/Postgres. This replaced an earlier Supabase backend (Postgres + Supabase Auth) after that project hit its free-tier egress quota; auth is now hand-rolled (`website/lib/auth/`). Keeping the data in-process means no network round-trip and no egress bill, which suits a read-heavy public resource nicely.

See **`website/README.md`** for the full architecture writeup (why SQLite, Railway deployment, backups) and **`website/lib/db/schema.ts`** for the table definitions.

### Confidence tiers

Every gene and mutation is scored on two independent lines of evidence — whether it appears in the curated databases, and how many distinct papers support it. Tiers are computed live (`getValidationTiers` / `getMutationValidationTiers` in `website/lib/actions/browse.ts`):

| Tier | Meaning |
|---|---|
| 🟢**Confirmed** | Corroborated by more than one independent line of evidence, either present in two or more reference databases or present in one reference database and independently recovered by ResLit; or verified by a curator |
| 🔵**Established** | Curated in only one external database, but not (yet) recovered by ResLit's own pipeline |
| 🟠**Supported** | Found only by ResLit, but backed by ≥ 3 distinct papers |
| ⚪**Candidate** | Found only by ResLit, backed by < 3 papers |


---

## What you can browse

**🧬 Genes** — `/browse/genes`
Filter by resistance mechanism, antibiotic, organism, and country (with a "Missing" option for gaps). View genes or individual alleles.

**🔤 Mutations** — `/browse/mutations`
Filter by gene name, resistance mechanism, antibiotic, organism, and country. View individual mutations, or group them by gene.


---

## Who can do what

| Role | Capabilities |
|------|-------------|
| **Public** | Browse, search, filter, download, add comments |
| **Curator** | Everything public, plus import data and review/approve/reject entries |

---

## Citing ResLit

If ResLit is useful in your work, please cite:

> _[citation / DOI to be added on publication]_

## License

The ResLit source code is released under the [MIT License](LICENSE).


---

<sub>Built by the Georgakopoulos-Soares Lab. Questions, corrections, or a determinant we missed? Open an issue — or, if you're a curator, flag it right in the app.</sub>
