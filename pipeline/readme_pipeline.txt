ResLit Pipeline — Step-by-Step Notes
=====================================

NOTE ON FOLDER NAMES IN THIS REPO: this pipeline's top-level stage folders
were renamed with numeric prefixes for GitHub browsing clarity —
pubmed_search/ -> 01_pubmed_search/, biomistral_filtering/ ->
02_biomistral_filtering/, scripts_dld/ -> 03_scripts_dld/, read_papers/ ->
04_read_papers/, harmonised_pipeline/ -> 05_harmonised_pipeline/ (referred to
below by its working name, "pipeline/harmonization/"), final_output/ ->
06_final_output/. This file is otherwise unmodified from the original working
notes: the paths below still use the un-prefixed folder names, and most are
absolute paths on the original compute cluster (/work/11252/skulakis/...),
kept as a faithful record of where each script/output actually ran/lived
rather than rewritten to match this repo's layout. See pipeline/README.md for
a short map from stage number to folder.

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

  vista/screen_abstract_multiGPU_vista.py - single-GPU variant of
    screen_abstract_multiGPU.py, adapted for TACC's Vista system (Grace
    Hopper "gh" partition, ~120GB unified GPU memory): loads
    BioMistral-7B once on a single GPU instead of splitting across 2 GPUs
    with multiprocessing, and uses a larger per-inference batch size (12)
    since more VRAM is available. Same few-shot YES/NO prompt logic and
    same papers.sqlite source as the original script.
  vista/screen_abstract_vista.sh - same orchestrator as screen_abstract.sh
    (splits into 10,000-PMID batches, merges results_batch_N.csv into one
    final CSV) but calls screen_abstract_multiGPU_vista.py.
  vista/job_biomistral_300000_vista.sh / _600000_vista.sh / _900000_vista.sh
    - SLURM launchers (TACC Vista, partition gh) that run
    screen_abstract_vista.sh against the 0-300K / 300-600K / 600-900K PMID
    chunks respectively (see Output below — these are the ACTUAL runs for
    those three chunks; the local biomistral_filtering_0_300_old/,
    _300_600/, _600_900/ folders are stale/incomplete and superseded by
    the Vista runs).

What it does:
  Takes Step 2's passed_cleaned.txt (1,420,586 PMIDs) as input, split into
  batches on 2026-04-15/16/20 (first_run = first 490,046 PMIDs, run
  locally; the remaining 930,590 split into 0-300K / 300-600K / 600-900K
  chunks of ~300,000 PMIDs each, run on the Vista system — this split was
  done for job-scheduling convenience, not a separate pipeline step). Each
  batch is run through the BioMistral few-shot YES/NO classifier above to
  flag which papers are actually about antimicrobial resistance (narrowing
  the corpus before the expensive full-text download/extraction stages).

