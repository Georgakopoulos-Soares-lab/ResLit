# Supported-tier threshold sensitivity

Answers the reviewer comment on the ≥3-publication threshold for the Supported tier.

## What was computed
- **Literature-only determinants**: genes and mutations that ResLit reports but that are absent from CARD,
  ResFinder and NCBI RGC (these are the Supported and Candidate tiers).
- **Tiers** reproduce the site's logic in `site/lib/actions/browse.ts` exactly:
  - *Genes*: one entry per normalised gene name (the `normalizeGeneName` rule in `site/lib/gene-name.ts`).
    Confirmed = in ≥2 sources; Established = reference databases only; Supported = ResLit only with
    ≥ threshold distinct publications; otherwise Candidate.
  - *Mutations*: each row feeds both its `gene::p::protein` and `gene::n::nucleotide` buckets, and a row's tier
    uses the union of those buckets. Entries are grouped by the protein-priority key (`mutationGroupKey`) and take
    the best tier of their rows, as in the mutation comparison notebook.
- **Publications** are distinct numeric PMIDs, with multi-PMID cells split on `,` and `;` and non-numeric values
  ("-", "Unpublished") ignored. Every ResLit PMID cell in the current data is a single numeric PMID, so this
  gives the same counts as the site, which counts raw PMID strings.
- For mutations, an entry's publication count is the largest count among its rows. That is the number the
  threshold is compared with: an entry is Supported if any of its rows reaches the threshold.
- Curator verification also makes an entry Confirmed on the site; no row in these release files is curated,
  so it plays no part here.
- Thresholds 1, 2, 3, 4, 5 and 10 change only the Supported/Candidate split; Confirmed and Established are fixed.

## Inputs (current release, as seeded into production)
| Input | Path | md5 |
|---|---|---|
| ResLit genes | `website/scripts/seed-data/Full_list_genes_Reslit_harmonized_antib_bact.csv` | `9798f619874c59bb09042a6a02288850` |
| Reference genes | `website/scripts/seed-data/Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv` | `b7e51e8a2c9b3dd3b97072e3e74bfa90` |
| ResLit mutations | `website/scripts/seed-data/Full_list_mutations_Reslit_antib_bact.csv` | `174b181dee004297f1806c19b761b28a` |
| Reference mutations | `website/scripts/seed-data/Full_list_mutations_otherDatabases_clean.csv` | `7b843b7c790bb31802fc001942ef190b` |

## Sanity checks (all must pass, otherwise no outputs are written)
| Entries | Check | Got | Expected | Result |
|---|---|---|---|---|
| genes | literature-only total | 1496 | 1496 | PASS |
| genes | Supported at ≥3 | 242 | 242 | PASS |
| genes | all tiers (C/E/S/Ca) | (1221, 291, 242, 1254) | (1221, 291, 242, 1254) | PASS |
| genes | total entries | 3008 | 3008 | PASS |
| mutations | literature-only total | 9408 | 9408 | PASS |
| mutations | Supported at ≥3 | 399 | 399 | PASS |
| mutations | all tiers (C/E/S/Ca) | (1798, 2231, 399, 9009) | (1798, 2231, 399, 9009) | PASS |
| mutations | total entries | 13437 | 13437 | PASS |

## Outputs
- `supported_threshold_sensitivity.csv`: Supported n and %, and Candidate n, for each threshold.
- `publications_per_entry_distribution.csv`: publications per literature-only entry (1, 2, 3, 4, 5–9, ≥10; median; max).
- `supplementary_table_threshold.md`: ready-to-paste Supplementary table; the ≥3 row is the threshold used.
- `figure_threshold_sensitivity.pdf` / `.png` (300 dpi): Supported counts by threshold, genes and mutations as two panels.

## Rerun
```
python3 sensitivity_supported_threshold.py [--repo /path/to/ResLit/repo]
```
Needs pandas and matplotlib. It reads only the four input CSVs and writes only into this folder.
