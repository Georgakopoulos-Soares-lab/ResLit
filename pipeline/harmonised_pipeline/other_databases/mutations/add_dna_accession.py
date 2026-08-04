#!/usr/bin/env python3
"""
Adds a DNA_Accession column to full_list_mutations_enriched.csv.

- CARD rows: Gene_accession is "CARD:{id}" → look up ARO:{id} in aro_index.tsv
             and use the DNA Accession column value.
- AMRFinder (Reference Gene Catalog) rows: copy Gene_accession as-is.
- ResFinder rows: extract the NCBI accession from the end of Gene_accession.
  Handles simple accessions (LR134511.1) and compound ones with underscores
  (YP_002344650.1, NC_000915.1, NC_000962.3).
"""

import csv
import re
from pathlib import Path

# Matches NCBI accessions at the end of a string:
#   compound: two uppercase letters + underscore + digits + optional .version
#             e.g. YP_002344650.1, NC_000915.1, NC_000962.3
#   simple:   letters + digits + optional .version
#             e.g. LR134511.1, CP010781.1
_NCBI_ACC_RE = re.compile(
    r'([A-Z]{1,2}_\d+(?:\.\d+)?|[A-Z]+\d+(?:\.\d+)?)$'
)

HERE = Path(__file__).resolve().parent

MUTATIONS_CSV = HERE / "full_list_mutations_enriched.csv"
ARO_TSV = HERE.parent.parent / "reference_data" / "card" / "aro_index.tsv"
OUTPUT_CSV = HERE / "full_list_mutations_enriched_with_dna_accession.csv"


def load_aro_index(path: Path) -> dict[str, str]:
    """Return mapping from ARO Accession → DNA Accession."""
    mapping = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            aro_acc = row["ARO Accession"].strip()   # e.g. ARO:3005099
            dna_acc = row["DNA Accession"].strip()
            mapping[aro_acc] = dna_acc
    return mapping


def resolve_dna_accession(database: str, gene_accession: str, aro_map: dict[str, str]) -> str:
    db = database.strip()

    if db == "CARD":
        # Gene_accession looks like "CARD:3003817"
        # ARO index uses "ARO:3003817"
        card_id = gene_accession.strip().removeprefix("CARD:")
        aro_key = f"ARO:{card_id}"
        return aro_map.get(aro_key, "")

    if db == "AMRFinder":
        # Reference Gene Catalog — accession is already in Gene_accession
        return gene_accession.strip()

    if db == "ResFinder":
        # e.g. "gyrA_1_LR134511.1"    → "LR134511.1"
        #       "porA_YP_002344650.1"  → "YP_002344650.1"
        #       "rpoB_1_NC_000915.1"   → "NC_000915.1"
        m = _NCBI_ACC_RE.search(gene_accession.strip())
        return m.group(1) if m else ""

    # Unknown database: leave blank
    return ""


def main() -> None:
    aro_map = load_aro_index(ARO_TSV)
    print(f"Loaded {len(aro_map)} ARO entries from {ARO_TSV.name}")

    missing_aro: set[str] = set()

    with (
        open(MUTATIONS_CSV, newline="", encoding="utf-8") as fin,
        open(OUTPUT_CSV, newline="", encoding="utf-8", mode="w") as fout,
    ):
        reader = csv.DictReader(fin)
        fieldnames = reader.fieldnames + ["DNA_Accession"]
        writer = csv.DictWriter(fout, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            dna_acc = resolve_dna_accession(row["Database"], row["Gene_accession"], aro_map)
            if row["Database"] == "CARD" and not dna_acc:
                missing_aro.add(row["Gene_accession"])
            row["DNA_Accession"] = dna_acc
            writer.writerow(row)

    if missing_aro:
        print(f"WARNING: {len(missing_aro)} CARD accession(s) not found in ARO index:")
        for acc in sorted(missing_aro):
            print(f"  {acc}")

    print(f"Done → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