Output:
  Location (local, not yet in this repo):

    biomistral_filtering/results_first_run.csv        - first_run batch,
                                                         run locally
                                                         (490,046 PMIDs)
                                                         columns: pmid,
                                                         prediction, is_amr
                                                         Result: 102,687 YES /
                                                         387,279 NO (~50 rows
                                                         malformed/header
                                                         artifacts from batch
                                                         merging)
      full path: /work/11252/skulakis/projects/reslit/biomistral_filtering/results_first_run.csv

    vista/results_300000/  - 0-300K chunk, run on Vista
                             (input: results_amr_pmids_genetics/0_300K_passed_cleaned_remaining_900K.txt)
      passed_cleaned_300000.csv - all 299,995 PMIDs scored (pmid, prediction, is_amr)
      passed_pmids_300000.csv   - 68,731 PMIDs that scored YES
      results_batch_1.csv ... results_batch_30.csv - per-batch intermediate results
      full path: /work/11252/skulakis/projects/reslit/vista/results_300000/

    vista/results_600000/  - 300-600K chunk, run on Vista
                             (input: results_amr_pmids_genetics/300_600K_passed_cleaned_remaining_900K.txt)
      passed_cleaned_600000.csv - all 300,000 PMIDs scored
      passed_pmids_600000.csv   - 88,677 PMIDs that scored YES
      results_batch_1.csv ... results_batch_30.csv - per-batch intermediate results
      full path: /work/11252/skulakis/projects/reslit/vista/results_600000/

    vista/results_900000/  - 600-900K chunk, run on Vista
                             (input: results_amr_pmids_genetics/600_900K_passed_cleaned_remaining_900K.txt)
      passed_cleaned_900000.csv - all 330,590 PMIDs scored
      passed_pmids_900000.csv   - 96,166 PMIDs that scored YES
      results_batch_1.csv ... results_batch_34.csv - per-batch intermediate results
      full path: /work/11252/skulakis/projects/reslit/vista/results_900000/

    vista/logs/             - SLURM stdout/stderr logs per Vista job
      full path: /work/11252/skulakis/projects/reslit/vista/logs/

    biomistral_filtering/logs/                         - SLURM stdout/stderr
                                                         logs for the first_run
                                                         (local) job
      full path: /work/11252/skulakis/projects/reslit/biomistral_filtering/logs/

  Combined total across all 4 runs (first_run + Vista 300K/600K/900K):
    1,420,631 PMIDs scored | 356,261 scored YES (~25%)
    (1,420,631 vs. 1,420,586 in passed_cleaned.txt — off by ~45 due to
    minor batch-boundary/header artifacts noted above, not a data-loss bug)

  Superseded / not used (kept locally, not copied into this repo):
    /work/11252/skulakis/projects/reslit/biomistral_filtering_0_300_old/ - an
      earlier, apparently broken local run of the 0-300K chunk (prediction
      column contains garbled MeSH-term fragments, not clean YES/NO).
      Superseded by vista/results_300000/ above.
    /work/11252/skulakis/projects/reslit/biomistral_filtering_300_600/ and
      /work/11252/skulakis/projects/reslit/biomistral_filtering_600_900/ - both
      empty; these chunks were run on Vista instead (see above), not locally.
    /work/11252/skulakis/projects/reslit/screen_abstract_multiGPU copy.py -
      stray duplicate script, not part of the canonical pipeline.


STEP 4 — Full-text download
--------------------------------------------------------
Folder:  /work/11252/skulakis/projects/reslit/pipeline/scripts_dld/
(moved here from the repo's top-level scripts_dld/ folder; full details in
pipeline/scripts_dld/README.md)

What it does:
  Given a PMID list, retrieves full-text articles and produces a verified,
  deduplicated text corpus, in three stages:
    Stage 1 - OA download (05_run_oa_in_chunks.py -> 01_download_oa.py):
      tries PMC Bulk XML -> EuropePMC XML -> PMC EFetch -> OA HTML ->
      Publisher HTML -> PubMed BioC, per PMID, highest quality first.
    Stage 2 - API download (06_run_api_in_chunks.py ->
      02_download_api_key_articles.py): for PMIDs stage 1 couldn't resolve,
      tries PMC EFetch -> EuropePMC -> Elsevier -> Wiley TDM PDF ->
      Publisher HTML -> PubMed BioC, using API keys (NCBI/Elsevier/Wiley/
      Springer) from apikey.env (git-ignored, not committed).
    Stage 3 - Merge & filter (merge_and_filter.py): deduplicates PMIDs found
      in both OA and API output (keeps the highest-quality source), then
      classifies each as full-text (body word count >= 500 and real body
      sections present) vs abstract-only/rejected.
  run_pipeline.py orchestrates all three stages end-to-end; 03_report_failures.py
  and 04_filter_fulltext.py are utility/audit scripts (failure breakdown by
  publisher, re-classification without re-downloading).

