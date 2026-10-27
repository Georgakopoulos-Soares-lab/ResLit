# Verification of paper counts and review impact (ResLit reviewer response)

All numbers come from `verify.py` in this folder, run on 2026-10-21 with
`python3 verify.py`. It reads existing files only (no
network access) and writes only to this folder; the tier logic is imported unchanged
from `../review_impact.py`. Paths below were relative to the authors' working folder,
and `repo/` is the ResLit git repository (commit `5ac81b38`). In this archive, `repo/pipeline/`
is `pipeline/`, `repo/site/` is `website/`, `paper/` is `llm_extractions/` and `revisions/` is `revisions/`. Every table is also in a CSV:

| Table | CSV |
|---|---|
| Section 1 | `s1_paper_counts.csv` |
| Section 2 | `s2_definitions.csv`, `s2_crosstab.csv`, `s2_spotcheck.csv`, `probe_24281307.json` |
| Section 3 | `s3_impact.csv`, `s3_checks.csv` |

---

## 1. Total number of papers

| | Count | Source (file → field) | How |
|---|---|---|---|
| a) Retrieved and validated full texts | **not verifiable here** (see below) | `repo/pipeline/readme_pipeline.txt` (lines 350–376) | text |
| b) Entries in the extraction summaries | 117,112 | `paper/extraction_summary_batch1..6.json` → `results` keys | count keys |
| b) Distinct papers (numeric PMIDs) | **117,110** | same | keys that are all digits |
| b) — success / irrelevant / error | **64,275 / 52,835 / 0** | same → `results[*].status` | count, numeric PMIDs |
| b) — summary header fields (sum of batches) | total 117,112; success 64,276; irrelevant 52,836; errors 0; reviews 1,550 | same → `total_papers`, `success`, … | sum |
| c) Distinct PMIDs with records: genes | 14,060 | `repo/pipeline/06_final_output/Full_list_genes_Reslit_harmonized_antib_bact.csv` → `PMID` | split on `,` `;`, numeric only |
| c) — mutations | 4,716 | `…/Full_list_mutations_Reslit_antib_bact.csv` → `PMID` | same |
| c) — union | **17,385** | both | union; all 17,385 are in the extraction summaries |
| d) Site DB, distinct ResLit PMIDs (genes / mutations / union) | 14,060 / 4,716 / **17,385** | `repo/site/data/reslit.db` → `amr_genes.paper_pmid`, `amr_mutations.paper_pmid`, `source_database = 'Reslit'` | `count(distinct …)` |
| d) Site DB, `papers` table rows | 19,642 | same → `papers.pmid` | all sources; raw PMID cells |
| d) Site "Publications" figure | 19,565 | same → `paper_pmid`, genes + mutations | `getDistinctPaperCount()` rule |

**a) Retrieved and validated.** The repo has no record of how the 117,112 papers were retrieved or validated:
- The retrieval reports in the repo (`repo/pipeline/03_scripts_dld/reports/REPORT_SUMMARY.md`) describe a separate small run: 2,627 valid PMIDs, 1,596 validated full texts (1,595 files in `fulltext_txt/`).
- `repo/pipeline/readme_pipeline.txt` says this retrieval stage "has so far only been validated/run at small scale … it has not yet been pointed at the Step 3 output at scale".
- The only source of 117,112 is the same notes: "117,112 papers total across the 6 folders" of the extraction input on TACC (`/work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/fulltext_1..6/`).
- `downloadind/` and `scripts_dld_old/` locally are also small runs on the same 2,629-PMID list.

To confirm the retrieval and validation numbers, run on TACC:
```
cd /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000
for i in 1 2 3 4 5 6; do ls fulltext_$i | wc -l; done        # files per folder
ls fulltext_*/ | grep -v -E '^[0-9]+\.txt$' | sort | uniq -c   # non-PMID files
find /work/11252/skulakis/projects/reslit -name 'merge_filter_summary.json' -o -name 'fulltext_body_filter_summary.json'
```

**b) 117,110, not 117,112.** Two of the 117,112 entries are not distinct papers. Both are in batch 1:

| Key | Status | Why it is there |
|---|---|---|
| `10103189 copy` | success | A duplicate copy of paper 10103189's text file. 10103189 is also processed under its own key. |
| `papers_downloaded` | irrelevant | A stray file in the input folder (its text was paper 10049269's). |

So the input folders held 117,112 files and **117,110 distinct papers**. Without those two entries, the statuses are 64,275 success / 52,835 irrelevant / 0 errors. The summary header fields (64,276 / 52,836) still include them.

**c) / d)** The release files and the site database agree: **17,385** papers contribute ResLit records (14,060 via genes, 4,716 via mutations).
- The site's "Publications" figure, **19,565**, adds 2,180 papers cited only by CARD / ResFinder / NCBI RGC.
- The `papers` table has 19,642 rows because it keys on raw PMID cells (multi-PMID cells, `-`, `Unpublished`).
- The local database was seeded from the same commit's CSVs as production.

