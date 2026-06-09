# PubMed Full-Text Download Pipeline

Retrieves full-text articles for a PMID list and produces a verified, deduplicated corpus ready for downstream LLM/RAG workflows.

---

## Quick start

```bash
# 1. Set up API keys
cp apikey.env.example apikey.env
# Edit apikey.env and fill in your keys (see API Keys section below)

# 2. Run the full pipeline
python3 run_pipeline.py \
    --pmid-file my_pmids.txt \
    --out-dir   my_run \
    --skip-raw
```

Results appear in `my_run_merged/fulltext_txt/`.

---

## API keys

The scripts load `apikey.env` automatically at startup. Copy the template and fill in your credentials before running anything.

```
NCBI_KEY=your_ncbi_api_key
ELSEVIER_KEY=your_elsevier_api_key
WILEY_KEY=your_wiley_tdm_token
SPRINGER_KEY=your_springer_api_key
```

| Key | How to get | Required |
|---|---|---|
| `NCBI_KEY` | Free at https://www.ncbi.nlm.nih.gov/account/ — raises rate limit from 3 to 10 req/s | Strongly recommended |
| `ELSEVIER_KEY` | https://dev.elsevier.com/ | For Elsevier articles |
| `WILEY_KEY` | Via institutional TDM agreement | For Wiley PDFs |
| `SPRINGER_KEY` | https://dev.springernature.com/ | For Springer articles |

> `apikey.env` is git-ignored and must never be committed.

---

## Pipeline overview

The pipeline runs in three sequential stages:

```
PMID list
    │
    ▼ ── Stage 1: OA download ──────────────────────────────────────────
    │  05_run_oa_in_chunks.py  (splits list into chunks)
    │      └─ calls 01_download_oa.py for each chunk
    │
    │  Routes tried per PMID (highest quality first):
    │    PMC Bulk XML → EuropePMC XML → PMC EFetch → OA HTML → Publisher HTML → PubMed BioC
    │
    │  Output:  <out-dir>/oa/txt/            one .txt per PMID
    │           <out-dir>/chunk_logs/needs_api_pmids.txt   (OA failures + BioC-only)
    │
    ▼ ── Stage 2: API download ─────────────────────────────────────────
    │  06_run_api_in_chunks.py  (splits needs_api_pmids.txt into chunks)
    │      └─ calls 02_download_api_key_articles.py for each chunk
    │
    │  Routes tried per PMID (highest quality first):
    │    PMC EFetch → EuropePMC → Elsevier → Wiley TDM PDF → Publisher HTML → PubMed BioC
    │
    │  Output:  <out-dir>/api/txt/           one .txt per PMID
    │
    ▼ ── Stage 3: Merge & filter ────────────────────────────────────────
       merge_and_filter.py
           Deduplicate: same PMID in OA + API → keep highest-quality source
           Classify:    body word count ≥ 500 and real body sections present → full text
                        otherwise → abstract-only / rejected

       Output:  <out-dir>_merged/fulltext_txt/    verified full text
                <out-dir>_merged/abstract_txt/    abstract-only / rejected
                <out-dir>_merged/reports/         JSON summary + JSONL manifest
```

Source priority for deduplication (highest → lowest):
`PMC_OA_Bulk_XML` > `EuropePMC_FullText_XML` > `PMC_EFetch_XML` > `PMC_OA_BioC` > `Elsevier_Candidate_XML` > `Elsevier_Candidate_Text` > `OA_HTML` > `Publisher_HTML` > `Publisher_PDF` > `PubMed_BioC`

---

## Running the pipeline

### Option A — one command (recommended)

`run_pipeline.py` orchestrates all three stages automatically.

```bash
python3 run_pipeline.py \
    --pmid-file my_pmids.txt \
    --out-dir   my_run \
    --chunk-size 500 \
    --skip-raw
```

| Flag | Default | Description |
|---|---|---|
| `--pmid-file` | required | Plain-text file, one PMID per line |
| `--out-dir` | required | Root output directory (created if absent) |
| `--chunk-size` | 500 | PMIDs per chunk for OA and API phases |
| `--min-words` | 500 | Body word count threshold for full-text classification |
| `--skip-raw` | off | Do not save raw HTML/XML (saves disk space; recommended for bulk runs) |
| `--skip-oa` | off | Skip OA phase (if already completed) |
| `--skip-api` | off | Skip API phase |
| `--skip-merge` | off | Skip merge step |

