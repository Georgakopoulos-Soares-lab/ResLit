# PubMed Article Retrieval Pipeline

## Overview

This project retrieves article content starting from a PMID list and stores the results in a format that is convenient for downstream LLM/RAG workflows.

The pipeline prefers:

1. open/full-text sources
2. official or machine-usable publisher/API routes
3. structured abstract fallback when full text is not currently available

The output is intentionally separated into:

- full-text text files
- abstract-only text files
- raw files such as PDF, XML, and HTML
- JSONL manifests and reports for downstream analysis

## Current status

Current corpus totals:

- Valid PMIDs: `2628`
- Full-text articles retrieved: `1982`
- Abstract-only articles: `641`
- Failed records: `5`

Current text split:

- Full-text `.txt` files: `1957`
- Abstract-only `.txt` files: `641`

Important note:

- `Wiley_TDM_PDF` records are counted as full-text articles, but they do not currently contribute to the `.txt` full-text set unless text extraction is added later.

## Directory structure

Top-level retained files:

- `amr_genes_pmids_amrprofiler_uniq.txt`
- `apikey.env`
- `pubmed_common.py`
- `01_download_oa.py`
- `02_download_api_key_articles.py`
- `03_report_failures.py`
- `05_download_institution_gated.py` (experimental, not part of the normal workflow)
- `STATUS_LOG_2026-04-15.md`
- `README.md`
- `outputs/`

Legacy compatibility wrappers still exist in the directory:

- `04_report_abstract_followups.py`
- `06_prepare_tdm_manifests.py`

They forward to `03_report_failures.py` and do not need to be used directly.

Temporary `tmp_*` files and directories are not part of the retained workflow.

## Inputs

### PMID input

Primary PMID list:

- `amr_genes_pmids_amrprofiler_uniq.txt`

### Environment and API keys

The scripts auto-load `apikey.env`.

Supported configuration values:

- `NCBI_EMAIL`
- `NCBI_TOOL`
- `NCBI_API_KEY` or `NCBI_KEY`
- `ELSEVIER_API_KEY` or `ELSEVIER_KEY`
- `SPRINGER_API_KEY` or `SPRINGER_KEY`
- `WILEY_API_KEY` or `WILEY_KEY`

Example:

```bash
NCBI_EMAIL=your_email@domain.edu
NCBI_API_KEY=...
ELSEVIER_API_KEY=...
WILEY_API_KEY=...
```

## Recommended workflow

In normal use, the project should be treated as a 3-step pipeline:

1. `01_download_oa.py`
2. `02_download_api_key_articles.py`
3. `03_report_failures.py`

`05_download_institution_gated.py` is optional and experimental.

## Pipeline logic

The workflow is a waterfall.

### Stage 1: open/full-text first

`01_download_oa.py` handles PMC and OA-friendly retrieval:

- PMID -> PMCID
- PMC OA subset
- PMC EFetch fallback for PMC free-to-read articles not in the OA subset

This is the cleanest and most LLM-friendly source of article text.

### Stage 2: API-backed and publisher-backed fallback

`02_download_api_key_articles.py` handles PMIDs not solved by stage 1:

- PMC EFetch when PMCID exists
- Crossref enrichment
- Unpaywall / OpenAlex / Europe PMC candidate enrichment
- publisher HTML retrieval where possible
- Elsevier candidate XML / text retrieval
- Wiley TDM PDF retrieval where available
- PubMed BioC abstract fallback

### Stage 3: reporting and follow-up classification

`03_report_failures.py` now builds the full reporting bundle in one step. It analyzes the remaining abstract-only records and writes:

- failure summaries
- abstract follow-up candidates
- TDM/API-oriented next-step groups
- a readable markdown summary
- a compact next-step TSV

## Main scripts

### `01_download_oa.py`

Purpose:

- Retrieve PMC/OA full text first.

Run:

```bash
python3 01_download_oa.py --pmid-file amr_genes_pmids_amrprofiler_uniq.txt --out-dir outputs
```

Outputs:

- `outputs/oa/raw/`
- `outputs/oa/meta/`
- `outputs/oa/txt/`
- `outputs/runs/oa_results.jsonl`

### `02_download_api_key_articles.py`

Purpose:

- Retrieve fallback content for PMIDs not solved by stage 1.

Run:

```bash
python3 02_download_api_key_articles.py --pmid-file amr_genes_pmids_amrprofiler_uniq.txt --out-dir outputs
```

Outputs:

- `outputs/api/raw/`
- `outputs/api/meta/`
- `outputs/api/txt/`
- `outputs/runs/api_results.jsonl`

