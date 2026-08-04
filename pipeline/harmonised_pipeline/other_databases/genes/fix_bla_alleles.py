#!/usr/bin/env python3
import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

INPUT = str(HERE / "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated.csv")
OUTPUT = INPUT.replace(".csv", "_bla_fixed.csv")

fixed_count = 0
total_bla = 0

with open(INPUT, "r", newline="", encoding="utf-8") as fin, \
     open(OUTPUT, "w", newline="", encoding="utf-8") as fout:
    reader = csv.reader(fin)
    writer = csv.writer(fout, quoting=csv.QUOTE_ALL)

    header = next(reader)
    writer.writerow(header)

    gene_col = header.index("Gene")
    allele_col = header.index("Allele")

    for row in reader:
        gene = row[gene_col]
        allele = row[allele_col]

        if gene.lower().startswith("bla"):
            total_bla += 1
            if not allele.lower().startswith("bla"):
                row[allele_col] = "bla" + allele
                fixed_count += 1

        writer.writerow(row)

print(f"Total bla* gene rows: {total_bla}")
print(f"Alleles fixed (bla prefix added): {fixed_count}")
print(f"Output: {OUTPUT}")