Input used so far (IMPORTANT - see note below):
  The runs recorded in STATUS_LOG_2026-04-15.md and STATUS_LOG_2026-04-21.md
  were done on amr_genes_pmids_amrprofiler_uniq.txt - a curated seed list of
  2,630 PMIDs from the existing AMRprofiler database - NOT on the
  BioMistral-passed PMIDs from Step 3 (results_first_run.csv "YES" set,
  ~102,687 PMIDs, or the larger 900K remaining batches). In other words,
  this stage has so far only been validated/run at small scale on a
  different, pre-existing PMID list; it has not yet been pointed at the
  Step 3 output at scale.
  full path: /work/11252/skulakis/projects/reslit/amrprofiler_database/amr_genes_pmids_amrprofiler_uniq.txt
             (2,630 PMIDs; copies also exist at
             /work/11252/skulakis/projects/reslit/downloading_papers/amr_genes_pmids_amrprofiler_uniq.txt
             and /work/11252/skulakis/projects/reslit/site/amr_genes_pmids_amrprofiler_uniq.txt)

Output (as published in this repo, per STATUS_LOG_2026-04-21.md):
  Valid PMIDs considered:              2,627
  Retrieval-level full-text found:     1,787
  Abstract-only:                       839
  Failed:                              1
  Verified full-text after body validation: 1,596
  Excluded as preview/placeholder/non-body: 192

    pipeline/scripts_dld/fulltext_txt/   - 1,595 verified full-text .txt
                                            files, one per PMID, each with a
                                            header (PMID/PMCID/DOI/Title/
                                            Journal/Source/License) followed
                                            by section-tagged body text
      full path: /work/11252/skulakis/projects/reslit/pipeline/scripts_dld/fulltext_txt/

    pipeline/scripts_dld/reports/        - JSON/TSV/JSONL summaries: failure
                                            report by publisher, abstract-only
                                            follow-up candidates, TDM
                                            candidates manifest, next-steps
                                            action list
      full path: /work/11252/skulakis/projects/reslit/pipeline/scripts_dld/reports/

    pipeline/scripts_dld/runs/           - JSONL result logs per API chunk
      full path: /work/11252/skulakis/projects/reslit/pipeline/scripts_dld/runs/


STEP 5 — LLM gene/mutation extraction (Qwen3-30B-A3B via vLLM)
--------------------------------------------------------
Folder:  /work/11252/skulakis/projects/reslit/pipeline/read_papers/scripts/
(copied from /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/,
which is the current/final version of this step - an earlier, smaller-scale
version of the same script lives locally at
read_papers/analyse_papers/process_all_papers_vllm_final_gemini.py and is
NOT copied into the repo, to avoid duplicating the same script twice)

Scripts:
  process_all_papers_vllm_final_gemini.py - the extraction pipeline itself.
    Despite the filename, it runs Qwen/Qwen3-30B-A3B locally via vLLM (not
    Gemini - leftover name from an earlier iteration). Two-pass design:
      Pass 1 - structured JSON extraction of AMR genes/mutations per paper
        against a strict whitelist schema (allele, encodes, mechanism,
        confers_resistance_to, resistance_mechanism_class,
        organisms_tested_in, role_in_paper, validation_method,
        evidence_level, key_substitutions, genetic_context, source,
        evidence_note for genes; notation, amino_acid_position,
        nucleotide_position, codon_change, nucleotide_change,
        protein_change, position_in_molecule, confers_resistance_to,
        organisms_observed_in, effect_on_function, mutation_type,
        validated_by, origin for mutations).
      Pass 2 - "atomic auditor": re-verifies each extracted field against
        the actual paper text, field by field, to cut false positives
        (design goal stated in the script: precision over recall, since
        1% FP at 400K papers = 4000 wrong entries).
    Design rules baked into the prompt/schema: only extract what THIS paper
    experimentally validated (not citations/background); regulatory or
    biosynthesis genes (mgrB, pmrA/B, phoP/Q, lpxA-T, arnB-T, etc.) only
    count when mutated; review papers get bibliography-inference rules
    (evidence_level="inferred", source="bibliography").
    Reads full-text from PAPERS_FOLDER env var (defaults to
    read_papers/fulltext_txt), writes one <PMID>.json per paper plus
    extraction_summary.json / reviews_summary.json / irrelevant_summary.json
    / errors_summary.json to OUTPUT_DIR env var. Supports --PMID (process
    specific PMIDs), --override (reprocess existing), --skip-audit (skip
    Pass 2). Resumes automatically - already-processed PMIDs are skipped.
  regenerate_extraction_summary.py - rebuilds extraction_summary.json (and
    the reviews/irrelevant/errors summaries) from the individual <PMID>.json
    files in one results/ folder, without re-running the model.
  job_extract_all_vllm.sh - SLURM launcher (TACC, partition gh) for a single
    run over the whole PAPERS_FOLDER.
  job_extract_all_vllm_fulltext_1.sh ... _6.sh - SLURM launchers for a 6-way
    split of the corpus, each setting PAPERS_FOLDER=fulltext_txt_50000/fulltext_N
    and OUTPUT_DIR=fulltext_txt_50000/analyse_papers/batch_N/results, so all
    6 batches can run in parallel as separate SLURM jobs.