**Which number belongs where**

| Manuscript place | Use | Note |
|---|---|---|
| "retrieved" (Results, S4) | **117,110** distinct full-text papers | Not 117,112. The retrieval and validation method for this corpus must be confirmed on TACC; nothing in the repo documents it. |
| "extracted" (S5) | **117,110** papers processed; **64,275** with a successful extraction, 52,835 irrelevant, 0 errors | |
| "contributing records" (S5.6, R2.3) | **17,385** papers (14,060 genes, 4,716 mutations) | |
| Site "Publications" | 19,565 | ResLit + reference databases; not a ResLit-only figure |

---

## 2. How reviews were identified

### a) Which list each run used

| Run | File | Review definition |
|---|---|---|
| Impact analysis, 2026-10-20 | `revisions/review_impact/review_impact.py` (section 1: `if paper_type == "review"`) | **Extraction label**: `results[pmid].full_output.paper_type == "review"` in the six extraction summaries. 1,558 PMIDs (`review_impact/review_pmids.txt`). The one paper labelled `literature_review` is not counted. |
| PubMed-based impact | `verify.py` (this folder) | **PubMed publication type**. This is the first PubMed-based impact run; no earlier one existed. |

**How the extraction label is set** (`repo/pipeline/04_read_papers/scripts/process_all_papers_vllm_final_gemini.py`, commit `e1364219`):
1. The model returns `paper_type` as one of `single_gene`, `multi_gene_resistome`, `review` or `computational_with_validation` (prompt schema, line ~492).
2. `is_likely_review()` (line 953) then **forces `review`** when 2 or more of 16 phrases in `REVIEW_SIGNALS` (line 253) occur in the first 3,000 characters of a chunk. The phrases include generic ones such as "have been reported", "current understanding" and "an overview of" (line 2036).
3. For long papers processed in chunks, the merged result keeps the **first** chunk's non-empty `paper_type` (line ~1900).
4. The summaries' `reviews` header (1,550) counts only `success` papers labelled review. There are 8 more labelled review with status `irrelevant`, which makes 1,558.

### b) PubMed source for the PubMed run

| Question | Answer |
|---|---|
| Source | **NCBI Entrez `efetch`** (db=pubmed, PubMed XML, `PublicationTypeList`), via `revisions/paper_type/fetch_pubmed_paper_types.py` (copy in `repo/pipeline/05_harmonised_pipeline/shared_scripts/`). Not esummary, not the Stage 2 local DB, not the site `papers` table. |
| When | 2026-10-20; `revisions/paper_type/pubmed_cache.jsonl` and `pubmed_paper_types.csv` were last written at 15:04 (+03:00). |
| Which PMIDs | All 19,565 numeric PMIDs in the four release CSVs: the 17,385 ResLit PMIDs and 2,180 reference-only PMIDs. **The 99,093 extracted papers with no records were not fetched**, so a PubMed review count over all extracted papers is not available. |
| Review rule | `REVIEW_TYPES = {"Review", "Systematic Review"}`. **"Meta-Analysis" and "Scoping Review" were not counted** unless the paper also has one of those two types. |
| Effect of that rule | Among the 17,385 contributing papers: Review 477, Systematic Review 38, Meta-Analysis 22, Scoping Review 2. Only **8** have Meta-Analysis or Scoping Review without Review / Systematic Review, so including them would add 8 papers (515 → 523). |
| Missing PMIDs | 2 not returned by PubMed: 85862590 and 200386180 (malformed). Both are reference-database PMIDs; they get a blank Paper_Type and count as not-review. No PMID was returned without a publication type. |
| File integrity | `pubmed_paper_types.csv` md5 `b9e7749bcfd224d8506514004651ebd9`, identical to the committed copy `repo/pipeline/05_harmonised_pipeline/reference_data/pubmed_paper_types.csv`. |

### c) Download "Paper Type" column

The site column comes from the same file, under the same rule:
1. `add_paper_type.py` applies the mapping, giving "Review" for {Review, Systematic Review} and "Research Article" otherwise.
2. The seed CSVs carry it as the `Paper_Type` column.
3. `seed-sqlite.mjs` loads it into `paper_type`.
4. `lib/actions/download.ts` writes it as the "Paper Type" column.

