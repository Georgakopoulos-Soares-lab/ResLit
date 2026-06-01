# PubMed Full-Text Download Pipeline

Retrieves full-text articles for a PMID list and produces a verified, deduplicated corpus ready for downstream LLM/RAG workflows.

## Quick start

```bash
# Copy and fill in your API keys
cp apikey.env.example apikey.env

# Run the full pipeline on your PMID list
python3 run_pipeline.py \
    --pmid-file my_pmids.txt \
    --out-dir   my_run \
    --skip-raw
```

Results appear in `my_run_merged/fulltext_txt/`.

## Pipeline overview

```
PMID list
    │
    ▼  05_run_oa_in_chunks.py  →  01_download_oa.py (per chunk)
    │       OA routes: PMC Bulk XML → EuropePMC → PMC EFetch → OA HTML → Publisher HTML → PubMed BioC
    │       Output: <out-dir>/oa/txt/
    │
    ▼  06_run_api_in_chunks.py  →  02_download_api_key_articles.py (per chunk)
    │       API routes: PMC EFetch → EuropePMC → Elsevier → Wiley TDM → Publisher HTML → PubMed BioC
    │       Input:  <out-dir>/chunk_logs/needs_api_pmids.txt  (OA failures + BioC-only)
    │       Output: <out-dir>/api/txt/
    │
    ▼  merge_and_filter.py
            Deduplicate by PMID (highest-quality source wins)
            Classify: body word count ≥ 500, real sections present
            Output: <out-dir>_merged/fulltext_txt/   (verified full text)
                    <out-dir>_merged/abstract_txt/   (abstract-only / rejected)
                    <out-dir>_merged/reports/        (JSON summary + JSONL manifest)
```

## Scripts

### `run_pipeline.py` — end-to-end orchestrator

```bash
python3 run_pipeline.py \
    --pmid-file my_pmids.txt \
    --out-dir   my_run \
    --chunk-size 500 \
    --skip-raw

# Skip phases already completed
python3 run_pipeline.py --pmid-file my_pmids.txt --out-dir my_run --skip-oa
python3 run_pipeline.py --pmid-file my_pmids.txt --out-dir my_run --skip-api
```

| Flag | Default | Description |
|---|---|---|
| `--pmid-file` | required | One PMID per line |
| `--out-dir` | required | Root output directory |
| `--chunk-size` | 500 | PMIDs per chunk |
| `--min-words` | 500 | Body word threshold for full-text classification |
| `--skip-raw` | off | Skip saving raw HTML/XML (saves disk space) |
| `--skip-oa` | off | Skip OA phase |
| `--skip-api` | off | Skip API phase |
| `--skip-merge` | off | Skip merge step |

---

### `05_run_oa_in_chunks.py` — chunked OA downloader

Splits the PMID file into chunks and calls `01_download_oa.py` per chunk sequentially. Produces `chunk_logs/needs_api_pmids.txt` listing PMIDs that failed OA or returned BioC-only (abstract).

```bash
python3 05_run_oa_in_chunks.py \
    --pmid-file my_pmids.txt \
    --out-dir   my_run \
    --chunk-size 500 \
    --skip-raw
```

---

### `06_run_api_in_chunks.py` — chunked API downloader

Splits the API retry PMID list and calls `02_download_api_key_articles.py` per chunk.

```bash
python3 06_run_api_in_chunks.py \
    --pmid-file my_run/chunk_logs/needs_api_pmids.txt \
    --out-dir   my_run \
    --chunk-size 500
```

---

### `merge_and_filter.py` — deduplication and full-text classification

Takes one or more OA/API output directories, deduplicates by PMID (highest-quality source wins), and classifies each file as verified full text or abstract-only.

```bash
# Single run (shorthand)
python3 merge_and_filter.py \
    --base-dir my_run \
    --out-dir  my_run_merged

# Multiple source directories
python3 merge_and_filter.py \
    --oa-dirs  run_p1/oa/txt run_p2/oa/txt \
    --api-dirs run_p1/api/txt run_p2/api/txt \
    --out-dir  my_merged
```

Source priority (highest → lowest):
`PMC_OA_Bulk_XML` > `EuropePMC_FullText_XML` > `PMC_EFetch_XML` > `PMC_OA_BioC` > `Elsevier_Candidate_XML` > `Elsevier_Candidate_Text` > `OA_HTML` > `Publisher_HTML` > `Publisher_PDF` > `PubMed_BioC`

---

### `01_download_oa.py` — OA downloader (single batch)

```bash
python3 01_download_oa.py \
    --pmid-file my_pmids.txt \
    --out-dir   my_run \
    --skip-raw
```

---

### `02_download_api_key_articles.py` — API downloader (single batch)

```bash
python3 02_download_api_key_articles.py \
    --pmid-file my_run/chunk_logs/needs_api_pmids.txt \
    --out-dir   my_run
```

---

### `03_report_failures.py` — failure reporting

Builds consolidated failure and coverage reports from OA/API run JSONLs.

```bash
python3 03_report_failures.py --out-dir my_run
```

---

### `04_filter_fulltext.py` — standalone full-text filter

Re-applies body-content filtering to an existing output directory without re-downloading.

```bash
python3 04_filter_fulltext.py --out-dir my_run
```

## Output layout

```
<out-dir>/
    oa/txt/              raw OA downloads (one .txt per PMID)
    api/txt/             raw API downloads
    chunk_logs/          per-chunk manifests + needs_api_pmids.txt
    chunk_inputs/        per-chunk PMID files
    runs/                JSONL result logs

<out-dir>_merged/
    fulltext_txt/        verified full text
    abstract_txt/        abstract-only / rejected
    reports/
        merge_filter_summary.json
        fulltext_manifest.jsonl
```

## API keys

Copy `apikey.env.example` to `apikey.env` and fill in your keys. The scripts load it automatically.

```
NCBI_KEY=your_ncbi_api_key
ELSEVIER_KEY=your_elsevier_api_key
WILEY_KEY=your_wiley_tdm_token
SPRINGER_KEY=your_springer_api_key
```

- **NCBI key**: free at https://www.ncbi.nlm.nih.gov/account/ — raises rate limit from 3 to 10 req/s
- **Elsevier key**: https://dev.elsevier.com/
- **Wiley TDM token**: via institutional TDM agreement
- **Springer key**: https://dev.springernature.com/

> `apikey.env` is git-ignored and must never be committed.

## Notes

- Use `--skip-raw` for bulk runs to avoid filling disk with intermediate HTML/XML files.
- For large PMID lists (>10k), run OA and API phases in parallel splits and point `merge_and_filter.py` at all output directories.
- OUP, SAGE, and ACS require separate institutional or project-specific access agreements and are not covered by the default routes.
