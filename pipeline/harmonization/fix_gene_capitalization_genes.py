#!/usr/bin/env python3
"""
Fixes Gene capitalization in Full_list_genes_Reslit_harmonized.csv by matching
against the reference gene names in Bacteria_genes_all.txt.

Both sides are normalized (lowercase, strip primes/quotes) before matching.
When a match is found, the gene name from Bacteria_genes_all.txt is used
(preserving its original capitalization).
"""

import csv
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent

INPUT_CSV = HERE / "Full_list_genes_Reslit_harmonized.csv"
GENES_FILE = HERE / "Bacteria_genes_all.txt"
OUTPUT_CSV = HERE / "Full_list_genes_Reslit_harmonized.csv"


def normalize_gene_name(name):
    if pd.isna(name):
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


def main():
    df = pd.read_csv(INPUT_CSV)

    unique_genes = df["Gene"].dropna().unique()
    print(f"Unique genes in CSV: {len(unique_genes)}")

    needed_norms = {normalize_gene_name(g) for g in unique_genes}

    print(f"Loading reference gene names from {GENES_FILE.name}...")
    lookup: dict[str, str] = {}
    with open(GENES_FILE, encoding="utf-8") as f:
        for line in f:
            original = line.strip()
            if not original:
                continue
            norm = normalize_gene_name(original)
            if norm in needed_norms and norm not in lookup:
                lookup[norm] = original

    matched = 0
    unmatched = []
    gene_map: dict[str, str] = {}

    for gene in unique_genes:
        norm = normalize_gene_name(gene)
        if norm in lookup:
            gene_map[gene] = lookup[norm]
            matched += 1
        else:
            gene_map[gene] = gene
            unmatched.append(gene)

    print(f"Matched: {matched}/{len(unique_genes)}")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}):")
        for g in sorted(unmatched):
            print(f"  {g}")

    changes = {k: v for k, v in gene_map.items() if k != v}
    if changes:
        print(f"\nGene name changes ({len(changes)}):")
        for old, new in sorted(changes.items()):
            print(f"  {old:30s} -> {new}")

    df["Gene"] = df["Gene"].map(gene_map).fillna(df["Gene"])
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"\nSaved to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
