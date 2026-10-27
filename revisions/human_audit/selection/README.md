# ResLit manual audit (human evaluation of extraction accuracy)

Response to **Reviewer 1, comment 1** and **Reviewer 2, comment 1** (Frontiers in Microbiology revision).

Two annotators read a random, tier-stratified sample of **50 papers** and list, without seeing ResLit's output, every antimicrobial resistance gene and mutation each paper's own results report. A script then compares their lists with ResLit's records for the same papers. It gives ResLit's precision (by evidence tier), its recall, the agreement on organism and resistance, and the agreement between the annotators (Cohen's κ).

---

## 1. Folder contents

| File | What it is | Send to annotators? |
|---|---|---|
| `reslit_audit_select.py` | Selects the papers and writes all the files below | no |
| `reslit_genes_all_2026-10-14-1.csv` | Gene export from reslit.info (download all genes), 2026-10-14 | no |
| `reslit_mutations_all_2026-10-14-1.csv` | Mutation export from reslit.info (download all mutations), 2026-10-14, **after the site fix** (section 2) | no |
| `audit_annotator_A_step1_blind.xlsx` | Annotator A's form: 30 papers | **yes, to A** |
| `audit_annotator_B_step1_blind.xlsx` | Annotator B's form: 30 papers | **yes, to B** |
| `audit_reslit_records.tsv` | ResLit's 310 records for the 50 papers, same columns as the forms | **no** (this is the answer key) |
| `audit_MASTER_50papers.xlsx` | Selected papers (with weights) and ResLit records in one workbook | **no** |
| `audit_selected_papers.tsv` | The 50 papers: stratum, annotator, inclusion probability, weight, record counts | no |
| `audit_selection_log.txt` | Seed, settings, input files and final allocation | no |
| `audit_selection_output.txt` | Full console output of the selection run | no |
| `audit_merged_gene_names.tsv` | 36 database entries whose gene name holds several genes (e.g. `aph(3'')-Ib, aph(6)-Id`), for information | no |

---

## 2. Problem found and fixed on the site (reslit.info)

While preparing the audit we found that the **mutation CSV download** on the site had a wrong **PMID** column. Each mutation row listed **every paper of its gene**, not the paper the mutation was extracted from.

Example, gene aac(6')-Ib:

| Mutation | Paper it was really extracted from | PMID column in the old download |
|---|---|---|
| E167A | 11709299 | 11709299; 18292754; 19008944; 29028006; 30147681; 34795490 |
| Q106L | 18292754 | the same 6 papers |
| D179Y | 29028006; 30147681 | the same 6 papers |

Across the database the old download implied **3.9 million** mutation–paper links, against **22,278** real ones. The old file was 245 MB; the corrected one is 6 MB. The database itself was correct, since each row stores its own paper. Only the CSV writer was wrong. It also labelled every mutation row "Reslit" in a `Status` column, including rows from CARD, ResFinder and the Reference Gene Catalog.

**Fix** (`site/lib/actions/download.ts`, commit `2f897f82`, pushed to `main` on 2026-10-14):
- `PMID` now holds the row's own paper.
- `Status` was replaced by `Source Database` (Reslit / Card Database / ResFinder Database / Reference Gene Catalog), as in the gene download.

The gene download was already correct.

**Check of the new mutation export against ResLit's raw extraction file** (`Full_list_mutations_Reslit_antib_bact.csv`): the 26,094 ResLit rows give exactly the same 22,278 mutation–paper links, with one PMID per row. Because of this, the audit uses only the two site exports and no longer needs the raw files.

---

## 3. How the papers were selected (`reslit_audit_select.py`)

### What can be audited
- Each export row is one gene or mutation × source database × paper, with the **Validation Tier** the site computed for it.
- Only rows with **Source Database = Reslit** are used, i.e. what ResLit itself extracted from a paper. CARD, ResFinder and NCBI rows are not ResLit extractions.
- Only the **Confirmed, Supported and Candidate** tiers can be audited. **Established** entries come from one reference database and were not recovered by ResLit, so they have no ResLit source paper.
- A **record** is one gene (or mutation) × paper. For genes, the record is at gene level, with the allele(s) listed (e.g. `blaKPC` with alleles `blaKPC-2 | blaKPC-3`). For mutations, it is gene + change (protein change if given, otherwise nucleotide change).
- Result: **70,944 records in 17,385 papers** (from 80,274 ResLit rows: 61,684 Confirmed, 12,691 Candidate, 5,899 Supported).

### Strata
Each paper gets one stratum: the **least-supported tier** among its records (Candidate, then Supported, then Confirmed) × the **entity type** (gene or mutation) of those records.

| Stratum | Papers in the database | Papers drawn |
|---|---|---|
| Candidate – gene | 858 | 13 |
| Candidate – mutation | 2,540 | 13 |
| Supported – gene | 1,722 | 5 |
| Supported – mutation | 527 | 5 |
| Confirmed – gene | 10,594 | 4 |
| Confirmed – mutation | 1,144 | 4 |
| Random (from all remaining papers) | 17,351 | 6 |
| **Total** | **17,385** | **50** |

Candidate papers are over-sampled on purpose. Candidate is the least-supported tier, so its accuracy matters most to the reviewers.

### Randomness and weights
- Papers are drawn uniformly at random within each stratum with **seed 2026**. Nobody chose individual papers. Re-running the script with the same inputs and seed gives the same 50 papers.
- **Do not rerun with another seed.**
- A paper in stratum *k* can be selected in its stratum draw or in the random draw. Its inclusion probability is `n_k/N_k + (1 − n_k/N_k) × 6 / M`, where `M` = 17,351 papers left for the random draw. The weight is 1 / probability.

| Stratum | Inclusion probability | Weight |
|---|---|---|
| Candidate – gene | 0.01549 | 64.5 |
| Candidate – mutation | 0.00546 | 183.1 |
| Supported – gene | 0.00325 | 307.8 |
| Supported – mutation | 0.00983 | 101.7 |
| Confirmed – gene | 0.00072 | 1,382.3 |
| Confirmed – mutation | 0.00384 | 260.3 |

The weights allow a database-wide precision estimate that corrects for the over-sampling of Candidate papers.

### Annotators
- 50 papers: **10 shared** (read by both, for Cohen's κ) + 20 only A + 20 only B, so **30 papers each**.
- The shared papers are spread across strata.

### What was selected
- **310 ResLit records** in the 50 papers: 200 Confirmed, 31 Supported, **79 Candidate**; 197 genes, 113 mutations.
- Papers of annotator A contain 187 ResLit records; papers of B, 170; shared papers, 47.
- All records of each selected paper are compared; there is no cap per paper. A cap would cut records the annotators may list, which would wrongly count as ResLit misses.

---

## 4. What the annotators do (step 1, blind)

Each annotator gets **one Excel file** (`audit_annotator_X_step1_blind.xlsx`) with one row per paper:

| PMID | PubMed | type | gene | nucleotide_change | protein_change | organism | resistance |
|---|---|---|---|---|---|---|---|
| pre-filled | link | gene / mutation | | | | | |

Instructions (also in the file's `instructions` sheet):
- Read the paper's **own results**: text, tables, figures and supplement. Skip genes and mutations that are only cited as background.
- One row per gene/mutation × organism. Insert rows under the paper and copy the PMID; **add as many rows as needed**.
- **type**: `gene` (acquired resistance gene) or `mutation`. For a gene, write the allele if given (e.g. blaCTX-M-15). For a mutation, write the gene (e.g. gyrA) and the change.
- **resistance**: antibiotic(s) or class; separate several with `;`.
- If a paper reports none, leave its row empty. **Fill in every paper**: an empty paper is read as "no determinants".
- Do not look up these papers in ResLit. Do not discuss the shared papers until both have finished.

There is no step 2 by hand: the comparison is computational.

---

## 5. Comparison

The comparison with ResLit is in the parent folder (`../scripts/`, `../run_all.sh`); see `../README.md`.

---

## 6. Limitations to state in the response / Methods

- **Candidate precision**: with 79 Candidate records the 95% CI is roughly ±10 percentage points. Supported (31 records) is wider.
- **Recall is not reported by tier.** A determinant ResLit missed has no tier.
- **Matching is rule-based.** Unusual names (e.g. old gene synonyms) can show up as an FP plus an FN. The `reslit_records` and `human_determinants` sheets list them for a quick manual check, which should be reported if it changes any call.
- **Organism and resistance agreement is approximate** (species-name and drug-class matching).
- **A record is gene-level for genes**, so allele differences (blaKPC-2 vs blaKPC-3) count as a match (`match_level` = family where relevant).
- **Empty papers**: a paper left empty by an annotator counts as "no determinants", which makes all its ResLit records FP.

---

## 7. Timeline of what we did (2026-10-14 / 15)

1. Reviewed the original brief and selection script. Found that paper links came from the export's PMID column, and the raw ResLit files were used only to remove papers ResLit never read. Mutations were therefore linked to every paper of their gene, and Confirmed genes could be linked to papers that CARD or ResFinder cited.
2. Traced the cause to the site's mutation CSV download, fixed it, and pushed the fix to GitHub (section 2).
3. Downloaded the corrected mutation export and confirmed it matches ResLit's raw extraction exactly.
4. Rewrote the selection to use only the two exports:
   - ResLit rows only.
   - The tier the site computed for each row. The old script re-derived tiers with case-insensitive names and lost 370 ResLit rows as "Established".
   - Correct inclusion probabilities and weights.
5. Changed the design from 40 papers (25 each) to **50 papers, 30 each, 10 shared**, with more Candidate papers (13 + 13 instead of 8 + 8).
6. Simplified the annotators' form to the basic columns, with no row IDs and annotators adding rows as needed. Removed the manual step 2 and the per-paper record cap.
7. Wrote a first comparison script and tested it on simulated annotations (later replaced by the scripts in `../scripts/`).
8. Generated the final files (seed 2026).

---

## 8. Reproduce

```
pip3 install pandas numpy openpyxl
python3 reslit_audit_select.py \
    --genes reslit_genes_all_2026-10-14-1.csv \
    --mutations reslit_mutations_all_2026-10-14-1.csv \
    --n-papers 50 --overlap 10 --seed 2026 --out audit
```

Same inputs + same seed → same 50 papers and the same files.
