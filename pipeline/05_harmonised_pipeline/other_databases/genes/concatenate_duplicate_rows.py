import csv
from collections import defaultdict, OrderedDict
from pathlib import Path

HERE = Path(__file__).resolve().parent

INPUT_FILE = HERE / "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered.csv"
OUTPUT_FILE = HERE / "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated.csv"

GROUP_KEYS = ("Database", "Gene", "Allele", "Protein_accession")

groups = OrderedDict()
fieldnames = None

with open(INPUT_FILE, "r") as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        key = tuple(row[k] for k in GROUP_KEYS)
        if key not in groups:
            groups[key] = []
        groups[key].append(row)

merge_cols = [c for c in fieldnames if c not in GROUP_KEYS]

merged_count = 0
with open(OUTPUT_FILE, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()

    for key, rows in groups.items():
        if len(rows) == 1:
            writer.writerow(rows[0])
            continue

        merged_count += 1
        merged_row = dict(rows[0])

        for col in merge_cols:
            values = []
            seen = set()
            for row in rows:
                val = row[col].strip()
                if val and val not in seen:
                    seen.add(val)
                    values.append(val)
            merged_row[col] = ", ".join(values)

        writer.writerow(merged_row)

total_input = sum(len(r) for r in groups.values())
total_output = len(groups)
print(f"Input rows: {total_input}")
print(f"Output rows: {total_output}")
print(f"Groups merged: {merged_count}")
print(f"Rows reduced by: {total_input - total_output}")
print(f"Output written to: {OUTPUT_FILE}")
