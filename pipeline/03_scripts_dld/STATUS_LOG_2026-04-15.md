# PubMed Retrieval Status Log (2026-04-15)

## Current corpus status

- Total valid PMIDs: `2628`
- Full-text articles retrieved: `1982`
- Abstract-only articles: `641`
- Failed records: `5`

## Current full-text sources

- `PMC_OA / OA pipeline (01)`: `1204`
- `PMC_EFetch_XML`: `297`
- `Elsevier_Candidate_XML`: `312`
- `Elsevier_Candidate_Text`: `1`
- `Publisher_HTML`: `143`
- `Wiley_TDM_PDF`: `25`

## Main remaining abstract-only groups

- `OUP`: `285`
- `Wiley`: `116`
- `ASM`: `50`
- `SAGE`: `45`
- `ACS`: `11`
- `Unclassified`: `134`

## Wiley clarification

Early Wiley counts were inflated by an overly broad DOI-to-Wiley heuristic. That logic has been corrected. The current Wiley-specific fallback set is:

- `Wiley old PDF fallback`: `81`
  - `pre-1996`: `44`
  - `1996-2005`: `37`

These are records where Wiley-related access paths exist, but Wiley TDM did not return the article successfully and the record has been tagged for PDF-first follow-up.

## Interpretation of remaining abstract-only records

The remaining abstract-only set is no longer a single bucket. It is better understood as:

- institution/subscription gated publisher content
- Wiley legacy PDF-first candidates
- records with only weak landing-page evidence
- records with no clear full-text path

For many publisher-gated records, standard HTTP requests and even basic browser automation still land on security verification or subscription gates. The next realistic path is institution-authenticated retrieval rather than more anonymous scraping.

## New institution-gated workflow

A dedicated script has been added:

- `05_download_institution_gated.py`

Purpose:

- process publisher-gated records separately from the API fallback script
- use a persistent local Chrome profile
- allow manual institutional sign-in (UT Austin)
- then batch-attempt article retrieval with the saved authenticated browser session

Target publisher families right now:

- `OUP`
- `ASM`
- `SAGE`
- `ACS`

## Institutional browser result

The institution-browser path was tested with local Google Chrome and a persistent profile. In practice, the target publisher pages still triggered human/bot verification steps. Because of that, this path is not currently reliable for unattended batch retrieval.

Current decision:

- do not continue investing in browser automation for this batch
- keep institution-gated records labeled as access-constrained
- shift follow-up effort to TDM/API-oriented routes and PDF-first routes

## TDM/API follow-up manifest

A dedicated classification helper has been added:

- `06_prepare_tdm_manifests.py`

It groups remaining abstract-only records into action-oriented buckets such as:

- `wiley_tdm_or_pdf`
- `wiley_legacy_pdf`
- `institution_tdm_or_subscription`
- `subscription_tdm_via_crossref`
- `institution_or_commercial_tdm`
- `manual_review`

## Practical recommendation

1. Keep `01` and `02` as the stable baseline.
2. Use `05_download_institution_gated.py --prepare-login` to establish a UT Austin-authenticated browser session.
3. Re-run the institution-gated script on the gated subset.
4. Treat the Wiley legacy subset as a separate PDF-first queue.

## Important caveat

Some articles can be resolved to a publisher page through DOI but still require institutional grant/access confirmation at the final step. That is expected and should now be treated as a labeled access state rather than as a generic retrieval failure.
