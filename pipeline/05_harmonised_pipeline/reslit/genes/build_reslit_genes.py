#!/usr/bin/env python3
"""
Builds Full_list_genes_Reslit.csv from
normalised_genes_all_experimental_characterized_full_final.csv.

Column mapping
--------------
Database             ← "Reslit" (literal)
Gene                 ← gene_name_normalised
Allele               ← allele
Encodes              ← encodes
Mechanism            ← mechanism
Resistance           ← confers_resistance_to
Organism             ← organisms_tested_in
Sequence_accession   ← sequence_accessions
Protein_accession    ← NULL (empty)
Validation_method    ← validation_method
PMID                 ← paper_pmid
Paper_title          ← paper_title
Publication_year     ← publication_year
Key_findings         ← key_findings
Geographic_location  ← geographic_location
Notes                ← notes
"""

import csv
from pathlib import Path

INPUT_CSV  = Path(__file__).parent / "normalised_genes_all_experimental_characterized_full_final.csv"
OUTPUT_CSV = Path(__file__).parent / "Full_list_genes_Reslit.csv"

OUT_FIELDS = [
    "Database",
    "Gene",
    "Allele",
    "Encodes",
    "Mechanism",
    "Resistance",
    "Organism",
    "Sequence_accession",
    "Protein_accession",
    "Validation_method",
    "PMID",
    "Paper_title",
    "Publication_year",
    "Key_findings",
    "Geographic_location",
    "Notes",
]


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
            writer.writerow({
                "Database":            "Reslit",
                "Gene":                row["gene_name_normalised"].strip(),
                "Allele":              row["allele"].strip(),
                "Encodes":             row["encodes"].strip(),
                "Mechanism":           row["mechanism"].strip(),
                "Resistance":          row["confers_resistance_to"].strip(),
                "Organism":            row["organisms_tested_in"].strip(),
                "Sequence_accession":  row["sequence_accessions"].strip(),
                "Protein_accession":   "",
                "Validation_method":   row["validation_method"].strip(),
                "PMID":                row["paper_pmid"].strip(),
                "Paper_title":         row["paper_title"].strip(),
                "Publication_year":    row["publication_year"].strip(),
                "Key_findings":        row["key_findings"].strip(),
                "Geographic_location": row["geographic_location"].strip(),
                "Notes":               row.get("notes", "").strip(),
            })
            out_rows += 1

    print(f"Done → {OUTPUT_CSV}  ({out_rows} rows)")


if __name__ == "__main__":
    main()
