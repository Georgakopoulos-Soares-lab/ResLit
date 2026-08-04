#!/usr/bin/env python3
"""
Harmonize gene and allele names in the Reslit file to match the casing
from the other databases file, using normalized name matching.
"""
import csv
import math
from collections import Counter

RESLIT = "/home/argis/Desktop/austin/reslit/site/paper/other_databases/comparison/genes/Full_list_genes_Reslit.csv"
OTHER_DB = "/home/argis/Desktop/austin/reslit/site/paper/other_databases/comparison/genes/Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv"
OUTPUT = RESLIT.replace(".csv", "_harmonized.csv")


def normalize_gene_name(name):
    if name is None or (isinstance(name, float) and math.isnan(name)):
        return name
    name = str(name).lower().strip()
    name = (name.replace('′', '')   # prime
                .replace('ʹ', '')   # modifier letter prime
                .replace('‘', '')   # left single quote
                .replace('’', '')   # right single quote
                .replace('`', '')        # backtick
                .replace('´', '')   # acute accent
                .replace("'", '')
                .replace('"', ''))
    return name


# --- Build lookup maps from the other databases file ---
# For genes: normalized_gene -> most common original gene name
# For alleles: (normalized_gene, normalized_allele) -> most common original allele
gene_counter = Counter()
allele_counter = Counter()

with open(OTHER_DB, "r", newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    header = next(reader)
    gene_col = header.index("Gene")
    allele_col = header.index("Allele")

    for row in reader:
        gene = row[gene_col]
        allele = row[allele_col]
        norm_gene = normalize_gene_name(gene)
        norm_allele = normalize_gene_name(allele)

        gene_counter[(norm_gene, gene)] += 1
        allele_counter[(norm_gene, norm_allele, allele)] += 1

# Pick the most frequent original form for each normalized gene
gene_map = {}
for (norm_gene, orig_gene), count in gene_counter.items():
    if norm_gene not in gene_map or count > gene_map[norm_gene][1]:
        gene_map[norm_gene] = (orig_gene, count)
gene_map = {k: v[0] for k, v in gene_map.items()}

# Pick the most frequent original form for each (normalized_gene, normalized_allele)
allele_map = {}
for (norm_gene, norm_allele, orig_allele), count in allele_counter.items():
    key = (norm_gene, norm_allele)
    if key not in allele_map or count > allele_map[key][1]:
        allele_map[key] = (orig_allele, count)
allele_map = {k: v[0] for k, v in allele_map.items()}

# --- Process Reslit file ---
genes_changed = 0
alleles_changed = 0
total_rows = 0

with open(RESLIT, "r", newline="", encoding="utf-8") as fin, \
     open(OUTPUT, "w", newline="", encoding="utf-8") as fout:
    reader = csv.reader(fin)
    writer = csv.writer(fout, quoting=csv.QUOTE_ALL)

    header = next(reader)
    writer.writerow(header)
    r_gene_col = header.index("Gene")
    r_allele_col = header.index("Allele")

    for row in reader:
        total_rows += 1
        orig_gene = row[r_gene_col]
        orig_allele = row[r_allele_col]
        norm_gene = normalize_gene_name(orig_gene)
        norm_allele = normalize_gene_name(orig_allele)

        # Replace gene name if a match exists
        if norm_gene in gene_map and orig_gene != gene_map[norm_gene]:
            row[r_gene_col] = gene_map[norm_gene]
            genes_changed += 1

        # Replace allele if both gene and allele match
        allele_key = (norm_gene, norm_allele)
        if allele_key in allele_map and orig_allele != allele_map[allele_key]:
            row[r_allele_col] = allele_map[allele_key]
            alleles_changed += 1

        writer.writerow(row)

print(f"Total Reslit rows: {total_rows}")
print(f"Gene names changed: {genes_changed}")
print(f"Allele names changed: {alleles_changed}")
print(f"Output: {OUTPUT}")
