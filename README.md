# ResLit: data, code and analyses

This archive accompanies the ResLit manuscript (Frontiers in Microbiology). It holds the released gene and mutation tables, the PMID lists of every pipeline stage, the raw LLM extraction output, the benchmark PMID sets, the manual-audit and screening annotations with their analysis scripts, and the source code of the pipeline and the website (https://reslit.info).

Full-text articles are not included because of publisher licensing restrictions.

## Contents

| Archive item | Folder |
|---|---|
| (i) Gene and mutation tables, with evidence tiers, source PMIDs and publication types | [`data_tables/`](data_tables/) |
| (ii) PMID lists at each pipeline stage | [`pmid_lists/`](pmid_lists/) |
| (iii) Benchmark PMID sets | [`benchmark_pmid_sets/`](benchmark_pmid_sets/) |
| (iv) Manual-audit and screening-assessment annotations, with the scripts used to analyse them | [`revisions/`](revisions/) |
| (v) Source code of the pipeline and the website | [`pipeline/`](pipeline/), [`website/`](website/) |
| Raw LLM extraction output (Qwen3-30B-A3B), for re-analysis | [`llm_extractions/`](llm_extractions/) |
| Comparison of ResLit with CARD, ResFinder and the NCBI Reference Gene Catalog (manuscript figures) | [`comparison_with_other_databases/`](comparison_with_other_databases/) |

## Folders

- **`data_tables/`**: the gene and mutation tables as served by reslit.info (all sources), one row per entry × source database × paper, with validation tier, PMID and publication type.
- **`pmid_lists/`**: one file per pipeline stage, one PMID per line. Counts and provenance in its README.
- **`llm_extractions/`**: the six raw extraction batches (`extraction_summary_batch1-6.json`), one record per processed paper with the model's full structured output.
- **`benchmark_pmid_sets/`**: the PMIDs of the human audit (50), the screening validation (200), the reference-database benchmark (100), and the reference-database seed lists used to test the screening step.
- **`revisions/`**: the analyses added in the revision. Each folder has its own README and runs from this archive:
  - `human_audit/`: blind annotation of 50 papers by two annotators; precision, recall, field agreement.
  - `validation_screening/`: manual check of 200 BioMistral screening decisions.
  - `reference_benchmark/`: ResLit vs CARD / ResFinder / NCBI RGC on 100 papers they cite.
  - `review_impact/`: effect of review articles on the evidence tiers.
  - `sensitivity_analysis_threshold_supported/`: sensitivity of the Supported tier to its publication threshold.
  - `paper_type/`: publication type (Review / Research Article) of every PMID, from PubMed.
- **`pipeline/`**: stages 1–6 of the extraction pipeline (search, screening, retrieval, LLM extraction, harmonisation) and the final tables.
- **`website/`**: the Next.js application behind reslit.info; `website/scripts/seed-data/` holds the four tables it is built from.

## Requirements

The analysis scripts need Python 3 with `pandas` and `openpyxl` (tested with Python 3.8.10, pandas 1.4.3, openpyxl 3.1.5); the sensitivity analysis also needs `matplotlib`. Run each script from its own folder; every path is relative to this archive.

## Notes

- **Not included:** full-text articles (licensing); the local PubMed abstract database `papers.sqlite` (1.4 GB; the 200 validation abstracts are in `revisions/validation_screening/validation_200.csv`); NCBI's `PMC-ids.csv` (download from https://ftp.ncbi.nlm.nih.gov/pub/pmc/PMC-ids.csv.gz); the website's SQLite database (built from `website/scripts/seed-data/` by `website/scripts/seed-sqlite.mjs`).
- **Processed-paper count:** the extraction batches hold 117,112 records, of which two are not papers (`10103189 copy`, a duplicate of 10103189, and `papers_downloaded`). The raw files are unchanged; `pmid_lists/04_fulltext_llm_processed.txt` lists the 117,110 PMIDs.
