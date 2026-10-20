#!/usr/bin/env python3
"""
Add a Paper_Type column (Review / Research Article) to the release CSVs,
right after Paper_title, from PubMed Publication Types.

The mapping is ../reference_data/pubmed_paper_types.csv, produced by
fetch_pubmed_paper_types.py (in this folder). A paper is "Review" if PubMed
lists "Review" or "Systematic Review", "Research Article" otherwise.

Per row:
  one PMID                -> that paper's type ("" if PubMed has no record)
  no numeric PMID         -> "" ("Unpublished", ISBNs, "Wang_et_al._2013", ...)
  several PMIDs, one type -> that type
  several PMIDs, mixed    -> each type once, in order of first appearance,
                             joined with ", " (e.g. "Research Article, Review")

Safe to rerun: an existing Paper_Type column is replaced. Each file keeps its
own quoting style; nothing else in the file changes.

Usage:
    python add_paper_type.py FILE.csv [FILE.csv ...]
"""

import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAPPING = HERE.parent / "reference_data" / "pubmed_paper_types.csv"
COLUMN = "Paper_Type"
AFTER = "Paper_title"


def load_mapping():
    with MAPPING.open(newline="", encoding="utf-8") as fh:
        return {r["pmid"]: r["paper_type"] for r in csv.DictReader(fh)}


def row_paper_type(cell, mapping):
    pmids = [p.strip() for p in re.split(r"[,;]", cell) if p.strip().isdigit()]
    types = [mapping.get(p, "") for p in pmids]
    if not types:
        return ""
    unique = [t for i, t in enumerate(types) if t and t not in types[:i]]
    return ", ".join(unique)


def add_column(path, mapping):
    raw = path.read_bytes()
    newline = "\r\n" if b"\r\n" in raw[:4096] else "\n"
    # Files written with every field quoted (the reference genes CSV) stay that way
    quoting = csv.QUOTE_ALL if raw.startswith(b'"') else csv.QUOTE_MINIMAL
    rows = list(csv.reader(raw.decode("utf-8").splitlines(keepends=True)))
    header = rows[0]
    if COLUMN in header:
        drop = header.index(COLUMN)
        rows = [r[:drop] + r[drop + 1:] for r in rows]
        header = rows[0]
    pmid_i, at = header.index("PMID"), header.index(AFTER) + 1

    out = [header[:at] + [COLUMN] + header[at:]]
    counts = {}
    for r in rows[1:]:
        value = row_paper_type(r[pmid_i], mapping)
        counts[value or "(blank)"] = counts.get(value or "(blank)", 0) + 1
        out.append(r[:at] + [value] + r[at:])

    with path.open("w", newline="", encoding="utf-8") as fh:
        csv.writer(fh, quoting=quoting, lineterminator=newline).writerows(out)
    summary = ", ".join(f"{k} {v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1]))
    print(f"{path}: {len(out) - 1} rows — {summary}")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    mapping = load_mapping()
    for name in sys.argv[1:]:
        add_column(Path(name), mapping)


if __name__ == "__main__":
    main()
