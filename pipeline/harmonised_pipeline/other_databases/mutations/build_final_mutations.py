#!/usr/bin/env python3
"""
Builds Full_list_mutations_otherDatabases.csv from
full_list_mutations_enriched_with_organism.csv.

Column mapping
--------------
Database         ← Database
Nucleotide_Change← Change  (only when TypeGene == NUC, else empty)
Protein_Change   ← Change  (only when TypeGene == AA,  else empty)
Gene             ← Gene_normalized
Encodes          ← NULL
Mechanism        ← Mechanism
Resistance       ← Resistance
Organism         ← organism_accession (first two words: genus + species)
Validated_by     ← NULL
Notes            ← Notes; CARD rows also append "CARD accession: CARD:XXXXX"
Accession        ← DNA_Accession
PMID             ← paper_pmid
Paper_title      ← paper_title
Publication_year ← publication_year
Origin           ← NULL
"""

import csv
from pathlib import Path

INPUT_CSV  = Path(__file__).parent / "full_list_mutations_enriched_with_organism.csv"
OUTPUT_CSV = Path(__file__).parent / "Full_list_mutations_otherDatabases.csv"

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
    "Accession",
    "PMID",
    "Paper_title",
    "Publication_year",
    "Origin",
]


def first_two_words(text: str) -> str:
    """Return the first two whitespace-separated words, or the whole string if fewer."""
    parts = text.strip().split()
    return " ".join(parts[:2]) if len(parts) >= 2 else text.strip()


def build_notes(row: dict) -> str:
    base = row["Notes"].strip()
    if row["Database"] == "CARD":
        card_tag = f"CARD accession: {row['Gene_accession'].strip()}"
        return f"{base}; {card_tag}" if base else card_tag
    return base


def main() -> None:
    with (
        open(INPUT_CSV, newline="", encoding="utf-8") as fin,
        open(OUTPUT_CSV, newline="", encoding="utf-8", mode="w") as fout,
    ):
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=OUT_FIELDS)
        writer.writeheader()

        for row in reader:
            type_gene = row["TypeGene"].strip()
            change    = row["Change"].strip()

            writer.writerow({
                "Database":          row["Database"].strip(),
                "Nucleotide_Change": change if type_gene == "NUC" else "",
                "Protein_Change":    change if type_gene == "AA"  else "",
                "Gene":              row["Gene_normalized"].strip(),
                "Encodes":           "",
                "Mechanism":         row["Mechanism"].strip(),
                "Resistance":        row["Resistance"].strip(),
                "Organism":          first_two_words(row["organism_accession"]),
                "Validated_by":      "",
                "Notes":             build_notes(row),
                "Accession":         row["DNA_Accession"].strip(),
                "PMID":              row["paper_pmid"].strip(),
                "Paper_title":       row["paper_title"].strip(),
                "Publication_year":  row["publication_year"].strip(),
                "Origin":            "",
            })

    print(f"Done → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
