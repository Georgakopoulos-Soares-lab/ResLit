# Priority Next Actions

## Priority 1: Archived false-full-text HTML queue

Status: completed review

- `10_html_extract_version3.py` was rerun with strict paragraph-level criteria
- reviewed HTML false-full-text records: `164`
- newly promotable validated full text: `0`

Conclusion:

- do not spend more time on the current archived `publisher_preview_only` / `pmc_pdf_page_only` / `jstage_overview_only` HTML set unless a new native XML/TXT source appears

## Priority 2: Remaining false-full-text records that are not recoverable HTML

- `wiley_pdf_note_only`: `24`
  - blocked by current decision to avoid PDF-to-text
- `epmc_pdf_placeholder`: `2`
  - needs another native source or manual source discovery
- `meta_sections_only`: `2`
  - metadata-only XML, not true body
- `body_below_min_words`: `2`
  - likely genuinely short or truncated

## Priority 3: Abstract-only queue worth continued effort

Most actionable next groups:

1. `candidate_html_and_pdf`: `71`
   - best remaining native-source recovery bucket
2. `candidate_html_only`: `7`
   - smallest queue and likely fastest to exhaust
3. `no_candidate_found`: `92`
   - needs source discovery and DOI/landing-page enrichment

Access-limited buckets:

- `publisher_gate`: `330`
  - mostly `OUP` (`274`), then `SAGE` (`45`) and `ACS` (`11`)
- `elsevier_candidate_only`: `256`
  - should be treated as source/access limitation until a better native route is found
- `wiley_legacy_pdf`: `83`
  - currently blocked by the no-PDF-text constraint

## If institution API becomes available

Recommended activation order:

1. `publisher_gate`
   - highest expected yield from newly unlocked access
2. `elsevier_candidate_only`
   - retry via institution-backed API or full-text entitlement route
3. `candidate_html_and_pdf`
   - prefer native institution-backed HTML/XML first, keep PDF as fallback only if policy changes
4. `wiley_legacy_pdf`
   - revisit only if institution access provides native full text or the PDF policy changes

## Recommended execution order

1. exhaust `candidate_html_only`
2. then work through `candidate_html_and_pdf` using native HTML/XML/TXT only
3. then improve source discovery for `no_candidate_found`
4. leave `publisher_gate`, `elsevier_candidate_only`, and `wiley_legacy_pdf` as blocked queues unless access policy changes
