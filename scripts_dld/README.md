# PubMed Article Retrieval Pipeline

## Overview

This project retrieves article content from a PMID list and stores it in a layout that is convenient for downstream LLM/RAG workflows.

The retrieval strategy is:

1. prefer open/full-text sources
2. use official or machine-usable publisher/API routes when possible
3. fall back to structured abstract text when full text is not currently usable

The repository currently contains two output roots:

- `outputs/`: older run artifacts retained for reference
- `outputs_v2/`: current working corpus and reports

For any current counts or downstream use, treat `outputs_v2/` as the authoritative result root.

## Current status

Current `outputs_v2/` corpus totals:

- Valid PMIDs: `2627`
- Full-text retrieved before text validation: `1787`
- Abstract-only: `839`
- Failed: `1`

Current validated text corpus:

- Verified full-text after body filtering: `1596`
- Retrieved full-text entries filtered out as non-body/preview/PDF-placeholder text: `192`
- Abstract-only `.txt` files remain separate and should not be merged into the verified full-text corpus

Important interpretation:

- `1787` means the pipeline found some nominal full-text route
- `1596` is the stricter, LLM-ready text set after filtering out preview pages, placeholder pages, and PDF-note-only outputs

## Main scripts

### `01_download_oa.py`

Purpose:

- retrieve PMC/OA full text first

Run:

```bash
python3 01_download_oa.py --pmid-file amr_genes_pmids_amrprofiler_uniq.txt --out-dir outputs_v2
```

Outputs:

- `outputs_v2/oa/raw/`
- `outputs_v2/oa/meta/`
- `outputs_v2/oa/txt/`
- `outputs_v2/runs/oa_results.jsonl`

### `02_download_api_key_articles.py`

Purpose:

- retrieve fallback content for PMIDs not solved by stage 1

Main routes:

- PMC EFetch when PMCID exists
- Crossref enrichment
- Unpaywall / OpenAlex / Europe PMC candidate enrichment
- publisher HTML retrieval where possible
- Elsevier candidate XML / text retrieval
- Wiley TDM PDF retrieval where available
- PubMed BioC abstract fallback

Run:

```bash
python3 02_download_api_key_articles.py --pmid-file amr_genes_pmids_amrprofiler_uniq.txt --out-dir outputs_v2
```

Outputs:

- `outputs_v2/api/raw/`
- `outputs_v2/api/meta/`
- `outputs_v2/api/txt/`
- `outputs_v2/runs/api_results.jsonl`

### `03_report_failures.py`

Purpose:

- build consolidated reporting from OA/API runs

Run:

```bash
python3 03_report_failures.py --out-dir outputs_v2
```

Outputs:

- `outputs_v2/reports/failure_report.json`
- `outputs_v2/reports/failure_report.md`
- `outputs_v2/reports/abstract_followups.jsonl`
- `outputs_v2/reports/abstract_followups_summary.json`
- `outputs_v2/reports/tdm_candidates_manifest.jsonl`
- `outputs_v2/reports/tdm_candidates_summary.json`
- `outputs_v2/reports/api_attempt_manifest.jsonl`
- `outputs_v2/reports/api_monitoring_summary.json`
- `outputs_v2/reports/candidate_host_summary.json`
- `outputs_v2/reports/REPORT_SUMMARY.md`
- `outputs_v2/reports/RESOLUTION_GUIDE.md`
- `outputs_v2/reports/NEXT_STEPS.tsv`
- `outputs_v2/reports/abstract_only_pmids.txt`

### `04_filter_fulltext.py`

Purpose:

- separate downloaded `.txt` files into verified full-text vs abstract-only based on actual body content

Run:

```bash
python3 04_filter_fulltext.py --out-dir outputs_v2
```

Outputs:

- `outputs_v2/fulltext_txt/`
- `outputs_v2/abstract_txt/`
- `outputs_v2/reports/txt_filter_summary.json`
- `outputs_v2/reports/txt_filter_manifest.jsonl`

Related validation artifacts already present in `outputs_v2/reports/`:

- `fulltext_body_filter_summary.json`
- `fulltext_filtered_no_body.tsv`

The current validator is strict by design. It treats publisher preview pages,
PMC PDF placeholder pages, and archived PDF-note stubs as non-body outputs even
if they were previously counted as nominal full text.

## Recommended workflow

For a fresh run, use the project as a 3-step pipeline:

