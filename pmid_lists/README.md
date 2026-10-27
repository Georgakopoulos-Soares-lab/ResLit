# PMID lists by pipeline stage

One PMID per line, sorted, unique. The stage numbers follow `../pipeline/README.md`.

| File | Stage | PMIDs |
|---|---|---|
| `01_pubmed_search.txt` | PubMed keyword search (~80 AMR queries) | 2,057,493 |
| `02_pubtator_mesh_passed.txt` | Passed the PubTator3 + MeSH classifier | 1,420,587 |
| `03_biomistral_yes.txt` | Judged relevant (YES) by BioMistral-7B abstract screening; queued for full-text retrieval | 356,262 |
| `04_fulltext_llm_processed.txt` | Full text retrieved and processed by the LLM (Qwen3-30B-A3B) | 117,110 |
| `05_llm_relevant.txt` | Of these, judged relevant by the LLM (status `success`) | 64,275 |
| `05_llm_irrelevant.txt` | Judged irrelevant by the LLM | 52,835 |
| `06_in_reslit_tables.txt` | Contribute at least one gene or mutation record to the released ResLit tables | 17,385 |
| `biomistral_scores/` | BioMistral-7B score files (one row per screened PMID: prediction, `is_amr`) | 4 files |

Notes:
- Stage 4 also holds 136 PMIDs from the reference-database seed lists (`../benchmark_pmid_sets/`), which were retrieved and processed before the screened corpus; they are not in `03_biomistral_yes.txt`.
- Stage 4–5 lists come from `../llm_extractions/`; two records there are not papers (`10103189 copy`, `papers_downloaded`) and are left out of the lists.
- Stage 6 is the union of the PMIDs in `../pipeline/06_final_output/`.
- `biomistral_scores/` are the raw screening outputs, unchanged: `results_first_run.csv` (first run) and `passed_cleaned_{300000,600000,900000}.csv` (the remaining stage-2 PMIDs in three chunks). Together they score 1,420,582 of the 1,420,587 stage-2 PMIDs (5 have no score). A few rows are not clean `YES`/`NO`: the first-run file repeats its header line 48 times; some predictions are free text (`Yes.`, `No, this paper is …`); and 17 YES rows read as `True` because the free text contained a comma. `03_biomistral_yes.txt` is every PMID whose prediction starts with "yes" plus those 17.
