# GitHub Submission Status Log (2026-04-21)

## Scope of this repository update

This repository snapshot publishes:

- updated retrieval pipeline code under `scripts_dld/`
- a refreshed validated literature corpus under `scripts_dld/fulltext_txt/`
- current summary and planning reports under `scripts_dld/reports/`

This status file is a repository-facing summary for the published snapshot,
not the full local working log.

## Published corpus totals

- Valid PMIDs considered: `2627`
- Retrieval-level full-text found: `1787`
- Abstract-only: `839`
- Failed: `1`

## Published validated text totals

- Verified full-text after body validation: `1596`
- Retrieval-level full-text excluded as preview/placeholder/non-body: `192`
- Files currently published in `scripts_dld/fulltext_txt/`: `1595`

Use the validated full-text count above as the main LLM/RAG corpus size.

## Published validated full-text by source

- `OA_HTML`: `1145`
- `PMC_OA_Bulk_XML`: `290`
- `Publisher_HTML`: `71`
- `Elsevier_Candidate_XML`: `57`
- `PMC_EFetch_XML`: `25`
- `Elsevier_Candidate_Text`: `6`
- `PMC_OA_BioC`: `2`

## Key published files

- `scripts_dld/fulltext_txt/`
- `scripts_dld/reports/REPORT_SUMMARY.md`
- `scripts_dld/reports/fulltext_body_filter_summary.json`
- `scripts_dld/reports/PRIORITY_NEXT_ACTIONS_2026-04-21.md`

## Interpretation

- `1787` means the pipeline reached some nominal full-text route
- `1596` is the stricter validated corpus after excluding preview pages, placeholder pages, metadata-only captures, and other non-body text
- the published `fulltext_txt` directory is the GitHub-ready text export intended for downstream use

## Remaining blocked or unresolved work

Main unresolved false-full-text problems:

- `publisher_preview_only`: `125`
- `wiley_pdf_note_only`: `24`
- `pmc_pdf_page_only`: `24`
- `jstage_overview_only`: `13`
- `epmc_pdf_placeholder`: `2`
- `meta_sections_only`: `2`
- `body_below_min_words`: `2`

Main unresolved abstract-only problems:

- `publisher_gate`: `330`
- `elsevier_candidate_only`: `256`
- `no_candidate_found`: `92`
- `wiley_legacy_pdf`: `83`
- `candidate_html_and_pdf`: `71`
- `candidate_html_only`: `7`

## Practical conclusion

Under the current constraint of preferring native `html/xml/txt` sources and
not using PDF-to-text as the default route, the currently published validated
corpus should be treated as the stable working release.

If institutional API or subscription-backed access becomes available later, the
highest-yield next queues are:

1. `publisher_gate`
2. `elsevier_candidate_only`
3. `candidate_html_and_pdf`
