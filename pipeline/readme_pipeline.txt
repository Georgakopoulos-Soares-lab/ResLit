ResLit Pipeline — Step-by-Step Notes
=====================================

This file documents each stage of the ResLit pipeline in the order the data
actually flows: what each script/notebook does, and where its output lives
and what that output contains. Updated incrementally as each step is added
to the repo.


STEP 1 — PubMed keyword search
-------------------------------
Folder:  /work/11252/skulakis/projects/reslit/pipeline/pubmed_search/scripts/pubmed_fetch.ipynb

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
  Location (local, not yet in this repo):
    /work/11252/skulakis/projects/reslit/scripts/amr_pmids_genetics2.txt
    /work/11252/skulakis/projects/reslit/scripts/amr_pmids_genetics2.csv
  Contents: one PMID per line (txt) / single "PMID" column (csv) — the full
  deduplicated set of candidate PMIDs from all ~80 queries.
  Current size: 2,057,492 unique PMIDs.


STEP 2 — PubTator3 + MeSH hybrid classifier (filtering)
--------------------------------------------------------
Folder:  /work/11252/skulakis/projects/reslit/pipeline/pubmed_search/scripts/reslit_classifier.ipynb

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
  Location (local, not yet in this repo):
    /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/

    passed.txt                        - PMIDs passing the 4-signal classifier
                                         (1,543,368 PMIDs)
      full path: /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/passed.txt

    not_passed.txt                    - PMIDs failing all signals
                                         (514,123 PMIDs)
      full path: /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/not_passed.txt

    passed_cleaned.txt                - passed.txt after removing non-English
                                         and wrong-organism entries
                                         (1,420,586 PMIDs) — this is the set
                                         that feeds the next pipeline stage
      full path: /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/passed_cleaned.txt

    removed_non_english.txt           - PMIDs dropped for non-English language
                                         (79,379 PMIDs)
      full path: /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/removed_non_english.txt

    removed_wrong_organism.txt        - PMIDs dropped for non-bacterial
                                         organism MeSH terms (43,401 PMIDs)
      full path: /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/removed_wrong_organism.txt

    seed_pmids_not_passed.txt /
    seed_pmids_not_passed_details.tsv - audit trail of which seed PMIDs
                                         failed and which signal/decision
                                         they got
      full paths: /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/seed_pmids_not_passed.txt
                  /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/seed_pmids_not_passed_details.tsv

  Intermediate/support files (large, not tracked in this repo):
    papers.sqlite            - Entrez metadata + PubTator flags +
                                screen_decision/screen_signal per PMID
      full path: /work/11252/skulakis/projects/reslit/papers.sqlite

    pubtator3_index.duckdb   - DuckDB index built from PubTator3 files
      full path: /work/11252/skulakis/projects/reslit/pubtator3_index.duckdb

    pubtator3_data/          - raw PubTator3 bulk downloads (~3.3GB)
      full path: /work/11252/skulakis/projects/reslit/pubtator3_data/


STEP 3 — BioMistral abstract relevance filtering
--------------------------------------------------------
Folder:  /work/11252/skulakis/projects/reslit/pipeline/biomistral_filtering/scripts/

Scripts:
  screen_abstract_multiGPU.py - loads BioMistral/BioMistral-7B (via
    transformers) on 2 GPUs in parallel. For each PMID it pulls title,
    journal, abstract, MeSH terms, substances, keywords, and PubTator
    entity flags (has_gene/has_chemical/has_mutation) from papers.sqlite
    (built in Step 2), builds a few-shot prompt ("is this paper about
    antimicrobial resistance? YES/NO") with 5 fixed example papers, and
    asks the model to answer strictly YES or NO.
  screen_abstract_9GPU.py     - same approach, scaled for more GPUs
                                 (invoked via screen_abstract_6GPU.sh,
                                 batches of 5000 PMIDs instead of 10000)
  screen_abstract.sh          - orchestrator: takes <pmid_file> <output_folder>
                                 <final_csv_name>, splits the PMID file into
                                 batches of 10,000, calls
                                 screen_abstract_multiGPU.py once per batch
                                 (results_batch_N.csv), then concatenates all
                                 batches into the final merged CSV.
  screen_abstract_6GPU.sh     - same orchestrator, batches of 5,000, calls
                                 screen_abstract_9GPU.py instead.
  job_biomistral*.sh          - SLURM job launchers (TACC, gpu-a100/gpu-h100
                                 partitions) that activate venv_a100 and call
                                 screen_abstract.sh with a specific input PMID
                                 file / output folder / final CSV name.

What it does:
  Takes Step 2's passed_cleaned.txt (1,420,586 PMIDs) as input, split into
  batches on 2026-04-15/16/20 (first_run = first 490,046 PMIDs; the
  remaining 930,590 split into 0-300K / 300-600K / 600-900K chunks of
  ~300,000 PMIDs each — this split was done for job-scheduling convenience,
  not a separate pipeline step). Each batch is run through the BioMistral
  few-shot YES/NO classifier above to flag which papers are actually about
  antimicrobial resistance (narrowing the corpus before the expensive
  full-text download/extraction stages).

Output:
  Location (local, not yet in this repo):

    biomistral_filtering/results_first_run.csv        - first_run batch
                                                         (490,046 PMIDs)
                                                         columns: pmid,
                                                         prediction, is_amr
                                                         Result: 102,687 YES /
                                                         387,279 NO (~50 rows
                                                         malformed/header
                                                         artifacts from batch
                                                         merging)
      full path: /work/11252/skulakis/projects/reslit/biomistral_filtering/results_first_run.csv

    biomistral_filtering_0_300_old/passed_cleaned_300000.csv - 0-300K chunk
                                                         (299,995 PMIDs)
      full path: /work/11252/skulakis/projects/reslit/biomistral_filtering_0_300_old/passed_cleaned_300000.csv
      NOTE (current state, 2026-07-06): this run's `prediction` column
      contains garbled/truncated text (MeSH-term fragments etc.) instead of
      clean YES/NO — looks like a bad run, which is presumably why the
      folder is named "_old". Needs to be re-run before it can be trusted.

    biomistral_filtering_300_600/                     - EMPTY as of
                                                         2026-07-06; the
                                                         300-600K chunk has
                                                         not been run yet.
      full path: /work/11252/skulakis/projects/reslit/biomistral_filtering_300_600/

    biomistral_filtering_600_900/                     - EMPTY as of
                                                         2026-07-06; the
                                                         600-900K chunk has
                                                         not been run yet.
      full path: /work/11252/skulakis/projects/reslit/biomistral_filtering_600_900/

    biomistral_filtering/logs/                         - SLURM stdout/stderr
                                                         logs per job
      full path: /work/11252/skulakis/projects/reslit/biomistral_filtering/logs/

  Not copied into this repo (stray duplicate script found alongside the
  above, appears to be a working copy, not part of the canonical pipeline):
    /work/11252/skulakis/projects/reslit/screen_abstract_multiGPU copy.py
