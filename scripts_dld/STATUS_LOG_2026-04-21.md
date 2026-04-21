# PubMed Retrieval Status Log (2026-04-21)

## Current authoritative output root

- Working corpus: `outputs_v2/`
- GitHub-ready copied export: `outputs_v2/github_ready/fulltext_txt/`

All counts below refer to `outputs_v2/`.

## Current corpus totals

- Valid PMIDs: `2627`
- Retrieval-level full-text: `1787`
- Abstract-only: `839`
- Failed: `1`

## Current validated text totals

- Verified full-text after strict body validation: `1596`
- Retrieval-level full-text excluded as preview/placeholder/non-body: `192`

Use `1596` as the current main LLM/RAG corpus size.

## Validated full-text by source

- `OA_HTML`: `1145`
- `PMC_OA_Bulk_XML`: `290`
- `Publisher_HTML`: `71`
- `Elsevier_Candidate_XML`: `57`
- `PMC_EFetch_XML`: `25`
- `Elsevier_Candidate_Text`: `6`
- `PMC_OA_BioC`: `2`

## GitHub-ready export

- Copied `.txt` files prepared for commit: `1595`
- Export path: `outputs_v2/github_ready/fulltext_txt/`
- Export mode: copied regular files, not symlinks

## Main unresolved false full-text problems

- `publisher_preview_only`: `125`
- `wiley_pdf_note_only`: `24`
- `pmc_pdf_page_only`: `24`
- `jstage_overview_only`: `13`
- `epmc_pdf_placeholder`: `2`
- `meta_sections_only`: `2`
- `body_below_min_words`: `2`

These are retrievals that reached a nominal full-text route but still do not contain acceptable article body text.

## Main unresolved abstract-only problems

- `publisher_gate`: `330`
- `elsevier_candidate_only`: `256`
- `no_candidate_found`: `92`
- `wiley_legacy_pdf`: `83`
- `candidate_html_and_pdf`: `71`
- `candidate_html_only`: `7`

## Code progress

Recent code changes now push body validation earlier in the workflow:

- `pubmed_common.py`
  - added shared content-validation helpers for HTML/XML/TXT full-text acceptance
- `01_download_oa.py`
  - PMC HTML fallback now uses strict content acceptance before being counted as success
- `02_download_api_key_articles.py`
  - publisher/PMC HTML fallback now uses the same strict validation before success is recorded
- `03_report_failures.py`
  - report summary now distinguishes retrieval-level full-text from validated full-text
- `04_filter_fulltext.py`
  - retained as a compatibility/audit tool rather than the main place where bad HTML gets discovered
- `07_generate_session_log.py`
  - structured handoff logging
- `08_close_session.py`
  - one-command closeout wrapper
- `09_prepare_repair_backlog.py`
  - actionable repair queues for false full-text and abstract-only records

## Current working recommendation

Do not use PDF-to-text as the default route.

Preferred next work:

1. attack the `publisher_preview_only` and `pmc_pdf_page_only` queues with better HTML/XML extraction
2. keep the `wiley_pdf_note_only` set out of validated full-text unless XML/HTML/TXT-native content becomes available
3. continue treating the abstract-only set as a separate recovery queue rather than merging it with validated full-text

## Version3 HTML extraction attempt

- New experimental script: `10_html_extract_version3.py`
- Goal: re-open archived `raw html` and extract body text from DOM containers such as `article`, `main`, and `article-body`
- First permissive run showed that large container text could be extracted, but it mixed preview shells, abstract-only PMC pages, and duplicated parent/child content
- Script was then tightened to paragraph-level extraction with explicit preview/reference rejection
- Strict run scope: `164` eligible HTML records from the current false-full-text queue
- Strict promotion result: `0` records added to the validated corpus

Strict failure breakdown:

- `contains_reference_shell`: `77`
- `contains_preview_shell`: `66`
- `no_candidate_container`: `14`
- `insufficient_body_paragraphs`: `3`
- `insufficient_post_abstract_body`: `2`
- `missing_raw_html`: `2`

Interpretation:

- the remaining `pmc_pdf_page_only` set is effectively abstract + selected-references shell content, not recoverable full text from current HTML
- most remaining `publisher_preview_only` pages are publisher previews, not latent body text that just needs a better extractor
- the `jstage_overview_only` set has no article-body container in the archived HTML
- under the current "no PDF-to-text" constraint, this HTML queue is presently exhausted

Artifacts kept for follow-up:

- `outputs_v2/version3/html_extract_version3_summary.json`
- `outputs_v2/version3/html_extract_version3_results.jsonl`
- `outputs_v2/version3/backup_txt/`
- `outputs_v2/version3/backup_meta/`

Priority after this result:

1. stop spending cycles on the current archived HTML false-full-text queue unless a new native XML/TXT source is added
2. keep `wiley_pdf_note_only` out of the validated corpus while PDF-to-text remains disabled
3. shift recovery effort to the `abstract-only` queue, especially `candidate_html_and_pdf` and `candidate_html_only`
4. treat `publisher_gate` and `elsevier_candidate_only` as access/source limitations rather than extractor bugs

## Next environment shift

If institutional API or subscription-backed access becomes available, start with these queues:

1. `publisher_gate` (`330`)
   - mainly `OUP` (`274`), then `SAGE` (`45`) and `ACS` (`11`)
2. `elsevier_candidate_only` (`256`)
   - likely access/source-limited rather than extraction-limited
3. `candidate_html_and_pdf` (`71`)
   - first retry native institution-backed HTML/XML before considering PDF

Until then, the current local native `html/xml/txt` corpus should be treated as operationally exhausted at `1596` verified full-text records.
