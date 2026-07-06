ResLit Pipeline — Step-by-Step Notes
=====================================

This file documents each stage of the ResLit pipeline in the order the data
actually flows: what each script/notebook does, and where its output lives
and what that output contains. Updated incrementally as each step is added
to the repo.


STEP 1 — PubMed keyword search
-------------------------------
Folder:  pipeline/pubmed_search/scripts/pubmed_fetch.ipynb

What it does:
  Queries the NCBI E-utilities ESearch endpoint directly (raw HTTP via
  `requests`, with rate-limiting/backoff for 429/500 errors) using ~80
  hand-crafted PubMed queries covering antimicrobial resistance: MeSH terms
  (e.g. "Drug Resistance, Microbial"[mh], beta-Lactamases[mh] AND
  genetics[sh]), specific drug classes (carbapenems, macrolides, colistin,
  tetracyclines, etc.), resistance genes/targets (gyrA, rpoB, parC, 23S
  rRNA...), and generic Title/Abstract patterns for mutation/resistance
  mechanism papers.

  Since ESearch caps results at 9999 per query, `fetch_pmids_recursive()`
  recursively splits any query that exceeds the cap by year -> month -> day
  across the range 1960-2025, then deduplicates all PMIDs into one set.

Output:
  Location (local, not yet in this repo): scripts/amr_pmids_genetics2.txt
  and scripts/amr_pmids_genetics2.csv
  Contents: one PMID per line (txt) / single "PMID" column (csv) — the full
  deduplicated set of candidate PMIDs from all ~80 queries.
  Current size: 2,057,492 unique PMIDs.


STEP 2 — PubTator3 + MeSH hybrid classifier (filtering)
--------------------------------------------------------
Folder:  pipeline/pubmed_search/scripts/reslit_classifier.ipynb

What it does (takes Step 1's PMID list as input):
  1. Downloads PubTator3 bulk annotation files (~3.3GB) and builds a DuckDB
     index of per-PMID entity tags: gene, mutation, chemical, species, and
     high-value relation flags.
  2. Fetches full Entrez metadata for every seed PMID (MeSH terms, MeSH
     subheadings, substances, publication types, language) into a local
     SQLite database (papers.sqlite), then joins in the PubTator entity
     flags from step 1.
  3. Runs a 4-signal classifier (`classify_paper`) per PMID — a PMID
     "passes" if ANY of these hold:
       Signal 1: PubTator tags (gene OR mutation) AND chemical
       Signal 2: MeSH AMR-mechanism term AND MeSH drug/resistance term
       Signal 3: MeSH genetics subheading AND (AMR substance OR AMR mechanism)
       Signal 4: PubTator species tag AND MeSH AMR-mechanism AND MeSH drug term
     Otherwise it is dropped ("no_signal").
  4. Post-classifier cleanup: removes non-English papers (language != "eng")
     and removes papers about non-bacterial organisms (MeSH terms for
     fungi/viruses/parasites) unless a bacterial MeSH term is also present
     to override.

Output:
  Location (local, not yet in this repo): results_amr_pmids_genetics/
    passed.txt                        - PMIDs passing the 4-signal classifier
                                         (1,543,368 PMIDs)
    not_passed.txt                    - PMIDs failing all signals
                                         (514,123 PMIDs)
    passed_cleaned.txt                - passed.txt after removing non-English
                                         and wrong-organism entries
                                         (1,420,586 PMIDs) — this is the set
                                         that feeds the next pipeline stage
    removed_non_english.txt           - PMIDs dropped for non-English language
                                         (79,379 PMIDs)
    removed_wrong_organism.txt        - PMIDs dropped for non-bacterial
                                         organism MeSH terms (43,401 PMIDs)
    seed_pmids_not_passed.txt /
    seed_pmids_not_passed_details.tsv - audit trail of which seed PMIDs
                                         failed and which signal/decision
                                         they got
  Intermediate/support files (large, not tracked in this repo):
    papers.sqlite            - Entrez metadata + PubTator flags +
                                screen_decision/screen_signal per PMID
    pubtator3_index.duckdb   - DuckDB index built from PubTator3 files
    pubtator3_data/          - raw PubTator3 bulk downloads (~3.3GB)
