# ResLit vs the reference databases (100 papers)

This compares ResLit with CARD, ResFinder and the NCBI Reference Gene Catalog (AMRFinder) on 100 papers cited by both. For each paper, it asks whether ResLit's records contain the genes and mutations that the reference databases attribute to that paper.

## Files

| File | Contents |
|---|---|
| `benchmark.py` | The whole analysis. One run produces every number in this README |
| `selected_papers.txt` | The 100 PMIDs |
| `reference_vs_reslit_100papers.xlsx` | `summary`, `recall_by_database`, `no_record_papers` (full-text papers with / without a ResLit record, per database), `by_tier` (results by validation tier), `per_paper` (reference vs ResLit lists per paper), `side_by_side` (every reference entry with its status, plus ResLit entries not in the reference), `method` |

## Reproduce

```bash
pip3 install pandas openpyxl      # tested with Python 3.8.10, pandas 1.4.3, openpyxl 3.1.5
python3 benchmark.py
```

The script reads the inputs below by their paths relative to the archive root, so they must be present.
- It prints every table in this README.
- It writes `reference_vs_reslit_100papers.xlsx` and `selected_papers.txt`.
- Re-running it with the same inputs gives the same 100 papers (seed 2026) and the same numbers.
- The draw uses pandas' `sample(random_state=2026)`, so a very different pandas version could pick other papers. `selected_papers.txt` records the 100 PMIDs used here.

## Inputs

- **Reference genes:** `pipeline/05_harmonised_pipeline/other_databases/genes/Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv` (released version, with the CARD PMIDs back-filled).
- **Reference mutations:** `pipeline/05_harmonised_pipeline/other_databases/mutations/Full_list_mutations_otherDatabases_clean.csv`
- **ResLit:** `pipeline/06_final_output/Full_list_genes_Reslit_harmonized_antib_bact.csv` and `Full_list_mutations_Reslit_antib_bact.csv`
- **Papers with full text:** the papers in ResLit's raw LLM extraction batches, `llm_extractions/extraction_summary_batch1-6.json` (117,110 papers). Every paper with a ResLit record is in this set.
- **Validation tiers only:** the site exports `revisions/human_audit/selection/reslit_genes_all_2026-10-14-1.csv` and `reslit_mutations_all_2026-10-14-1.csv`. They are read with the human audit's CSV reader, which repairs the double-quote prime marks in names such as `aph(3")`.

## Selection