Resume a partially completed run by skipping finished stages:

```bash
# OA already done, continue from API
python3 run_pipeline.py --pmid-file my_pmids.txt --out-dir my_run --skip-oa

# OA + API done, only re-run merge
python3 run_pipeline.py --pmid-file my_pmids.txt --out-dir my_run --skip-oa --skip-api
```

### Option B — step by step

Run each stage manually for more control (e.g. parallel splits for large PMID lists).

**Stage 1 — OA download**

```bash
python3 05_run_oa_in_chunks.py \
    --pmid-file my_pmids.txt \
    --out-dir   my_run \
    --chunk-size 500 \
    --skip-raw
```

**Stage 2 — API download**

```bash
python3 06_run_api_in_chunks.py \
    --pmid-file my_run/chunk_logs/needs_api_pmids.txt \
    --out-dir   my_run \
    --chunk-size 500
```

**Stage 3 — Merge & filter**

```bash
# Single run (shorthand)
python3 merge_and_filter.py \
    --base-dir my_run \
    --out-dir  my_run_merged

# Multiple parallel splits merged together
python3 merge_and_filter.py \
    --oa-dirs  run_p1/oa/txt run_p2/oa/txt \
    --api-dirs run_p1/api/txt run_p2/api/txt \
    --out-dir  my_merged
```

---

## Script reference

### Core pipeline

| Script | Role |
|---|---|
| `run_pipeline.py` | End-to-end orchestrator — calls 05, 06, and merge in sequence |
| `05_run_oa_in_chunks.py` | Splits PMID list into chunks; calls `01_download_oa.py` per chunk |
| `06_run_api_in_chunks.py` | Splits retry list into chunks; calls `02_download_api_key_articles.py` per chunk |
| `merge_and_filter.py` | Deduplicates OA + API results; classifies and copies verified full text |

### Low-level downloaders

Called internally by `05` and `06`. Use directly only for small one-off batches (e.g. a few hundred PMIDs with no chunking needed).

| Script | Role |
|---|---|
| `01_download_oa.py` | OA download for a single PMID batch |
| `02_download_api_key_articles.py` | API download for a single PMID batch |

### Utility scripts

| Script | When to use |
|---|---|
| `03_report_failures.py` | After a run — generates detailed failure reports (which PMIDs failed, why, which publishers blocked access) |
| `04_filter_fulltext.py` | Re-applies full-text classification to an existing output directory without re-downloading; useful for auditing or adjusting thresholds |

---

## Output layout

```
<out-dir>/
    oa/txt/              OA downloads — one .txt per PMID
    api/txt/             API downloads — one .txt per PMID
    chunk_logs/
        needs_api_pmids.txt    PMIDs for API retry (OA failures + BioC-only)
        chunk_run_manifest.json
    chunk_inputs/        per-chunk PMID files
    runs/                JSONL result logs per chunk

<out-dir>_merged/
    fulltext_txt/        verified full text
    abstract_txt/        abstract-only / rejected
    reports/
        merge_filter_summary.json     overall counts by source and rejection reason
        fulltext_manifest.jsonl       one record per verified full-text file
```

Each `.txt` file follows this format:

```
PMID: 12345678
PMCID: PMC123456
DOI: 10.1234/example
Title: ...
Journal: ...
Source: PMC_OA_Bulk_XML
License: ...

## Introduction
...

## Methods
...

## Results
...
```

---

## Notes

- **Bulk runs**: always use `--skip-raw` to avoid saving intermediate HTML/XML and filling disk.
- **Large PMID lists (>10k)**: run multiple OA and API jobs in parallel on PMID splits, then point `merge_and_filter.py` at all output directories using `--oa-dirs` and `--api-dirs`.
- **Rate limits**: with many parallel jobs, NCBI esummary/idconv endpoints may return 429. The scripts retry automatically with exponential backoff (up to 5 attempts). An NCBI API key is strongly recommended.
- **Publisher restrictions**: OUP, SAGE, and ACS require separate institutional or project-specific access agreements and are not covered by the default routes.
