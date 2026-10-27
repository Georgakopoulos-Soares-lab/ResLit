# Gene and mutation tables

The full tables as served by https://reslit.info ("download all genes" / "download all mutations"), downloaded on 2026-10-27.

| File | Rows |
|---|---|
| `reslit_genes_all_2026-10-27.csv` | 76,263 |
| `reslit_mutations_all_2026-10-27.csv` | 34,908 |

One row per entry × source database × paper. Key columns:
- **Validation Tier**, assigned per gene name (`../site/lib/actions/browse.ts`): Confirmed (the gene is in at least two of ResLit, CARD, ResFinder and NCBI RGC, or curator-verified), Established (one reference database only), Supported (ResLit only, at least 3 papers), Candidate (ResLit only, 1–2 papers).
- **Source Database**: Reslit, Card Database, ResFinder Database or Reference Gene Catalog.
- **PMID**: the source paper of the row.
- **Paper Type**: Review or Research Article, from PubMed (`../revisions/paper_type/`).

The pipeline's own output tables (ResLit rows only, before tiering) are in `../pipeline/06_final_output/`.