Input:
  Full-text .txt files from Step 4, split into 6 folders for parallel SLURM
  jobs:
    /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/fulltext_1/ ... fulltext_6/
  (117,112 papers total across the 6 folders)

Output (current state, 2026-07-06 - NOT yet a single merged/final file,
see note below):
  Location: /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/
    batch_1/results/ ... batch_6/results/ - one <PMID>.json per paper, plus
    per-batch extraction_summary.json / reviews_summary.json /
    irrelevant_summary.json / errors_summary.json
      full paths:
        /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_1/results/
        /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_2/results/
        /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_3/results/
        /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_4/results/
        /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_5/results/
        /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_6/results/

  Per-batch totals (from each batch's extraction_summary.json):
    batch_1: 20,233 papers | 11,758 successful extractions | 22,155 genes
    batch_2: 18,619 papers | 10,212 successful extractions | 18,894 genes
    batch_3: 18,617 papers | 10,313 successful extractions | 19,556 genes
    batch_4: 19,919 papers |  9,892 successful extractions | 17,656 genes
    batch_5: 19,945 papers | 11,734 successful extractions | 26,835 genes
    batch_6: 19,779 papers | 10,367 successful extractions | 20,867 genes
    TOTAL:  117,112 papers |  64,276 successful extractions | 125,963 genes

  NOTE: there is currently no single merged file combining all 6 batches.
  regenerate_extraction_summary.py only rebuilds the summary for one
  results/ folder at a time. Producing one final combined CSV/JSON across
  all 6 batches (for import into the site database) is still a TODO.

  Also present locally but NOT copied into the repo:
    read_papers/analyse_papers/ - an earlier, smaller-scale run of the same
      extraction script (process_all_papers_vllm_final_gemini.py, plus
      several superseded variants: _18_5, _19_5, _final_22_5, _final,
      _final_gemini_old, _final_gemini_backup, _final_gemini_backUpbeforAuditor,
      _final_gemini_backupAfterAuditor) against results_vllm/ (1,603 files,
      current), results_vllm_old/ (1,596), results_vllm_notGood/ (1,590),
      results_vllm_test/, results_vllm_gemini_test/ (small test runs).
      full path: /work/11252/skulakis/projects/reslit/read_papers/analyse_papers/
    read_papers/fulltext_txt_50000/process_all_papers_vllm_final_gemini copy.py
      and process_all_papers_vllm_final_gemini_old.py - stray duplicate /
      superseded versions found alongside the current script, not part of
      the canonical pipeline.
    read_papers/fulltext_txt_50000/mutations-20260604T085950Z-3-001.zip - a
      raw full-text corpus backup (fulltext_oa/ and fulltext_api/ subfolders),
      unrelated to extraction output.


STEP 6 — Post-extraction cleaning and harmonization (JSON -> final tables)
----------------------------------------------------------------------------
Folder:  pipeline/harmonization/  (scripts + reference data, in this repo)
         pipeline/final_output/   (delivered final tables, in this repo)

This step picks up exactly where STEP 5 leaves off, and completes the TODO
noted at the end of STEP 5: it takes the per-batch extraction_summary.json
files (batch_1/results/extraction_summary.json ... batch_6/results/
extraction_summary.json, referred to below as extraction_summary_batch1.json
... batch6.json) and turns them into one final, cleaned gene table and one
final, cleaned mutation table, harmonized against external AMR databases
(CARD, ResFinder, NCBI Reference Gene Catalog) and ready for import into the
site's Supabase database.

Folder layout:
  pipeline/harmonization/  all scripts and reference/lookup files used to
                            create the final gene and mutation tables
  pipeline/final_output/   the delivered final tables (see below)

harmonization/ contents:

  Scripts (run in the order described below)
    qwen3_to_csv.py                    extraction JSON -> gene rows CSV
    qwen3_mutations_to_csv.py          extraction JSON -> mutation rows CSV
    build_reslit_genes.py              normalised gene CSV -> final column schema
    build_reslit_mutations.py          normalised mutation CSV -> final column schema
    harmonize_names.py                 rewrites gene/allele casing to match
                                        CARD/ResFinder/Reference Gene Catalog
    fix_gene_capitalization_genes.py   restores gene-name capitalization (genes table)
    fix_gene_capitalization_reslit.py  restores gene-name capitalization (mutations table)
    clean_organism_resistance.py       final Organism/Resistance QA (genes table)
    clean_mutations.py                 final Organism/Resistance QA (mutations table)
    enrich_database_metadata.py        backfills paper_title/publication_year from PubMed
    run_genes_pipeline.sh              full command sequence for the genes table
    run_mutations_pipeline.sh          full command sequence for the mutations table

  Reference / lookup data
    allele_geneFamily.txt                        allele -> RGC gene-family name mapping
    amrGenesUniq.txt                              AMR gene name whitelist
    antibiotics_names.txt                         valid antibiotic names
    antibiotics_names_abreviations.txt            valid antibiotic abbreviations
    available_species.txt                         valid bacterial species/genus names
    chromosomalMutationGenes.txt                  chromosomal genes with point mutations
    pointMutationsGenesUniq.txt                   genes that are point-mutation-only
    Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv
                                                   CARD + ResFinder + Reference Gene Catalog
                                                   genes, harmonized schema — input to
                                                   harmonize_names.py

All scripts expect to be run from INSIDE harmonization/, with input/output
files alongside the scripts (this mirrors how they were originally developed
and run; several scripts hardcode Path(__file__).parent to locate their
reference files). When you re-run the pipeline, the intermediate and final
files are written into harmonization/ itself — the copies kept in
../final_output/ are the delivered snapshot from the last full run, not a
live output target.

Requirements: Python 3.10+ (build_reslit_genes.py / build_reslit_mutations.py
use parenthesized multi-context-manager "with" syntax), pandas, and
biopython (for enrich_database_metadata.py's PubMed/Entrez calls).

Not included (too large for git):
  - extraction_summary_batch1.json ... batch6.json — raw QWEN extraction
    output (STEP 5's per-batch summaries), ~40-50 MB each (~250 MB total).
    Regenerate via STEP 5, or copy the 6 batch extraction_summary.json files
    here under these names.
  - Bacteria_genes_all.txt / Bacteria_genes.txt (~104 MB each) and
    Bacteria.gene_info (~1.5 GB) — used by fix_gene_capitalization_*.py and
    the bacterial-gene filter in qwen3_to_csv.py / qwen3_mutations_to_csv.py.
    Derived from NCBI's Gene database "Bacteria" gene_info dump
    (ftp://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/Bacteria/).
    Bacteria_genes_all.txt is the Symbol (+ Synonyms) column extracted from
    that file. Download the dump and re-derive the symbol list, or place
    your own copy of Bacteria_genes_all.txt into harmonization/ before
    running the capitalization-fix or filtering steps — the scripts degrade
    gracefully (filter/fix simply skipped) if it's absent.
  - Intermediate scratch files (genes_batch*.csv, genes_all*.csv,
    mutations_batch*.csv, mutations_all*.csv, normalised_genes_all*.csv,
    etc.) — regenerated by running the pipeline scripts in order; not kept
    in git to avoid bloating the repo with regenerable data.

Genes pipeline (harmonization/run_genes_pipeline.sh):
  1. qwen3_to_csv.py on each of the 6 extraction batches
     -> genes_batch{1..6}.csv
     One row per gene per paper. Applies gene-name normalization against
     allele_geneFamily.txt (two-pass: heuristic string transforms, e.g.
     adding a missing "bla" prefix, fixing AME prime-mark variants,
     stripping mutation suffixes, fixing mcr spelling; then mapping to the
     canonical family string), drops point-mutation-only genes not in
     amrGenesUniq.txt, and filters to genes present in Bacteria_genes_all.txt
     (allele-aware matching).
  2. Concatenate all 6 batches, keeping one header -> genes_all.csv
  3. Filter to rows tagged "experimentally_characterized"
     -> genes_all_experimental_characterized.csv
  4. Add a normalized gene-name column (lowercased, primes/quotes stripped)
     -> normalised_genes_all_experimental_characterized.csv
  5. Drop rows with no paper title (and other malformed rows)
     -> normalised_genes_all_experimental_characterized_full.csv
  6. Append a literal Database = "Reslit" column
     -> normalised_genes_all_experimental_characterized_full_final.csv
  7. build_reslit_genes.py — maps to the final column schema (Database,
     Gene, Allele, Encodes, Mechanism, Resistance, Organism,
     Sequence_accession, Protein_accession, Validation_method, PMID,
     Paper_title, Publication_year, Key_findings, Geographic_location,
     Notes) -> Full_list_genes_Reslit.csv
  8. harmonize_names.py — rewrites gene/allele casing to match the most
     frequent original-case spelling found in CARD/ResFinder/Reference Gene
     Catalog (normalized-name lookup, both gene and allele level)
     -> Full_list_genes_Reslit_harmonized.csv
  9. fix_gene_capitalization_genes.py — restores correct capitalization by
     matching (case-insensitively, primes/quotes stripped) against
     Bacteria_genes_all.txt; when matched, uses that file's original
     casing. Result from the last run: 1,419 of 3,716 unique gene names
     corrected (e.g. blaVEB, ampC, sul1); 1,121 genes had no match and were
     left as-is (allele variants with complex suffixes, fused names, or LLM
     artifacts like "aac(6)-lb-cr", "bla(oxa-51-like)").
  10. clean_organism_resistance.py — final QA pass:
      Organism: checks each pipe-separated organism against
        available_species.txt (genus+species match against the reference
        list); removes non-bacterial entries.
      Resistance: checks each pipe-separated value against
        antibiotics_names.txt / antibiotics_names_abreviations.txt; handles
        plurals (carbapenems -> carbapenem), hyphenated combos
        (piperacillin-tazobactam), slash combos (amoxicillin/clavulanate),
        and common variant spellings; removes non-antibiotic entries
        (metals, biocides, vague terms); standardizes capitalization;
        deduplicates.
      -> Full_list_genes_Reslit_harmonized_antib_bact.csv   [FINAL]

Mutations pipeline (harmonization/run_mutations_pipeline.sh):
  1. qwen3_mutations_to_csv.py on each extraction batch
     -> mutations_batch{1..6}.csv
     Same chromosomal-gene handling as qwen3_to_csv.py, but mutations on
     chromosomal genes (gyrA, rpoB, etc.) are KEPT here — this is the
     correct table for them. Locus tags, hallucinations, and fused mutation
     notations are cleaned.
  2. Concatenate all 6 batches, keeping one header -> mutations_all.csv
  3. enrich_database_metadata.py — backfills missing paper_title /
     publication_year via PubMed Entrez: rows with a PMID but no title get
     the title/year fetched directly; rows with no PMID get one looked up
     via GenBank accession first. Rows that already have both fields are
     skipped. -> mutations_all_enriched.csv
  4. MANUAL QA STEP (not scripted) -> mutations_all_final.csv ->
     mutations_all_final_organisms.csv. Applied by hand:
       - dropped rows with neither a normalised_gene_mutation nor a
         normalised_protein_change
       - dropped rows where either of those fields contained "?"
       - normalized "rss<something>" variants to "rrs"
       - dropped rrs rows mislabeled as "23s" and rrl rows mislabeled as
         "50s"
       - kept only rows with a reported microorganism
  5. build_reslit_mutations.py — maps to the final column schema (Database,
     Nucleotide_Change, Protein_Change, Gene, Encodes, Mechanism,
     Resistance, Organism, Validated_by, Notes, Accession_number, PMID,
     Paper_title, Publication_year, Origin; Organism = first two words of
     each "|"-separated entry in organisms_observed_in, each organism
     becomes its own output row) -> Full_list_mutations_Reslit.csv
  6. fix_gene_capitalization_reslit.py — same capitalization fix as the
     genes pipeline. Result from the last run: 211 of 1,180 unique gene
     names corrected (e.g. GyrA -> gyrA, RpoB -> rpoB, PBP2x -> pbp2x,
     rv0678 -> Rv0678); 180 had no match and were left as-is.
  7. clean_mutations.py — reuses clean_organism_resistance.py's Organism
     and Resistance matching logic, plus two mutation-specific rules:
       - if Nucleotide_Change encodes a negative position (e.g. C-12T, a
         promoter mutation), an empty Resistance is accepted and not
         flagged
       - if both Nucleotide_Change and Protein_Change carry a position
         number, the nucleotide position must be approximately 3x the
         protein position (+/- 2); otherwise Nucleotide_Change is cleared
         (it was likely a stray copy of the protein position)
     -> Full_list_mutations_Reslit_antib_bact.csv   [FINAL]

Output (as published in this repo):
  pipeline/final_output/Full_list_genes_Reslit_harmonized_antib_bact.csv
    54,175 rows
    Columns: Database, Gene, Allele, Encodes, Mechanism, Resistance,
    Organism, Sequence_accession, Protein_accession, Validation_method,
    PMID, Paper_title, Publication_year, Key_findings, Geographic_location,
    Notes

  pipeline/final_output/Full_list_mutations_Reslit_antib_bact.csv
    26,094 rows
    Columns: Database, Nucleotide_Change, Protein_Change, Gene, Encodes,
    Mechanism, Resistance, Organism, Validated_by, Notes, Accession_number,
    PMID, Paper_title, Publication_year, Origin

  Together these cover 14,060 unique PMIDs (a subset of STEP 5's 64,276
  successful extractions — the QA/filtering steps above are precision-
  oriented and drop rows that don't pass validation). These are imported
  into Supabase via ../site/scripts/import-reslit-harmonized.mjs (and
  import-genes-csv.mjs / import-mutations-csv.mjs for the other-databases
  comparison rows), which the website then serves on the /browse pages.

Known open items:
  - The production database was last (re)imported before this cleaning
    pass — it currently reflects the pre-clean_organism_resistance.py data
    (which includes ~2,941 gene rows this step later removed for invalid
    organism/resistance values). pipeline/final_output/*.csv needs to be
    re-imported.
  - empty_organism_rows.csv / empty_resistance_rows.csv (produced by
    clean_organism_resistance.py, not included here) list rows where no
    organism/antibiotic match was found against the reference lists — these
    need either reference-list expansion or manual curator review.
  - The CARD/ResFinder/Reference-Gene-Catalog coverage comparison
    (other_databases/comparison/genes/comparison_all.ipynb, not in this
    repo) currently runs against a pre-harmonization intermediate file and
    should be re-run against
    pipeline/final_output/Full_list_genes_Reslit_harmonized_antib_bact.csv
    for publication-accurate numbers.
