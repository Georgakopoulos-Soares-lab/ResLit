# Harmonized AMR genes/mutations pipeline

Scripts, small reference/lookup files, raw source inputs, and final output CSVs for the
two pipelines that produce the harmonized genes/mutations data used by the app:

- **`reslit/`** — our own literature-extraction pipeline ("Reslit"): papers → LLM
  extraction (Qwen3-30B-A3B) → cleaning/normalization/harmonization.
- **`other_databases/`** — external AMR databases (CARD, ResFinder, NCBI Reference Gene
  Catalog / AMRFinder) → merge → cleaning/normalization/harmonization.

The two pipelines are independent end to end; they only meet at the very end, where an
app-side seed script loads all four final CSVs into a database (not included here — this
folder documents the *data-harmonization* process, not the app).

For the full, step-by-step methods write-up (every script, every column transformation,
exact row counts, known gaps) see `PIPELINE.md` in this folder, which is a copy of the
project's `README_harmonization.txt`.

## Layout

```
harmonised_pipeline/
├── reference_data/          small static lookup files used by multiple scripts
│   └── card/                 CARD-specific lookup files (snps.txt, aro_index.tsv, ...)
├── shared_scripts/           scripts used by both pipelines
├── reslit/
│   ├── genes/                Reslit genes: scripts + final output CSV
│   └── mutations/            Reslit mutations: scripts + final output CSV
└── other_databases/
    ├── genes/                 CARD/ResFinder/RefGeneCatalog genes: scripts, raw-merge
    │                          intermediate, and both final output CSVs
    └── mutations/              CARD/ResFinder/RefGeneCatalog mutations: scripts, raw
                                 source inputs (xlsx/csv), and final output CSV
```

## Final output CSVs (the harmonized data itself)

| File | Pipeline | Rows |
|---|---|---|
| `reslit/genes/Full_list_genes_Reslit_harmonized_antib_bact.csv` | Reslit, genes | 54,181 |
| `reslit/mutations/Full_list_mutations_Reslit_antib_bact.csv` | Reslit, mutations | 26,094 |
| `other_databases/genes/Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv` | Other DBs, genes | 22,082 |
| `other_databases/genes/..._bla_fixed_pubmed_antibiotic_corrected.csv` | Other DBs, genes (PMID/antibiotic-class backfilled from CARD ARO lookup — candidate replacement for the file above; not yet wired into the app's seed data) | 22,082 |
| `other_databases/mutations/Full_list_mutations_otherDatabases_clean.csv` | Other DBs, mutations | 8,866 |

## What's intentionally NOT included

- **Huge external reference dumps**: `Bacteria_genes_all.txt` (~99MB, flat list of
  bacterial gene symbols/synonyms) and `Bacteria.gene_info` (~1.4GB, the raw NCBI Gene
  `gene_info` dump for taxon Bacteria). Several scripts depend on `Bacteria_genes_all.txt`
  (the LLM-extraction gene-name filter in `qwen3_to_csv.py`/`qwen3_mutations_to_csv.py`,
  and the capitalization fixes `fix_gene_capitalization_genes.py`/`_reslit.py`/
  `fix_gene_capitalization.py`). To regenerate it: download the NCBI Gene `gene_info`
  dump restricted to Bacteria (`ftp.ncbi.nlm.nih.gov/gene/DATA/gene_info.gz`, or the
  taxon-specific `Bacteria/` subfolder under
  `ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/`), then build a flat gene-symbol/synonym
  list from its `Symbol` and `Synonyms` columns — that derivation script did not survive
  in this checkout, so it needs to be rebuilt from scratch.
- **Large raw LLM-extraction batches and intermediate CSVs** (`extraction_summary_batch*.json`,
  `genes_batch*.csv`, `genes_all*.csv`, `mutations_all*.csv`, and equivalents on the
  other-databases side) — these are pipeline byproducts on the way to the final CSVs
  above; `PIPELINE.md` documents every transformation between them in detail, but they
  aren't reproduced here to keep this folder to source + final data.
- **Vendored external git repos** (ResFinder's `resfinder_db`/`pointfinder_db`) — clone
  directly from `bitbucket.org/genomicepidemiology/resfinder_db` (used version: 2.6.0)
  and `bitbucket.org/genomicepidemiology/pointfinder_db` if needed.
- The app-side database seed script and importers (loading these CSVs into SQLite/Supabase)
  — out of scope for this folder, which is about producing the CSVs, not consuming them.

## Known limitations of the scripts as packaged here

- **Hardcoded absolute paths**: nearly every script here was written with hardcoded
  absolute paths pointing at its *original* location on disk (e.g.
  `/home/.../reslit/site/paper/...`), not relative paths. They are copied here as-is,
  unmodified, as a faithful record of what was actually run — they will need their path
  constants updated to run standalone from this folder's layout.
- **One known-stale path**: `other_databases/mutations/concatenate_details.py` has
  `SHORTNAME_ANTIBIOTICS_FILE` hardcoded to a path in an unrelated, earlier sibling
  project directory outside this repo entirely. The correct data is bundled here at
  `reference_data/card/shortname_antibiotics.tsv` — point the script there.
- **Two steps have no script at all** and were done via interactive/manual editing (see
  `PIPELINE.md` for details): the genes-side "AlleleCorrected" allele/encodes fix, and
  part of the Reslit mutations cleanup documented only in prose inside
  `bash_commands_for_mutations.sh`.
- A couple of the `readme.txt`/`README_mutations.txt` files' documented row-drop counts
  don't match what the scripts on disk actually do (verified directly, not just taken on
  faith) — see `PIPELINE.md`'s caveats section for specifics.

## Recommended reading order

1. `PIPELINE.md` (this folder) — the full narrative, script by script, with exact
   commands and verified row counts for every transformation.
2. `reslit/genes/bash_commands_for_genes.sh` and `reslit/mutations/bash_commands_for_mutations.sh`
   — the literal command sequences for the Reslit pipeline.
3. `other_databases/genes/readme.txt` and `other_databases/mutations/README_mutations.txt`
   — the (mostly, see caveats above) step-by-step docs for the other-databases pipeline.
