#!/usr/bin/env python3
"""
Follow the 200 validation abstracts downstream of BioMistral-7B screening:
were they queued for download, do they have a PMCID, did their full text reach
Qwen3 extraction, and did they contribute records to the ResLit database?

"Reached extraction" means the PMID is in one of the six raw extraction batch
files (llm_extractions/extraction_summary_batch1-6.json; 117,110 papers plus
two non-PMID keys). Per-paper download logs for the full run live on the
cluster, so a paper whose download failed or returned only an abstract counts
as not reaching extraction. Database records are rows with
Source Database = Reslit in the 2026-10-14 site exports.

Cells: PY = BioMistral YES, judged Y; PN = YES, judged N (false positive);
NY = NO, judged Y; NN = NO, judged N.

Read-only on validation_200.csv. Writes into this folder:
  validation_downstream.csv

Usage:
    python downstream_validation.py [--csv validation_200.csv]
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]  # archive root
BATCHES = [ROOT / f"llm_extractions/extraction_summary_batch{i}.json" for i in range(1, 7)]
EXPORTS = ROOT / "revisions/human_audit/selection"
GENES_CSV = EXPORTS / "reslit_genes_all_2026-10-14-1.csv"
MUTS_CSV = EXPORTS / "reslit_mutations_all_2026-10-14-1.csv"
# the human audit's reader for the site exports (repairs prime marks such as aph(3")-Ib)
sys.path.insert(0, str(EXPORTS))
from reslit_audit_select import read_table  # noqa: E402


def llm_output(paths):
    """Per-paper status, paper type and gene counts from the raw LLM extraction batches."""
    rows = []
    for path in paths:
        for pmid, r in json.load(open(path))["results"].items():
            fo = r.get("full_output") or {}
            rows.append({"PMID": pmid, "llm_status": r.get("status"), "llm_paper_type": fo.get("paper_type") or "",
                         "llm_genes": len(fo.get("genes") or {}),
                         "llm_mutation_genes": len(fo.get("mutations") or {})})
    return pd.DataFrame(rows).drop_duplicates("PMID"), None


def reslit_row_counts():
    """Rows with Source Database = Reslit per (PMID, type) in the site exports."""
    rows = []
    for path, kind in ((GENES_CSV, "gene"), (MUTS_CSV, "mutation")):
        d = read_table(str(path))
        d = d[d["Source Database"].str.strip().eq("Reslit")]
        rows += [(p, kind) for cell in d["PMID"] for p in re.findall(r"\b\d{4,9}\b", cell)]
    return pd.DataFrame(rows, columns=["PMID", "type"]).groupby(["PMID", "type"]).size().unstack(fill_value=0)

QUEUES = [ROOT / "pmid_lists/03_biomistral_yes.txt"]  # the extra queue is a subset of this list
PMC_IDS = HERE / "PMC-ids.csv"  # from https://ftp.ncbi.nlm.nih.gov/pub/pmc/PMC-ids.csv.gz (not in the archive)


def pmcids(pmids):
    """PMID -> PMCID for the given PMIDs, from the PMC-ids.csv dump."""
    out = {}
    with open(PMC_IDS, newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        i, j = header.index("PMID"), header.index("PMCID")
        for row in reader:
            if len(row) > i and row[i] in pmids:
                out[row[i]] = row[j]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[1])
    parser.add_argument("--csv", type=Path, default=HERE / "validation_200.csv")
    args = parser.parse_args()

    v = pd.read_csv(args.csv, dtype=str, keep_default_na=False)
    pred = v.biomistral_prediction.str.strip().str.upper().map({"YES": "P", "NO": "N"})
    v["cell"] = pred + v.my_judgement.str.strip().str.upper()

    queued = set().union(*(set(p.read_text().split()) for p in QUEUES))
    pmc = pmcids(set(v.pmid))
    status, _ = llm_output(BATCHES)
    st = status.set_index("PMID")
    rc = reslit_row_counts()

    v["queued"] = v.pmid.isin(queued)
    v["pmcid"] = v.pmid.map(pmc).fillna("")
    v["extracted"] = v.pmid.isin(st.index)
    v["llm_status"] = v.pmid.map(st.llm_status).fillna("")
    v["llm_paper_type"] = v.pmid.map(st.llm_paper_type).fillna("")
    v["llm_genes"] = v.pmid.map(st.llm_genes).fillna(0).astype(int)
    v["llm_mutation_genes"] = v.pmid.map(st.llm_mutation_genes).fillna(0).astype(int)
    v["reslit_gene_rows"] = v.pmid.map(rc.get("gene")).fillna(0).astype(int)
    v["reslit_mutation_rows"] = v.pmid.map(rc.get("mutation")).fillna(0).astype(int)
    v["in_reslit"] = v.reslit_gene_rows + v.reslit_mutation_rows > 0

    cols = ["pmid", "cell", "queued", "pmcid", "extracted", "llm_status", "llm_paper_type",
            "llm_genes", "llm_mutation_genes", "reslit_gene_rows", "reslit_mutation_rows",
            "in_reslit", "title"]
    v[cols].sort_values(["cell", "pmid"]).to_csv(HERE / "validation_downstream.csv", index=False)

    print(f"{'cell':4s} {'n':>3s} {'queued':>6s} {'pmcid':>5s} {'extracted':>9s} "
          f"{'irrelevant':>10s} {'success':>7s} {'in_reslit':>9s}")
    for cell, g in v.groupby("cell"):
        print(f"{cell:4s} {len(g):3d} {g.queued.sum():6d} {g.pmcid.ne('').sum():5d} "
              f"{g.extracted.sum():9d} {g.llm_status.eq('irrelevant').sum():10d} "
              f"{g.llm_status.eq('success').sum():7d} {g.in_reslit.sum():9d}")


if __name__ == "__main__":
    main()
