# Benchmark PMID sets

| File | Set | Used in |
|---|---|---|
| `human_audit_50.tsv` | The 50 papers of the blind human audit: sampling stratum, annotator (A / B / both), inclusion probability, weight, ResLit record counts | `../revisions/human_audit/` |
| `screening_validation_200.csv` | The 200 abstracts used to validate BioMistral-7B screening (100 predicted YES, 100 NO): PMID, BioMistral prediction, manual judgement (Y/N) | `../revisions/validation_screening/` |
| `reference_benchmark_100.txt` | The 100 papers cited by CARD / ResFinder / NCBI Reference Gene Catalog that were compared with ResLit | `../revisions/reference_benchmark/` |
| `reference_seed_genes.txt` | PMIDs cited by the reference databases for resistance genes (seed list) | screening test |
| `reference_seed_mutations.txt` | PMIDs cited by the reference databases for resistance mutations (seed list) | screening test |
| `reference_seed_{genes,mutations}_screen_passed.txt` | Seed PMIDs that passed the PubTator3 + MeSH screening step | screening test |
| `reference_seed_{genes,mutations}_screen_not_passed.tsv` | Seed PMIDs that did not pass, with the screening decision and signal | screening test |

The seed lists are known positives: papers that the reference databases cite for an AMR determinant. Running them through the screening step measures how many relevant papers the screen keeps.