1. `01_download_oa.py`
2. `02_download_api_key_articles.py`
3. `03_report_failures.py`

`01` and `02` now apply strict full-text acceptance during extraction, so
preview shells and non-body captures are filtered much earlier.

`04_filter_fulltext.py` remains available as a compatibility/recheck tool when
you want to audit or rebuild the strict text split from existing outputs.

If you only need the current finished corpus, start from `outputs_v2/`.

## Session handoff workflow

To make the next session resumable, generate a structured handoff log before stopping work.

Recommended one-command closeout:

```bash
python3 08_close_session.py \
  --out-dir outputs_v2 \
  --label end_of_day \
  --summary "short description of what changed" \
  --completed "what was finished" \
  --decision "important conclusion or scope change" \
  --next "first concrete task for the next session" \
  --blocker "optional blocker" \
  --note "optional context worth preserving"
```

What it does:

1. refreshes `03_report_failures.py`
2. refreshes `04_filter_fulltext.py` when you want an explicit post-run audit
3. generates a structured handoff log with `07_generate_session_log.py`

If you already know the reports and filters are current, use the faster variant:

```bash
python3 08_close_session.py \
  --out-dir outputs_v2 \
  --skip-reports \
  --skip-filter \
  --label end_of_day \
  --summary "short description of what changed" \
  --completed "what was finished" \
  --decision "important conclusion or scope change" \
  --next "first concrete task for the next session" \
  --blocker "optional blocker" \
  --note "optional context worth preserving"
```

Generated artifacts:

- `session_logs/session_*.md`: human-readable handoff log
- `session_logs/session_*.json`: machine-readable snapshot with the same content
- `session_logs/latest.md`: pointer to the newest handoff
- `session_logs/latest.json`: newest handoff as JSON
- `session_logs/INDEX.md`: reverse-chronological log index

The script automatically records:

- current output root
- current report/filter artifact timestamps
- retrieval-level counts
- validated full-text counts
- top remaining abstract-only route buckets
- top backend error buckets

At the start of the next session, read:

1. `session_logs/latest.md`
2. `outputs_v2/reports/REPORT_SUMMARY.md`
3. `outputs_v2/reports/RESOLUTION_GUIDE.md`

## Inputs and configuration

Primary PMID list:

- `amr_genes_pmids_amrprofiler_uniq.txt`

The scripts auto-load `apikey.env`.

Supported environment keys:

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

## Current result roots

### Primary working root

- `outputs_v2/oa/`
- `outputs_v2/api/`
- `outputs_v2/runs/`
- `outputs_v2/reports/`
- `outputs_v2/fulltext_txt/`
- `outputs_v2/abstract_txt/`

### Most important manifests

- `outputs_v2/runs/oa_results.jsonl`
- `outputs_v2/runs/api_results.jsonl`
- `outputs_v2/reports/REPORT_SUMMARY.md`
- `outputs_v2/reports/RESOLUTION_GUIDE.md`
- `outputs_v2/reports/NEXT_STEPS.tsv`
- `outputs_v2/reports/txt_filter_summary.json`
- `outputs_v2/reports/fulltext_body_filter_summary.json`

## Interpreting the remaining abstract-only set

The remaining abstract-only records are not one homogeneous failure bucket.

Current high-level groups in `outputs_v2`:

- `manual_review`: `391`
- `institution_tdm_or_subscription`: `274`
- `wiley_tdm_or_pdf`: `118`
- `subscription_tdm_via_crossref`: `45`
- `institution_or_commercial_tdm`: `11`

Current remaining publisher families:

- `Unclassified`: `391`
- `OUP`: `274`
- `Wiley`: `118`
- `SAGE`: `45`
- `ACS`: `11`

## Recommended use

If the goal is an LLM-ready corpus:

1. use `outputs_v2/fulltext_txt/` as the primary text corpus
2. keep `outputs_v2/abstract_txt/` separate as secondary evidence
3. use `outputs_v2/api/raw/` and `outputs_v2/oa/raw/` when original XML/PDF/HTML is needed
4. use the JSON/JSONL reports in `outputs_v2/reports/` for filtering, auditing, and follow-up planning

## Project logs

- `STATUS_LOG_2026-04-15.md`: earlier milestone snapshot
- `STATUS_LOG_2026-04-20.md`: current `outputs_v2` and validated-text snapshot
