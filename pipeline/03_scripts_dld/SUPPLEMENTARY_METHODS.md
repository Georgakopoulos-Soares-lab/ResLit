# Supplementary Methods: Automated Full-Text Retrieval Pipeline for the Literature Corpus

## S1. Overview

To build the full-text corpus used for downstream large language model (LLM)–based extraction of antimicrobial resistance (AMR) gene and mutation information, we developed a custom Python 3 retrieval pipeline that converts a list of PubMed identifiers (PMIDs) into a deduplicated, quality-filtered set of plain-text articles suitable for retrieval-augmented generation (RAG) and LLM ingestion. The pipeline queries only open, publicly documented APIs and web endpoints (no institutional proxy, no third-party scraping service, no browser automation in the production path) and requires no paid subscription, although optional publisher API keys (Elsevier, Wiley, Springer) increase yield when available.

The pipeline is implemented as a set of standalone Python scripts under `scripts_dld/`, built entirely on the Python standard library (`urllib`, `xml.etree.ElementTree`, `html.parser`) with no external HTTP or scraping dependencies. It is organized as three sequential stages — (1) open-access (OA) retrieval, (2) API/publisher-mediated retrieval for records the OA stage could not resolve, and (3) merge, deduplication, and full-text validation — each of which is described in detail below.

## S2. Input

The pipeline takes a plain-text file of PubMed IDs (one per line) as its sole required input. IDs are validated as purely numeric and ≤8 digits (malformed lines are silently discarded), and duplicate IDs are collapsed on read. For the corpus reported here, the input list contained **2,627 valid, unique PMIDs**.

## S3. Pipeline architecture

```
PMID list
   │
   ▼ Stage 1 — Open-access retrieval  (05_run_oa_in_chunks.py → 01_download_oa.py)
   │   PMC OA bulk XML → PMC OA BioC → Europe PMC full-text XML →
   │   NCBI PMC EFetch XML → PMC article HTML → DOI-based OA discovery
   │
   ▼ Stage 2 — API / publisher-mediated retrieval (06_run_api_in_chunks.py → 02_download_api_key_articles.py)
   │   (run only on PMIDs the OA stage could not resolve to full text)
   │   PMC EFetch → Europe PMC → PMC HTML retry → publisher-specific HTML handlers →
   │   Elsevier candidate XML/text → Wiley TDM PDF → generic publisher PDF → PubMed BioC (abstract fallback)
   │
   ▼ Stage 3 — Merge, deduplication, and body validation (merge_and_filter.py, 04_filter_fulltext.py)
       Deduplicate by PMID (keep highest-priority source) → classify as full text vs. abstract-only
       using section-aware, publisher-aware heuristics → export verified corpus
```

An end-to-end orchestrator (`run_pipeline.py`) runs all three stages against a single output directory and supports resuming from any stage (`--skip-oa`, `--skip-api`, `--skip-merge`) so that partially completed large runs are not repeated. For PMID lists in the low thousands, `05_run_oa_in_chunks.py` and `06_run_api_in_chunks.py` split the input into fixed-size chunks (default 500 PMIDs), invoke the corresponding single-batch downloader as a subprocess per chunk, and persist a per-chunk JSONL result log plus an aggregate manifest, so that any interrupted run can be resumed at the chunk level without re-issuing requests for already-completed PMIDs (files with existing outputs are skipped unless `--force` is set).

## S4. Stage 1 — Open-access retrieval (`01_download_oa.py`)

For each PMID, article metadata (title, journal, authors, publication date, DOI) is first retrieved in batches of 200 via the NCBI E-utilities `esummary` endpoint, and PMCID mappings are resolved via the PMC ID Converter API. If a PMCID is available, six candidate retrieval routes are attempted **in strict priority order**, and the pipeline stops at the first route that yields a body of text (defined in §S6):