`verify.py` recomputed the expected value for every row in `amr_genes` and `amr_mutations` (111,171 rows) from the mapping: **0 mismatches**.

**Spot-check of 10 PubMed-review PMIDs** (random, seed 2026). This compares the site value with the PubMed record downloaded on 2026-10-20; it is not a new query, so use the links to recheck live.

| PMID | PubMed types | Site | Model label | Title |
|---|---|---|---|---|
| [7560984](https://pubmed.ncbi.nlm.nih.gov/7560984/) | Journal Article, Review | Review | single_gene | The emergence of epidemic, multiple-antibiotic-resistant *Stenotrophomonas* … and *Burkholderia* … |
| [27620956](https://pubmed.ncbi.nlm.nih.gov/27620956/) | Journal Article, Review, … | Review | single_gene | Antibiotic resistance in *Burkholderia* species |
| [28404671](https://pubmed.ncbi.nlm.nih.gov/28404671/) | Journal Article, Review | Review | single_gene | Update on Antimicrobial Resistance in *Clostridium difficile* … |
| [33506223](https://pubmed.ncbi.nlm.nih.gov/33506223/) | Journal Article, Review | Review | single_gene | A Preliminary Study: Antibiotic Resistance of *E. coli* and *S. aureus* from … South African Wildlife … |
| [33981630](https://pubmed.ncbi.nlm.nih.gov/33981630/) | Journal Article, Review, … | Review | review | *Mycobacterium abscessus* complex: A Review of Recent Developments … |
| [35891616](https://pubmed.ncbi.nlm.nih.gov/35891616/) | Journal Article, Review, … | Review | review | Molecular mechanisms underlying bacterial resistance to ceftazidime/avibactam |
| [38356197](https://pubmed.ncbi.nlm.nih.gov/38356197/) | Journal Article, Review | Review | review | ESKAPE in China: epidemiology and characteristics of antibiotic resistance |
| [39660283](https://pubmed.ncbi.nlm.nih.gov/39660283/) | Journal Article, Review | Review | multi_gene_resistome | The association between the genetic structures of commonly incompatible plasmids … |
| [41259442](https://pubmed.ncbi.nlm.nih.gov/41259442/) | Journal Article, Review | Review | multi_gene_resistome | Integrative review on *Acinetobacter baumannii* … |
| [41608681](https://pubmed.ncbi.nlm.nih.gov/41608681/) | Journal Article, Review | Review | multi_gene_resistome | Molecular resistance mechanisms to newly approved antibiotics (2017–2025) … |

- All 10 site values match PubMed.
- The model label agrees on only 3 of the 10.
- 33506223's title reads like a primary study even though PubMed tags it Review, so PubMed's type is not error-free either.

### d) Cross-tabulation over the 17,385 papers contributing records

| | PubMed review | PubMed not review | Total |
|---|---|---|---|
| **Model review** | 201 | 27 | 228 |
| **Model not review** | 314 | 16,843 | 17,157 |
| **Total** | 515 | 16,870 | 17,385 |

- The two definitions agree on 17,044 papers (98.0%), and share 201 reviews.
- The model misses 314 of PubMed's 515 reviews (61%).
- 27 papers are model-only reviews, consistent with the generic phrases in the keyword override.

**PMID 24281307** (Sarathy 2012, "The role of transport mechanisms in *Mycobacterium tuberculosis* drug resistance and tolerance") contributes records, but **neither definition counts it as a review**:
- PubMed lists only "Journal Article".
- The model labelled it `multi_gene_resistome` (status success).

If it is a review, both methods miss it, so PubMed's indexing is not complete either.

---

## 3. Review-impact analysis under both definitions

Current release (the four seed CSVs, as live on reslit.info). The site's tier logic from `browse.ts` is applied to every ResLit row, then again with the rows from review PMIDs removed. Thresholds: Supported means ≥3 distinct ResLit papers.

| Metric | PubMed publication type | Extraction label (`paper_type == "review"`) |
|---|---|---|
| Review PMIDs among extracted papers | n/a (PubMed types fetched for release PMIDs only) | 1,558 |
| Review PMIDs among papers contributing records | 515 of 17,385 | 228 of 17,385 |
| Gene rows / unique genes from reviews | 2,685 / 552 | 1,198 / 403 |
| Mutation rows / unique mutations from reviews | 1,404 / 866 | 451 / 330 |
| **Genes** C/E/S/Ca, with reviews | 1,221 / 291 / 242 / 1,254 (3,008) | 1,221 / 291 / 242 / 1,254 (3,008) |
| Genes C/E/S/Ca, without reviews | 1,216 / 296 / 225 / 1,235 (2,972) | 1,217 / 295 / 230 / 1,243 (2,985) |
| Genes that disappear | 36 (1 Supported, 35 Candidate) | 23 (all Candidate) |
| Genes Supported → Candidate | 16 | 12 |
| Genes Confirmed → Established | 5 | 4 |
| Genes recovered only via reviews (→ Established / stay Confirmed) | 15 (5 / 10) | 21 (4 / 17) |
| Gene recovery, with → without | 1,049/1,512 (69.4%) → 1,034/1,512 (68.4%) | 1,049/1,512 (69.4%) → 1,028/1,512 (68.0%) |
| Genes Supported ≥2 / ≥3 / ≥5, with → without | 439/242/133 → 414/225/122 | 439/242/133 → 432/230/128 |
| **Mutations** C/E/S/Ca, with reviews | 1,798 / 2,231 / 399 / 9,009 (13,437) | 1,798 / 2,231 / 399 / 9,009 (13,437) |
| Mutations C/E/S/Ca, without reviews | 1,749 / 2,280 / 354 / 8,692 (13,075) | 1,786 / 2,243 / 387 / 8,890 (13,306) |
| Mutations that disappear | 362 (2 Supported, 360 Candidate) | 131 (all Candidate) |
| Mutations Supported → Candidate | 43 | 12 |
| Mutations Confirmed → Established | 49 | 12 |
| Mutations recovered only via reviews (→ Established / stay Confirmed) | 70 (49 / 21) | 14 (12 / 2) |
| Mutation recovery, with → without | 1,479/4,029 (36.7%) → 1,409/4,029 (35.0%) | 1,479/4,029 (36.7%) → 1,465/4,029 (36.4%) |
| Mutations Supported ≥2 / ≥3 / ≥5, with → without | 1,044/399/154 → 960/354/137 | 1,044/399/154 → 1,023/387/149 |

**Checks** (`s3_checks.csv`; all pass):
- The "with reviews" columns are identical in both runs and equal the live site: genes 1,221/291/242/1,254 = 3,008; mutations 1,798/2,231/399/9,009 = 13,437.
- Each "without" tier equals the entries moving into it. For example, PubMed genes: Established 296 = 291 + 5; Supported 225 = 242 − 16 − 1; Candidate 1,235 = 1,254 + 16 − 35.
- Each "without" total equals the "with" total minus the entries that disappear: 3,008 − 36 = 2,972 and 13,437 − 362 = 13,075 (PubMed); 3,008 − 23 = 2,985 and 13,437 − 131 = 13,306 (model).
- Each recovery loss equals the number of entries recovered only via reviews.

"Recovered only via reviews" counts entries in ResLit and ≥1 reference database whose ResLit support comes only from reviews. Those in one reference database drop to Established. Those in two or more stay Confirmed, because the reference databases agree, but are no longer recovered by ResLit.

---

## Exact numbers to use

**Papers**
- Distinct full-text papers processed: **117,110** (not 117,112; two input files were a duplicate and a stray file). How they were retrieved and validated must be confirmed on TACC.
- Successful extraction: **64,275**; irrelevant: **52,835**; errors: **0**.
- Papers contributing records: **17,385** (genes 14,060; mutations 4,716).
- Site "Publications" (ResLit + reference databases): **19,565**.

**Reviews: recommended definition**
- Use the **PubMed publication type**: "Review" or "Systematic Review", from Entrez efetch on 2026-10-20.
- It covers every contributing paper, it is external to the pipeline, and it is the same source as the site and download "Paper Type".
- **515** of the 17,385 contributing papers are reviews by this definition. The model label finds 228; the two share 201.

**Impact of removing reviews (PubMed definition)**
- Genes: 3,008 → **2,972**. Supported 242 → **225**; 36 disappear (35 Candidate, 1 Supported).
- Mutations: 13,437 → **13,075**. Supported 399 → **354**; 362 disappear (360 Candidate, 2 Supported).
- Recovery of reference entries: genes **69.4% → 68.4%** (1,049 → 1,034 of 1,512); mutations **36.7% → 35.0%** (1,479 → 1,409 of 4,029).

**Caveats to state**
- Meta-analyses and scoping reviews without a Review tag are not counted (8 papers).
- PubMed's types are not error-free in either direction: 24281307 (Sarathy 2012) has no Review tag, and 33506223 has one despite reading like a primary study.
