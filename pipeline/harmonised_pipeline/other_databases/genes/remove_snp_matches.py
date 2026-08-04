import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

SNP_FILE = HERE.parent.parent / "reference_data" / "card" / "snps.txt"
CSV_FILE = HERE / "Full_list_genes_otherDatabases_AlleleCorrected-1.csv"
OUTPUT_FILE = HERE / "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered.csv"

card_short_names = set()
with open(SNP_FILE, "r") as f:
    reader = csv.DictReader(f, delimiter="\t")
    for row in reader:
        name = row["CARD Short Name"].strip()
        if name:
            card_short_names.add(name.lower())

print(f"Loaded {len(card_short_names)} unique CARD Short Names from snps.txt")

kept = 0
removed = 0

with open(CSV_FILE, "r") as infile, open(OUTPUT_FILE, "w", newline="") as outfile:
    reader = csv.DictReader(infile)
    writer = csv.DictWriter(outfile, fieldnames=reader.fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()

    for row in reader:
        gene = row["Gene"].strip().lower()
        allele = row["Allele"].strip().lower()

        if gene in card_short_names or allele in card_short_names:
            removed += 1
        else:
            writer.writerow(row)
            kept += 1

print(f"Removed: {removed}")
print(f"Kept: {kept}")
print(f"Output written to: {OUTPUT_FILE}")