1. **PMC OA bulk archive.** The NCBI PMC Open Access bulk file list (`oa_file_list.csv`, fetched once and cached) is used to locate a `.tar.gz`/`.tgz` archive for the PMCID; the archive is downloaded, the `.nxml`/`.xml` member most likely to be the full JATS article is extracted, and its body is parsed. This is the highest-fidelity route because it returns the publisher's own structured XML.
2. **PMC OA subset → BioC.** The NCBI PMC OA web service (`oa.fcgi`) is queried for a direct OA record; if present, the corresponding article is fetched as BioC JSON and flattened into labeled sections.
3. **Europe PMC full-text XML.** Europe PMC frequently exposes full text for articles that are open-access but not part of NCBI's own OA subset (including some publisher-hosted OA content that NCBI EFetch blocks).
4. **NCBI PMC EFetch XML.** A direct JATS XML fetch via E-utilities `efetch`; accepted only if the returned `<body>` element is non-trivial (>200 characters), since publishers can return abstract-only stubs through this endpoint even when a PMCID exists.
5. **PMC article HTML.** As a last PMC-side fallback, the rendered PMC article HTML page is fetched and passed through a lightweight custom HTML-to-text extractor (built on `html.parser.HTMLParser`), then validated against the strict PMC HTML criteria in §S6 to reject PDF-viewer shell pages.
6. **DOI-based OA discovery.** For PMIDs without a usable PMCID, or where all PMC-side routes failed, the pipeline resolves the article's DOI via Crossref, enriches it with **Unpaywall** and **OpenAlex** OA location records and an **Europe PMC "core" search** (which occasionally surfaces a PMCID that NCBI's own ID converter missed), assembles a deduplicated candidate list of publisher landing pages and PDFs, and attempts to fetch and validate each landing-page URL as HTML. Journal-specific URL rewriting rules (e.g., Taylor & Francis `doi/abs/` → `doi/full/`, LWW `abstract/` → `fulltext/`) are applied before each attempt.

PMIDs that exhaust all six routes without producing a validated full-text body are recorded as failed, tagged with a `failure_category` (`pmc_abstract_only` vs. `no_pmcid_no_doi_oa`), and passed forward to Stage 2. PMIDs that succeed only via PubMed BioC (abstract/metadata) are likewise queued for Stage 2 rather than accepted at this point.

## S5. Stage 2 — API and publisher-mediated retrieval (`02_download_api_key_articles.py`)

Stage 2 processes only the PMIDs Stage 1 could not resolve to full text (`needs_api_pmids.txt` = OA failures ∪ BioC-only successes). It repeats the highest-value PMC/Europe PMC routes (in case of transient failure) and then works through a longer, publisher-aware cascade:

- **PMC EFetch** and **Europe PMC full-text XML** (retry).
- **PMC article HTML** (retry).
- **DOI/Crossref-based publisher HTML resolution**, extended beyond Stage 1 with explicit per-publisher URL construction and host allow-listing for Wiley, Oxford University Press (OUP), ASM, SAGE, ACS, Springer/Nature, PLOS, J-STAGE, RSC, Eurosurveillance, Cambridge, and Microbiology Society journals.
- **SAGE**, handled with a dedicated `CookieJar`-based session (bypassing the anonymous subscription redirect) and a rate limiter that mimics SAGE's published API policy (1 request/6 s on weekday mornings Pacific time, 1 request/2 s otherwise).
- **Springer Nature open-access API** (JATS XML) when a Springer API key is configured.
- **ASM (American Society for Microbiology) text-data-mining XML**, fetched from Crossref-declared TDM links or the canonical `/doi/xml/` endpoint.
- **Wiley Text and Data Mining (TDM) API**, which returns a PDF (not machine-readable text) when a Wiley TDM client token is configured; the PDF is archived and the companion `.txt` file records only header metadata plus the PubMed abstract, explicitly flagged (`RAW_PDF_NOTE`) as non-body content so it cannot be miscounted as full text downstream.
- **Elsevier Article API and "candidate" full-text endpoints**, keyed by API key; XML responses are checked for the presence of `<ce:sections>`/`<ce:para>`/`<body>` elements before acceptance, since Elsevier returns syntactically valid but metadata-only XML for entitlement-blocked articles.
- **Generic publisher PDF download**, restricted to an explicit allow-list of hosts (Springer, Nature, ASM, OUP, SAGE, ACS) and only accepted if the response begins with the `%PDF` magic bytes; abstract metadata is retained as a placeholder body exactly as in the Wiley TDM case.
- **PubMed BioC**, used as the terminal fallback that guarantees at least title/abstract/metadata is captured for every PMID with a DOI.

