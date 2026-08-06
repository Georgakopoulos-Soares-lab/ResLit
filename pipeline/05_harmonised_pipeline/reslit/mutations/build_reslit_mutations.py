#!/usr/bin/env python3
"""
Builds Full_list_mutations_Reslit.csv from mutations_all_final_organisms.csv.

Column mapping
--------------
Database          ← "Reslit" (literal)
Nucleotide_Change ← normalised_gene_mutation
Protein_Change    ← normalised_protein_change
Gene              ← gene_name
Encodes           ← encodes
Mechanism         ← effect_on_function
Resistance        ← confers_resistance_to
Organism          ← organisms_observed_in, first two words of each "|"-separated entry;
                    each organism becomes its own row
Validated_by      ← validated_by
Notes             ← notes
Accession_number  ← NULL (empty)
PMID              ← paper_pmid
Paper_title       ← paper_title
Publication_year  ← publication_year
Origin            ← origin
"""

import csv
from pathlib import Path

INPUT_CSV  = Path(__file__).parent / "mutations_all_final_organisms.csv"
OUTPUT_CSV = Path(__file__).parent / "Full_list_mutations_Reslit.csv"

OUT_FIELDS = [
    "Database",
    "Nucleotide_Change",
    "Protein_Change",
    "Gene",
    "Encodes",
    "Mechanism",
    "Resistance",
    "Organism",
    "Validated_by",
    "Notes",
    "Accession_number",
    "PMID",
    "Paper_title",
    "Publication_year",
    "Origin",
]


def organism_name(raw: str) -> str:
    """Return the first two words of an organism string (or one word if that's all there is)."""
    parts = raw.strip().split()
    return " ".join(parts[:2]) if parts else ""


def split_organisms(field: str) -> list[str]:
    """Split a pipe-separated organism field into a list of cleaned names."""
    names = []
    for part in field.split("|"):
        name = organism_name(part)
        if name:
            names.append(name)
    return names if names else [""]


def main() -> None:
    out_rows = 0
    with (
        open(INPUT_CSV, newline="", encoding="utf-8") as fin,
        open(OUTPUT_CSV, newline="", encoding="utf-8", mode="w") as fout,
    ):
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=OUT_FIELDS)
        writer.writeheader()

        for row in reader:
            organisms = split_organisms(row["organisms_observed_in"])
            base = {
                "Database":          "Reslit",
                "Nucleotide_Change": row["normalised_gene_mutation"].strip(),
                "Protein_Change":    row["normalised_protein_change"].strip(),
                "Gene":              row["gene_name"].strip(),
                "Encodes":           row["encodes"].strip(),
                "Mechanism":         row["effect_on_function"].strip(),
                "Resistance":        row["confers_resistance_to"].strip(),
                "Validated_by":      row["validated_by"].strip(),
                "Notes":             row["notes"].strip(),
                "Accession_number":  "",
                "PMID":              row["paper_pmid"].strip(),
                "Paper_title":       row["paper_title"].strip(),
                "Publication_year":  row["publication_year"].strip(),
                "Origin":            row["origin"].strip(),
            }
            for org in organisms:
                writer.writerow({**base, "Organism": org})
                out_rows += 1

    print(f"Done → {OUTPUT_CSV}  ({out_rows} rows)")


if __name__ == "__main__":
    main()
