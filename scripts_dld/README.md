# PubMed Article Retrieval Pipeline

## Overview

This pipeline retrieves article full text starting from a PMID list and stores results in a format suitable for downstream LLM/RAG workflows.

The pipeline prefers:

1. Open/full-text sources (PMC OA)
2. Publisher APIs (Elsevier, Wiley TDM, Springer)
3. Structured abstract fallback when full text is unavailable

## Scripts

### `pubmed_common.py`

Shared library used by all three pipeline scripts. Contains HTTP client, API wrappers, rate limiting, and text formatting utilities. Required dependency.

### `01_download_oa.py`

Retrieves full text via PMC Open Access routes:

- PMID → PMCID conversion
- PMC OA subset download
- PMC EFetch fallback for free-to-read articles not in OA subset

```bash
python3 01_download_oa.py --pmid-file amr_genes_pmids_amrprofiler_uniq.txt --out-dir outputs
```

Outputs:

- `outputs/oa/raw/` — raw XML
- `outputs/oa/meta/` — per-article JSON metadata
- `outputs/oa/txt/` — LLM-ready text files
- `outputs/runs/oa_results.jsonl` — run manifest

### `02_download_api_key_articles.py`

Handles PMIDs not resolved by stage 1, using publisher APIs:

- PMC EFetch (when PMCID exists)
- Crossref / Unpaywall / OpenAlex / Europe PMC enrichment
- Publisher HTML retrieval
- Elsevier XML/text API
- Wiley TDM PDF API
- PubMed BioC abstract fallback

```bash
python3 02_download_api_key_articles.py --pmid-file amr_genes_pmids_amrprofiler_uniq.txt --out-dir outputs
```

Outputs:

- `outputs/api/raw/` — raw PDF/XML/HTML
- `outputs/api/meta/` — per-article JSON metadata
- `outputs/api/txt/` — LLM-ready text files
- `outputs/runs/api_results.jsonl` — run manifest

### `03_report_failures.py`

Analyzes results from stages 1 and 2 and builds the reporting bundle:

- Classifies remaining abstract-only records by publisher and access route
- Writes failure summaries, follow-up candidate lists, and next-step TSV

```bash
python3 03_report_failures.py --out-dir outputs
```

Outputs:

- `outputs/reports/failure_report.json`
- `outputs/reports/failure_report.md`
- `outputs/reports/abstract_followups.jsonl`
- `outputs/reports/tdm_candidates_manifest.jsonl`
- `outputs/reports/REPORT_SUMMARY.md`
- `outputs/reports/NEXT_STEPS.tsv`
- `outputs/reports/abstract_only_pmids.txt`

## Inputs

### PMID list

```
amr_genes_pmids_amrprofiler_uniq.txt
```

### API keys (`apikey.env`)

Create an `apikey.env` file in the working directory:

```bash
NCBI_EMAIL=your_email@domain.edu
NCBI_API_KEY=...
ELSEVIER_API_KEY=...
WILEY_API_KEY=...
SPRINGER_API_KEY=...
```

The scripts auto-load this file at startup. Do not commit this file to version control.

## Output structure

```
outputs/
  oa/          # Stage 1 results
  api/         # Stage 2 results
  reports/     # Stage 3 reports
  runs/        # JSONL run manifests
  fulltext_txt/   # Symlinks to all full-text .txt files
  abstract_txt/   # Symlinks to all abstract-only .txt files
```

## LLM-ready text format

Each `.txt` file contains a metadata header followed by section blocks:

```
PMID: ...
DOI: ...
Title: ...
Journal: ...
...

## ABSTRACT
...

## METHODS
...

## RESULTS
...
```

## Current corpus status

- Valid PMIDs: `2628`
- Full-text articles: `1982`
- Abstract-only articles: `641`
- Failed: `5`

Remaining abstract-only articles by publisher:

| Publisher | Count | Notes |
|-----------|-------|-------|
| OUP | 285 | Requires institutional TDM access |
| Unknown | 134 | Missing DOI or small publishers |
| Wiley | 116 | Requires institutional Wiley TDM token |
| ASM | 50 | Requires institutional access |
| SAGE | 45 | Requires institutional access |
| ACS | 11 | Requires institutional access |