Every attempted backend and every backend-level error (with HTTP status code where available) is logged into the article's metadata record (`tried_backends`, `backend_errors`), and PMIDs that ultimately resolve only to PubMed BioC are automatically classified into an `abstract_only_reason` bucket (e.g., `publisher_gate`, `elsevier_candidate_only`, `wiley_legacy_pdf`, `candidate_html_and_pdf`, `no_candidate_found`) and a recommended follow-up route, to support prioritizing future access-expansion work rather than requiring manual triage of thousands of failure logs. Wiley records from articles published in or before 2005 are additionally flagged as `wiley_tdm_unavailable_old_article`, since Wiley TDM coverage for legacy content is inconsistent and these are routed to a separate PDF-first follow-up queue instead of being retried against the live TDM API.

### S5.1 Institution-authenticated access (evaluated, not used in production)

A separate script, `05_download_institution_gated.py` (browser-automation-based, using a persistent authenticated Chrome profile against UT Austin's institutional single sign-on) was developed and tested against the main OUP/ASM/SAGE/ACS access-gated backlog. In practice, target publisher pages consistently triggered human/bot-verification challenges under automated navigation, making the approach unreliable for unattended batch retrieval. This path was therefore **not used for the production corpus**; access-gated records were instead left labeled as access-constrained (see §S8) rather than pursued via browser automation or PDF scraping, consistent with the pipeline's policy of preferring native HTML/XML/text sources over PDF-to-text conversion.

## S6. Text normalization and full-text validation

### S6.1 Section extraction

Retrieved content is normalized into a common intermediate representation — a list of `{section, text}` records — via source-specific parsers:

- **BioC JSON** is flattened by walking `documents → passages`, using each passage's `section_type`/`type` annotation as the section label.
- **PMC/JATS XML** (from the OA bulk archive, PMC OA BioC record, Europe PMC, or NCBI EFetch) is parsed with `xml.etree.ElementTree`; the `<abstract>` is extracted first, then each `<body>//<sec>` is walked, using its `<title>` as the section heading.
- **Elsevier full-text XML** is parsed generically by local (namespace-stripped) tag name, walking `<originalText>` for `<abstract>` and `<body>` content and merging consecutive paragraphs under the same `<section-title>`.
- **HTML** (PMC rendered pages, publisher landing pages, SAGE session responses) is converted to text with a purpose-built `HTMLParser` subclass that inserts paragraph/block-level breaks, discards `<script>`/`<style>`/`<svg>` content, and HTML-unescapes the result.

Every output `.txt` file is written in a single normalized format (metadata header block, then `## SECTION_NAME` headings with body text), so that all downstream consumers — including the QWEN3-based extraction pipeline — see one consistent schema regardless of original source:

```
PMID: <pmid>
PMCID: <pmcid>
DOI: <doi>
Title: <title>
Journal: <journal>
PubDate: <date>
Authors: <author list>
Source: <retrieval route, e.g. PMC_OA_Bulk_XML>
License: <license/access label>

## INTRODUCTION
...
## METHODS
...
## RESULTS
...
```

### S6.2 Full-text vs. abstract-only classification

Because many retrieval routes can return syntactically successful but practically useless content — publisher "preview" pages, PDF-viewer shell pages, metadata-only XML, or PDF placeholder notes — the pipeline applies a **second, stricter validation pass** independent of retrieval success. This validation is source-aware:

- For structured XML sources (PMC OA bulk, PMC OA BioC, PMC EFetch, Europe PMC XML), a record is accepted only if at least one section is a genuine body section (not abstract/keywords/funding/acknowledgements/references/etc., per an explicit non-body section name-list) **and** the total body word count is ≥ a configurable threshold (default 500 words).
- For Elsevier XML, the raw XML must contain a `<ce:sections>`, `<ce:para>`, or `<body>` element (rejecting metadata-only API responses) in addition to the word-count check.
- For HTML-derived sources (PMC HTML, publisher HTML, Europe PMC HTML), heuristic detectors specifically identify and reject: PMC "page image" / PDF-viewer shells (`is_pmc_pdf_page`), publisher preview/loading shells (e.g., pages containing "full text loading..." or "article metrics loading"), and J-STAGE journal-overview pages that resemble but are not article text. Where recognized body-section headings (Introduction, Methods, Results, Discussion, etc.) are present, the word count between the Abstract heading and the next reference/metrics heading is used as the effective body length; where no such headings are found, a much higher word-count bar (≥1,800 or 2× the base threshold) is required before the page is trusted as core article text, since generic HTML lacking any recognizable section structure is disproportionately likely to be a truncated preview.
- Wiley TDM PDF and Europe PMC "available as PDF" placeholder records are always rejected as non-body, since only a PDF was archived and no text was extracted from it (the pipeline deliberately does not perform PDF-to-text extraction).

This validation logic is implemented twice — once inline during retrieval (`pubmed_common.is_valid_fulltext_content`, used to decide whether to keep searching for a better source) and once as an independent auditable post-hoc pass over the final `.txt` corpus (`04_filter_fulltext.py` / the equivalent logic embedded in `merge_and_filter.py`), so that the final corpus composition can be re-derived or re-thresholded from the raw downloaded files without re-running any network requests.

## S7. Merge, deduplication, and export (`merge_and_filter.py`)

Because Stage 1 and Stage 2 write to separate output trees (and because large runs may be split into parallel PMID partitions with independent OA/API directories), a final merge step deduplicates by PMID across all `oa/txt/` and `api/txt/` directories. When both an OA-stage and an API-stage file exist for the same PMID, the one from the higher-priority source wins, using the following source ranking (highest to lowest quality):

`PMC_OA_Bulk_XML` > `EuropePMC_FullText_XML` > `PMC_EFetch_XML` > `PMC_OA_BioC` > `Elsevier_Candidate_XML` > `Elsevier_Candidate_Text` > `OA_HTML` > `Publisher_HTML` > `Publisher_PDF` > `PubMed_BioC`

The winning file per PMID is then run through the same body-validation logic described in §S6.2, and copied into one of two final directories: `fulltext_txt/` (validated full text — the corpus used for downstream LLM extraction) or `abstract_txt/` (abstract-only or rejected). Machine-readable summaries (`merge_filter_summary.json`, `fulltext_manifest.jsonl`) and a set of human-readable reports (`REPORT_SUMMARY.md`, per-category failure and follow-up manifests, a resolution guide mapping each rejection/abstract-only reason to a suggested remediation) are written to `reports/` by a dedicated reporting script (`03_report_failures.py`).

## S8. Rate limiting and API etiquette

All outbound requests are mediated by a single rate limiter that enforces NCBI's documented guidance (3 requests/s without an API key, 10 requests/s with one — implemented as a fixed 0.11 s / 0.34 s minimum interval) and a source-specific override for SAGE matching their published access policy (§S5). NCBI `esummary` and ID-converter calls retry on HTTP 429 with exponential backoff (up to 5 attempts, starting at 60 s). A descriptive `User-Agent`, tool name, and contact email are sent with every NCBI request as required by E-utilities usage policy.

## S9. Reproducibility and configuration

Publisher API credentials (NCBI, Elsevier, Wiley TDM, Springer) are loaded at startup from a git-ignored `apikey.env` file (template provided as `apikey.env.example`); no credential is required for the core PMC/Europe PMC/Crossref/Unpaywall/OpenAlex routes, though an NCBI key is strongly recommended to raise the E-utilities rate limit. All intermediate artifacts (per-chunk JSONL result logs, per-PMID metadata JSON including the full list of attempted backends and their raw error messages, and, when `--skip-raw` is not set, the raw HTML/XML/PDF/archive payload for every successful retrieval) are retained, so that the entire classification of any given PMID can be audited or re-derived without re-issuing network requests. For large bulk runs, raw payload retention is disabled (`--skip-raw`) purely to bound disk usage; this does not affect the extracted `.txt`/`.json` outputs.

## S10. Final corpus composition

Of the 2,627 valid input PMIDs:

| Outcome | Count |
|---|---|
| Retrieval-level full text (any source, pre-validation) | 1,787 |
| **Verified full text (post body-validation) — used as LLM/RAG corpus** | **1,596** |
| Abstract-only | 839 |
| Failed (no DOI, PubMed BioC unavailable) | 1 |

**Verified full-text corpus by source:**

| Source | Records |
|---|---|
| Open-access publisher/PMC HTML (`OA_HTML`) | 1,145 |
| PMC Open Access bulk XML (`PMC_OA_Bulk_XML`) | 290 |
| Publisher HTML (non-PMC, `Publisher_HTML`) | 71 |
| Elsevier candidate XML (`Elsevier_Candidate_XML`) | 57 |
| NCBI PMC EFetch XML (`PMC_EFetch_XML`) | 25 |
| Elsevier candidate plain text (`Elsevier_Candidate_Text`) | 6 |
| PMC OA BioC (`PMC_OA_BioC`) | 2 |

Of the 1,788 records that reached some nominal full-text route, 192 (10.7%) were excluded at the body-validation stage as non-body content, breaking down as: publisher preview/loading shells (125), Wiley TDM PDF-note placeholders with no extracted text (24), PMC PDF-viewer shell pages (24), J-STAGE journal-overview pages (13), Europe PMC PDF placeholders (2), metadata-only section bundles (2), and body below the minimum word threshold (2). The retained full-text records have a median body length of several hundred words with a long right tail (75th percentile 2,785 words; 90th percentile 6,891 words; maximum 46,915 words), consistent with a corpus mixing short communications/letters with full research articles.

The remaining 839 abstract-only records are concentrated in access-gated publisher families that require an institutional or commercial text-and-data-mining agreement not currently held by the project: predominantly OUP (274), Wiley legacy content pre-dating reliable TDM coverage or general Wiley access limits (118 combined), SAGE (45), and ACS (11), plus a residual "unclassified" bucket (391) representing DOIs that did not resolve to a recognized publisher family or usable candidate URL. Per the policy in §S5.1, none of these were pursued via browser automation, institutional proxy scraping, or PDF-to-text conversion; the corresponding remediation path (documented per-record in `reports/RESOLUTION_GUIDE.md` and `reports/NEXT_STEPS.tsv`) is licensed/TDM access acquisition, should it become available, rather than further automated scraping.

The 1,596 validated full-text articles (1,595 as currently exported to `scripts_dld/fulltext_txt/`) constitute the literature corpus used as input to the downstream QWEN3-based structured extraction pipeline for AMR gene and mutation data.

## S11. Known limitations

- **No PDF-to-text extraction.** By design, the pipeline treats PDF-only retrievals (Wiley TDM, generic publisher PDF) as archived artifacts rather than text sources, to avoid introducing OCR/layout-parsing noise into the LLM-facing corpus. This is a deliberate precision-over-recall tradeoff: it caps achievable coverage for publishers that only offer PDF (e.g., legacy Wiley content) but keeps the text corpus free of PDF-extraction artifacts.
- **No institutional-proxy or browser-automated retrieval in production.** Tested and rejected (§S5.1) due to unreliability against publisher bot-verification challenges; access-gated publisher families (OUP, ASM, SAGE, ACS) remain under-covered as a result.
- **Heuristic body-validation is imperfect.** The section-name and word-count heuristics in §S6.2 were tuned against observed false-positive patterns (preview shells, PDF placeholders) in this corpus and may not generalize unchanged to substantially different publisher mixes without re-validation.
- **Coverage is bounded by DOI/PMCID resolvability.** PMIDs lacking both a PMCID and a resolvable DOI cannot enter the DOI-based discovery cascade (§S4, route 6) and are the primary source of the single unrecovered failure and a portion of the "unclassified" abstract-only bucket.
