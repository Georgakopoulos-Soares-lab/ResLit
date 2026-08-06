# ResLit Pipeline

An automated pipeline that builds an antimicrobial resistance (AMR) gene and
mutation database from the PubMed literature: candidate-paper search →
relevance filtering → full-text retrieval → LLM-based structured extraction
(Qwen3-30B-A3B) → cleaning/harmonization against external AMR databases
(CARD, ResFinder, NCBI Reference Gene Catalog) → final tables served by the
ResLit website.

For the full narrative — every script, every input/output file, exact row
counts, and known gaps — see [`readme_pipeline.txt`](readme_pipeline.txt).
This README is a short map to get oriented; the folder numbers below match
the step numbers in that file.

## Stages

| # | Folder | Stage | Status in this repo |
|---|---|---|---|
| 1 | [`01_pubmed_search/`](01_pubmed_search/) | PubMed keyword search across ~80 hand-crafted AMR queries (ESearch, year/month/day recursion to work around the 9,999-result cap) | Notebook only; output (2,057,492 PMIDs) not included — too large |  PubTator3 + MeSH hybrid classifier — narrows to 1,420,586 PMIDs |
| 3 | [`02_biomistral_filtering/`](02_biomistral_filtering/) | BioMistral-7B few-shot YES/NO relevance screen on title/abstract/MeSH/PubTator flags 
| 4 | [`03_scripts_dld/`](03_scripts_dld/) | Full-text retrieval: OA cascade → publisher-API cascade → merge/dedupe/body-validate
| 5 | [`04_read_papers/`](04_read_papers/) | Qwen3-30B-A3B (via vLLM) two-pass structured extraction of genes/mutations, with a field-by-field "atomic auditor" verification pass | Scripts only; 117,112 papers processed
| 6 | [`05_harmonised_pipeline/`](05_harmonised_pipeline/) + [`06_final_output/`](06_final_output/) | Post-extraction cleaning, gene/organism/antibiotic-name normalization, harmonization against CARD/ResFinder/NCBI Reference Gene Catalog | **Full scripts + final tables included** |


## Final deliverables

- [`06_final_output/Full_list_genes_Reslit_harmonized_antib_bact.csv`](06_final_output/Full_list_genes_Reslit_harmonized_antib_bact.csv) — 54,175 rows
- [`06_final_output/Full_list_mutations_Reslit_antib_bact.csv`](06_final_output/Full_list_mutations_Reslit_antib_bact.csv) — 26,094 rows
- Plus the equivalent external-database comparison tables under
  [`05_harmonised_pipeline/other_databases/`](05_harmonised_pipeline/other_databases/)
  (CARD + ResFinder + NCBI Reference Gene Catalog, merged and harmonized).



## Setup

Stage 3/4 download scripts need API credentials: copy
`03_scripts_dld/apikey.env.example` to `03_scripts_dld/apikey.env` and fill
in an NCBI key (strongly recommended) and any publisher keys you have
(Elsevier, Wiley TDM, Springer) — see `03_scripts_dld/README.md`. This file
is git-ignored and must never be committed.

## What's intentionally not included

Several large, regenerable, or third-party artifacts are left out to keep
this repo a reasonable size — each stage's own README documents exactly how
to regenerate what it needs:

- Raw PMID lists from Stages 1–2 (millions of rows) and the PubTator3/MeSH
  classifier code itself (Stage 2 was never migrated into this repo).
- Per-batch BioMistral scoring CSVs and SLURM logs (Stage 3 filtering).
- Raw Qwen3/vLLM extraction JSON (`extraction_summary_batch1-6.json`,
  ~250 MB total) — Stage 5's raw model output; only the downstream converter
  scripts and final harmonized tables survive here.
- Large external reference dumps used by the harmonization scripts
  (`Bacteria_genes_all.txt`, ~99 MB; `Bacteria.gene_info`, ~1.4 GB, from
  NCBI's Gene database) and intermediate scratch CSVs — see
  `05_harmonised_pipeline/README.md`.
- Vendored external git repos (ResFinder's `resfinder_db`/`pointfinder_db`).

## Known limitations (carried over from the original working notes)

- Several scripts under `05_harmonised_pipeline/` were written with
  hardcoded absolute paths from their original location on disk and will
  need those constants updated to run standalone from this repo's layout —
  see `05_harmonised_pipeline/README.md`.
- A couple of post-extraction cleaning steps were done by hand
  (interactive/manual QA), not scripted — documented inline in
  `readme_pipeline.txt` Step 6.
- Stage 3's full-text pipeline deliberately does not perform PDF-to-text
  extraction or browser-automated/institution-proxy retrieval — see
  `03_scripts_dld/SUPPLEMENTARY_METHODS.md` for the full retrieval
  methodology and rationale.
