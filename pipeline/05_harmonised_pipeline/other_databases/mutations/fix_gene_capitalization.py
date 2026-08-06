#!/usr/bin/env python3
"""
Fixes Gene capitalization in Full_list_mutations_otherDatabases.csv by matching
against the reference gene names in Bacteria_genes_all.txt.

Both sides are normalized (lowercase, strip primes/quotes) before matching.
When a match is found, the gene name from Bacteria_genes_all.txt is used
(preserving its original capitalization).
"""

import csv
import re
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
REFERENCE_DATA = HERE.parent.parent / "reference_data"

INPUT_CSV = HERE / "Full_list_mutations_otherDatabases.csv"
GENES_FILE = REFERENCE_DATA / "Bacteria_genes_all.txt"
OUTPUT_CSV = HERE / "Full_list_mutations_otherDatabases.csv"


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


def build_gene_lookup(genes_file: Path) -> dict[str, str]:
    """Build a dict mapping normalized gene name -> original gene name.

    When duplicates exist (same normalized form, different original), the
    first occurrence wins — Bacteria_genes_all.txt is assumed to have the
    canonical form listed first or most frequently.
    """
    lookup: dict[str, str] = {}
    with open(genes_file, encoding="utf-8") as f:
        for line in f:
            original = line.strip()
            if not original:
                continue
            norm = normalize_gene_name(original)
            if norm not in lookup:
                lookup[norm] = original
    return lookup


def main():
    df = pd.read_csv(INPUT_CSV)

    unique_genes = df["Gene"].dropna().unique()
    print(f"Unique genes in CSV: {len(unique_genes)}")

    # Only load normalized forms of genes we actually need
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

    # Map each CSV gene to its corrected form
    matched = 0
    unmatched = []
    gene_map: dict[str, str] = {}

    for gene in unique_genes:
        norm = normalize_gene_name(gene)
        if norm in lookup:
            gene_map[gene] = lookup[norm]
            matched += 1
        else:
            gene_map[gene] = gene  # keep as-is
            unmatched.append(gene)

    print(f"Matched: {matched}/{len(unique_genes)}")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}):")
        for g in sorted(unmatched):
            print(f"  {g}")

    # Show changes
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