### `03_report_failures.py`

Purpose:

- Build the consolidated reporting bundle.

Run:

```bash
python3 03_report_failures.py --out-dir outputs
```

Outputs:

- `outputs/reports/failure_report.json`
- `outputs/reports/failure_report.md`
- `outputs/reports/abstract_followups.jsonl`
- `outputs/reports/abstract_followups_summary.json`
- `outputs/reports/tdm_candidates_manifest.jsonl`
- `outputs/reports/tdm_candidates_summary.json`
- `outputs/reports/REPORT_SUMMARY.md`
- `outputs/reports/NEXT_STEPS.tsv`
- `outputs/reports/abstract_only_pmids.txt`

## Optional script

### `05_download_institution_gated.py`

Purpose:

- Try institution-authenticated browser retrieval for gated publisher pages.

Current status:

- Implemented
- Tested with persistent Chrome profile
- Browser path is currently blocked by human verification on key publisher sites
- Not recommended as the main current production route

Run:

```bash
python3 05_download_institution_gated.py --out-dir outputs --prepare-login
```

Outputs:

- `outputs/reports/institution_gated_manifest.jsonl`
- `outputs/institution/raw/`
- `outputs/institution/txt/`
- `outputs/institution/meta/`
- `outputs/runs/institution_results.jsonl`

## Legacy compatibility wrappers

### `04_report_abstract_followups.py` and `06_prepare_tdm_manifests.py`

These are now compatibility wrappers only.

They forward to `03_report_failures.py` so older commands still work, but they are no longer needed in the normal workflow.

## Main result directories

### Primary result roots

- `outputs/oa/`
- `outputs/api/`
- `outputs/reports/`
- `outputs/runs/`

### Most important run manifests

- `outputs/runs/oa_results.jsonl`
- `outputs/runs/api_results.jsonl`
- `outputs/runs/institution_results.jsonl`

### Full-text vs abstract-only text split

These two directories were created to make downstream use simpler:

- Full-text text files:
  - `outputs/fulltext_txt/`
- Abstract-only text files:
  - `outputs/abstract_txt/`

These are symlink-based convenience directories pointing to the retained source `.txt` files.

Supporting manifests:

- `outputs/reports/fulltext_txt_manifest.jsonl`
- `outputs/reports/abstract_txt_manifest.jsonl`
- `outputs/reports/txt_split_summary.json`

### Reports

- `outputs/reports/abstract_followups.jsonl`
- `outputs/reports/abstract_followups_summary.json`
- `outputs/reports/failure_report.json`
- `outputs/reports/failure_report.md`
- `outputs/reports/html_candidates_only.jsonl`
- `outputs/reports/html_candidates_hosts.json`
- `outputs/reports/pdf_candidates_only.jsonl`
- `outputs/reports/institution_gated_manifest.jsonl`
- `outputs/reports/tdm_candidates_manifest.jsonl`
- `outputs/reports/tdm_candidates_summary.json`

### Project log

- `STATUS_LOG_2026-04-15.md`

## Interpreting the remaining abstract-only set

The remaining abstract-only records are not a single failure type.

The most important remaining groups are:

- institution/subscription-gated publisher content
- Wiley legacy PDF-first candidates
- other PDF candidates
- small landing-page-only groups
- records with no clear full-text path

Current high-level TDM/API-oriented grouping:

- `institution_tdm_or_subscription`: mainly OUP
- `institution_access_review`: mainly ASM
- `subscription_tdm_via_crossref`: mainly SAGE
- `institution_or_commercial_tdm`: mainly ACS
- `wiley_tdm_or_pdf`
- `wiley_legacy_pdf`
- `manual_review`

## Recommended use

If your goal is to build an LLM-ready corpus:

1. Use `outputs/fulltext_txt/` as the primary text corpus.
2. Keep `outputs/abstract_txt/` separate and treat it as secondary evidence.
3. Use `outputs/api/raw/` and `outputs/oa/raw/` when you need original XML/PDF/HTML.
4. Use the JSONL manifests in `outputs/reports/` for filtering, sampling, or follow-up planning.

## LLM-friendly text format

The retained `.txt` files use a simple structure:

- metadata header:
  - PMID
  - PMCID
  - DOI
  - Title
  - Journal
  - PubDate
  - Authors
  - Source
  - License
- followed by section blocks such as:
  - `## ABSTRACT`
  - `## METHODS`
  - `## RESULTS`

This format is intended to make chunking and ingestion straightforward without reparsing XML or HTML.
