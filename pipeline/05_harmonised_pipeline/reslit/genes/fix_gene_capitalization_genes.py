#!/usr/bin/env python3
"""
Fixes Gene/Allele capitalization in Full_list_genes_Reslit_harmonized.csv.

Two passes, in order:

  1. Frequency-based self-consistency fix (harmonize_allele_gene_by_frequency):
     groups rows by Allele reduced to letters+digits only, lowercase -- so
     "blaOXA-10", "blaoxa10", and "blaoxa - 10" all collapse to the same key
     "blaoxa10" -- and rewrites every row in a group to that group's most
     frequent exact Allele spelling, and its most frequent exact Gene
     spelling. Groups with a different key (genuinely different letters or
     numbers) are never merged with each other.

  2. Reference-based fix (unchanged from before): matches Gene against the
     reference gene names in Bacteria_genes_all.txt (lowercase + strip
     primes/quotes on both sides) and, where matched, replaces with the
     reference's original capitalization.
"""

import re
from collections import Counter
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent

INPUT_CSV = HERE / "Full_list_genes_Reslit_harmonized.csv"
GENES_FILE = HERE.parent.parent / "reference_data" / "Bacteria_genes_all.txt"
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


def loose_key(name):
    """Letters and digits only, lowercase -- collapses case/punctuation/spacing variants."""
    if pd.isna(name):
        return None
    key = re.sub(r"[^a-z0-9]", "", str(name).lower())
    return key or None


def harmonize_allele_gene_by_frequency(df):
    """
    Groups rows by loose_key(Allele). Within each group (>=2 rows sharing the
    same letters/numbers), rewrites Allele to the group's most frequent exact
    Allele spelling, and Gene to the group's most frequent exact Gene
    spelling. Rows with an empty/NaN Allele are left untouched and never
    merged into a group. Groups are only rewritten where there is actual
    variation to resolve.
    """
    groups: dict[str, list] = {}
    for idx, allele in df["Allele"].items():
        key = loose_key(allele)
        if key is None:
            continue
        groups.setdefault(key, []).append(idx)

    allele_rows_changed = 0
    gene_rows_changed = 0
    examples = []

    for key, idx_list in groups.items():
        if len(idx_list) < 2:
            continue

        allele_counts = Counter(df.loc[idx_list, "Allele"])
        canonical_allele = allele_counts.most_common(1)[0][0]
        allele_varies = len(allele_counts) > 1

        genes = df.loc[idx_list, "Gene"].dropna()
        gene_counts = Counter(genes) if len(genes) > 0 else None
        canonical_gene = gene_counts.most_common(1)[0][0] if gene_counts else None
        gene_varies = gene_counts is not None and len(gene_counts) > 1

        if allele_varies or gene_varies:
            examples.append((key, allele_counts, canonical_allele, gene_counts, canonical_gene))

        if allele_varies:
            allele_rows_changed += sum(c for v, c in allele_counts.items() if v != canonical_allele)
            df.loc[idx_list, "Allele"] = canonical_allele

        if gene_varies:
            gene_rows_changed += sum(c for v, c in gene_counts.items() if v != canonical_gene)
            df.loc[idx_list, "Gene"] = canonical_gene

    print(f"Frequency-based harmonization: {len(examples)} allele groups had spelling variants")
    print(f"  Allele values rewritten: {allele_rows_changed}")
    print(f"  Gene values rewritten: {gene_rows_changed}")
    if examples:
        print("  Examples (largest groups first):")
        examples.sort(key=lambda e: -sum(e[1].values()))
        for key, allele_counts, canon_allele, gene_counts, canon_gene in examples[:30]:
            allele_variants = ", ".join(f"{v!r}x{c}" for v, c in allele_counts.most_common())
            print(f"    key={key!r}: {allele_variants} -> Allele={canon_allele!r}", end="")
            if gene_counts:
                gene_variants = ", ".join(f"{v!r}x{c}" for v, c in gene_counts.most_common())
                print(f"  |  Gene: {gene_variants} -> Gene={canon_gene!r}")
            else:
                print()

    return df


def main():
    df = pd.read_csv(INPUT_CSV)

    df = harmonize_allele_gene_by_frequency(df)

    unique_genes = df["Gene"].dropna().unique()
    print(f"\nUnique genes in CSV: {len(unique_genes)}")

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