- **Cited by the reference databases:** 3,508 papers.
- **With full text (processed by ResLit's LLM):** 1,955 of them. The other 1,553 never reached extraction.
- **With ResLit records:** 1,323 of the 1,955.
- **With no ResLit record:** **632 of 1,955 (32.3%)**.
  - 576 were extracted by the LLM, but nothing survived post-processing into the final tables.
  - 56 were judged irrelevant by the LLM.
- **Sample:** 100 drawn from the 1,323 papers with ResLit records, at random (seed 2026).
  - 82 papers have reference gene entries.
  - 19 papers have reference mutation entries.

## Matching (within each paper)

- **Genes:** names are compared after:
  - lower-casing;
  - removing non-alphanumeric characters;
  - adding `bla` to bare β-lactamase names (`CTX-M-15` → `blaCTX-M-15`);
  - removing CARD's organism prefix (`Saur_FosB` → `FosB`).

  An *allele match* is the same allele. A *gene match* is the same gene with another allele.
- **Mutations:** a mutation is gene + change. The protein change is used if given, otherwise the nucleotide change; `Ser83Leu` = `S83L`.

  A *match* is the same gene and change. *Same gene* means ResLit has the gene but with other changes.
- The same entry in several databases counts once.

## Results

| | Genes | Mutations |
|---|---|---|
| Reference entries | 133 | 126 |
| Found by ResLit (same allele / same change) | 75 (**56.4%**) | 65 (**51.6%**) |
| Found at gene level (any allele / change) | 92 (**69.2%**) | 109 (**86.5%**) |
| Missed (gene absent from ResLit for that paper) | 41 | 17 |
| Papers where ResLit found every reference entry | 52 / 82 | 7 / 19 |
| ResLit entries not in the reference for that paper | 146 of 221 | 72 of 137 |

ResLit usually finds the right gene in the paper. The differences are mostly at allele or exact-change level.

### By database

NCBI RGC is the Reference Gene Catalog for genes and AMRFinder for mutations. A paper or entry cited by several databases counts for each of them, so the rows add up to more than the totals.

**Full-text papers with no ResLit record (all reference-cited papers, not only the sample)**

| Database | Type | Cited papers | With full text | With ResLit record | No ResLit record |
|---|---|---|---|---|---|
| CARD | genes | 1,865 | 1,124 | 808 | 316 (28.1%) |
| CARD | mutations | 348 | 175 | 103 | 72 (41.1%) |
| CARD | any | 2,212 | 1,299 | 911 | 388 (29.9%) |
| ResFinder | genes | 1,707 | 1,061 | 752 | 309 (29.1%) |
| ResFinder | mutations | 173 | 78 | 41 | 37 (47.4%) |
| ResFinder | any | 1,880 | 1,139 | 793 | 346 (30.4%) |
| NCBI RGC | genes | 2,014 | 1,197 | 872 | 325 (27.2%) |
| NCBI RGC | mutations | 486 | 281 | 182 | 99 (35.2%) |
| NCBI RGC | any | 2,488 | 1,472 | 1,048 | 424 (28.8%) |
| **All** | genes | 2,637 | 1,512 | 1,046 | 466 (30.8%) |
| **All** | mutations | 886 | 451 | 285 | 166 (36.8%) |
| **All** | any | 3,508 | 1,955 | 1,323 | **632 (32.3%)** |

Across databases, 27–29% of full-text gene papers have no ResLit record. For mutation papers the share is higher, 35–47%.

**Recall in the 100-paper sample (papers with at least one ResLit record)**

| Database | Type | Papers | Entries | Exact (same allele / change) | Gene level |
|---|---|---|---|---|---|
| CARD | genes | 61 | 89 | 68.5% (61) | 80.9% (72) |
| CARD | mutations | 6 | 23 | 60.9% (14) | 69.6% (16) |
| ResFinder | genes | 54 | 69 | 62.3% (43) | 84.1% (58) |
| ResFinder | mutations | 2 | 51 | 33.3% (17) | 100% (51) |
| NCBI RGC | genes | 64 | 97 | 59.8% (58) | 70.1% (68) |
| NCBI RGC | mutations | 13 | 54 | 66.7% (36) | 81.5% (44) |
| **All** | genes | 82 | 133 | 56.4% (75) | 69.2% (92) |
| **All** | mutations | 19 | 126 | 51.6% (65) | 86.5% (109) |

- An entry cited by several databases counts for each database. That is why each database's recall can be higher than the pooled figure.
- The per-database mutation figures rest on very few papers, so treat them as indicative only:
  - ResFinder: 2 papers, almost entirely the TB catalogue paper 23705640.
  - CARD: 6 papers.
- The gene figures (54–64 papers per database) are much more reliable.

### By validation tier (sheet `by_tier`)

Each entry gets its tier from the site exports (`revisions/human_audit/selection/reslit_*_all_2026-10-14-1.csv`), matched on PMID and the same name or change. The site assigns tiers per gene name, not per allele or paper (`website/lib/actions/browse.ts`):
- *Confirmed*: the gene is in at least two sources (ResLit, CARD, ResFinder, NCBI RGC), or a curator verified it. The two sources can be two reference databases without ResLit.
- *Established*: the gene is in one reference database only, not in ResLit.
- *Supported*: the gene is in ResLit only, from at least 3 papers.
- *Candidate*: the gene is in ResLit only, from 1–2 papers.

So a reference entry is Confirmed or Established, and a ResLit entry is Confirmed, Supported or Candidate.

**Reference entries**

| Type | Reference tier | Found (same allele / change) | Same gene, other allele / change | Missed | Total |
|---|---|---|---|---|---|
| Gene | Confirmed | 75 (62.0%) | 17 | 29 | 121 |
| Gene | Established | 0 | 0 | 10 | 10 |
| Gene | Established / Confirmed* | 0 | 0 | 2 | 2 |
| Mutation | Confirmed | 65 (61.3%) | 36 | 5 | 106 |
| Mutation | Established | 0 | 8 | 12 | 20 |

\* The same entry has a different tier in two databases.

- **Established entries are never found.** By definition ResLit doesn't have them anywhere. They account for 10 of the 41 gene misses (plus the 2 with a mixed tier) and 12 of the 17 mutation misses. Most are:
  - accessory genes of van operons (VanR-D, VanX-D, …);
  - regulator mutations (oqxR, baeR/baeS, amrR).
- **A Confirmed entry is not necessarily found in this paper.** 31 gene entries with a Confirmed tier (including the 2 "Established / Confirmed") and 5 Confirmed mutations are missed. ResLit has the gene in other papers for 27 of the 31 genes and for all 5 mutations. The other 4 genes (VanX-D, rgt, ANT(3'')-IIb, CmlV) are Confirmed by two reference databases and are not in ResLit at all. Examples of genes ResLit has elsewhere:
  - aac(6')-Ib, CatB3, blaZ, Msr(A), Tet(38), VanH, dfrA17;
  - cls A23V/F60S/L52F, which ResLit stores under `cls2`, a naming difference.
- **Most "other allele / change" cases are Confirmed entries.** This fits database citations that do not match the paper's own results. Examples:
  - 16082008 is cited for blaCTX-M-46 to -50, while the paper and ResLit have blaCTX-M-14.
  - The TB catalogue paper 23705640 accounts for 34 of the 44 "same gene, other change" mutations.

**ResLit entries**

| Type | ResLit tier | In reference for this paper | Same gene in reference | Only ResLit | Total |
|---|---|---|---|---|---|
| Gene | Confirmed | 75 (36.2%) | 56 | 76 | 207 |
| Gene | Supported | 0 | 0 | 12 | 12 |
| Gene | Candidate | 0 | 0 | 2 | 2 |
| Mutation | Confirmed | 65 (72.2%) | 8 | 17 | 90 |
| Mutation | Supported | 0 | 2 | 4 | 6 |
| Mutation | Candidate | 0 | 5 | 36 | 41 |

- **Supported and Candidate entries never match a reference entry.** This holds by construction, and it shows the tiers and the matching are consistent.
- **Most Confirmed ResLit genes (132 of 207) are not cited by the databases for that paper.** They are known genes that ResLit links to papers the databases do not cite for them. This is extra paper-level coverage, not error.
- **Candidate mutations are the largest ResLit-only group (41).** Only 5 of them are in a gene that the reference lists for the same paper. This matches the low Candidate-mutation precision in the human audit (0.27).

## Caveats

- **Recall is measured against the reference, not precision.** A reference database cites a paper only for what it catalogues. ResLit's extra entries (146 genes, 72 mutations) are therefore not errors by themselves; they are listed in `side_by_side` for checking.
- **A database citation does not always mean the paper reports that allele.** Databases sometimes cite a paper for alleles it does not report. For example, 16082008 is cited for blaCTX-M-46 to -50, while ResLit has blaCTX-M-14. Some "misses" are therefore citation artefacts rather than ResLit errors.
- **Naming differences remain.** Old synonyms (`aac(3)-IIa` vs `aacC2`) and different mutation numbering are not resolved and count as misses.
- **The sample covers only papers with at least one ResLit record.** The recall figures therefore assume ResLit kept something from the paper.
  - 632 of the 1,955 reference-cited papers with full text (32.3%) have no ResLit record. Every reference entry in those papers is missed.
  - Recall over all full-text papers is therefore lower than the figures above. It was not measured here; it would need the same comparison run on all 1,955 papers.
