#!/usr/bin/env python3
"""
Cleans Full_list_mutations_otherDatabases.csv:
  - Organism: keeps only recognized bacterial/fungal/parasite entries
  - Resistance: resolves to canonical names, normalizes to lowercase without
    special characters, deduplicates. Splits by '/', ',', '&' separators.
  - Nucleotide/Protein position validation (3x ±2 rule)
  - Drops rows with no recognized antibiotic in Resistance (except promoter mutations)
"""

import re
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
RESLIT_GENES_DIR = HERE.parent.parent / "reslit" / "genes"
REFERENCE_DATA = HERE.parent.parent / "reference_data"

# clean_organism_resistance.py lives in reslit/genes/ in this packaged layout.
sys.path.insert(0, str(RESLIT_GENES_DIR))

from clean_organism_resistance import (
    load_species,
    load_antibiotics,
    clean_organism,
    resolve_antibiotic,
    normalize_antibiotic,
)

INPUT_CSV = HERE / "Full_list_mutations_otherDatabases.csv"
SPECIES_FILE = REFERENCE_DATA / "available_species.txt"
ANTIBIOTICS_NAMES_FILE = REFERENCE_DATA / "antibiotics_names.txt"
ANTIBIOTICS_ABBREV_FILE = REFERENCE_DATA / "antibiotics_names_abreviations.txt"
OUTPUT_CSV = HERE / "Full_list_mutations_otherDatabases_clean.csv"

_PROMOTER_RE = re.compile(r"-\d")
_NUC_POS_RE = re.compile(r"[A-Za-z](-?\d+)[A-Za-z>]")
_PROT_POS_RE = re.compile(r"[A-Za-z](\d+)[A-Za-z]")


def is_promoter_mutation(nuc_change):
    if pd.isna(nuc_change) or not str(nuc_change).strip():
        return False
    return bool(_PROMOTER_RE.search(str(nuc_change)))


def validate_nuc_vs_prot(nuc_change, prot_change):
    if pd.isna(nuc_change) or pd.isna(prot_change):
        return True
    nuc_m = _NUC_POS_RE.search(str(nuc_change))
    prot_m = _PROT_POS_RE.search(str(prot_change))
    if not nuc_m or not prot_m:
        return True
    nuc_pos = int(nuc_m.group(1))
    prot_pos = int(prot_m.group(1))
    if prot_pos == 0:
        return True
    return abs(nuc_pos - 3 * prot_pos) <= 2


def clean_resistance_multi_sep(value, antibiotics_lookup):
    """Clean resistance values that use '/', ',', '&' as separators.

    Strategy: split by ',' and '&' first, then for each part try to resolve
    as a whole (handles combo drugs like AZTREONAM-AVIBACTAM). If that fails
    and the part contains '/', split by '/' and resolve each piece.
    """
    if pd.isna(value) or not str(value).strip():
        return ""
    value = str(value).strip()

    # Split by comma and ampersand
    parts = re.split(r"[,&]", value)

    seen = set()
    kept = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Try resolving the whole part first (handles combo drugs)
        canonical = resolve_antibiotic(part, antibiotics_lookup)
        if canonical is not None:
            normalized = normalize_antibiotic(canonical)
            if normalized and normalized not in seen:
                seen.add(normalized)
                kept.append(normalized)
            continue

        # If it contains '/', split and resolve each piece
        if "/" in part:
            for subpart in part.split("/"):
                subpart = subpart.strip()
                if not subpart:
                    continue
                canonical = resolve_antibiotic(subpart, antibiotics_lookup)
                if canonical is not None:
                    normalized = normalize_antibiotic(canonical)
                    if normalized and normalized not in seen:
                        seen.add(normalized)
                        kept.append(normalized)

    return "|".join(kept)


def main():
    print("Loading reference files...")
    species_set, genus_set, abbrev_map = load_species(SPECIES_FILE)
    print(f"  {len(species_set)} unique genus+species and {len(genus_set)} unique genera loaded")

    antibiotics_lookup = load_antibiotics(ANTIBIOTICS_NAMES_FILE, ANTIBIOTICS_ABBREV_FILE)
    print(f"  {len(antibiotics_lookup)} antibiotic name variants loaded")

    print(f"\nReading {INPUT_CSV.name}...")
    df = pd.read_csv(INPUT_CSV, low_memory=False)
    total_rows = len(df)
    print(f"  {total_rows} rows")

    # --- Clean Organism column ---
    print("\nCleaning Organism column...")
    org_before = df["Organism"].copy()
    df["Organism"] = df["Organism"].apply(
        lambda v: clean_organism(v, species_set, genus_set, abbrev_map)
    )

    org_changed = (org_before.fillna("") != df["Organism"].fillna("")).sum()
    org_emptied = ((org_before.fillna("") != "") & (df["Organism"] == "")).sum()
    print(f"  {org_changed} rows modified")
    print(f"  {org_emptied} rows had all organisms removed")

    removed_orgs = {}
    for before_val, after_val in zip(org_before.fillna(""), df["Organism"].fillna("")):
        before_set = {o.strip() for o in str(before_val).split("|") if o.strip()}
        after_set = {o.strip() for o in str(after_val).split("|") if o.strip()}
        for removed in before_set - after_set:
            removed_orgs[removed] = removed_orgs.get(removed, 0) + 1

    if removed_orgs:
        print(f"\n  Top 30 removed organisms:")
        for org, count in sorted(removed_orgs.items(), key=lambda x: -x[1])[:30]:
            print(f"    {count:5d}x  {org}")

    # --- Clean Resistance column ---
    print("\nCleaning Resistance column...")
    res_before = df["Resistance"].copy()
    df["Resistance"] = df["Resistance"].apply(
        lambda v: clean_resistance_multi_sep(v, antibiotics_lookup)
    )

    res_changed = (res_before.fillna("") != df["Resistance"].fillna("")).sum()
    res_emptied = ((res_before.fillna("") != "") & (df["Resistance"] == "")).sum()
    print(f"  {res_changed} rows modified")
    print(f"  {res_emptied} rows had all resistance values removed")

    removed_res = {}
    for before_val in res_before.fillna(""):
        for part in re.split(r"[|,/&]", str(before_val)):
            part = part.strip()
            if not part:
                continue
            if resolve_antibiotic(part, antibiotics_lookup) is None:
                removed_res[part.lower()] = removed_res.get(part.lower(), 0) + 1

    if removed_res:
        print(f"\n  Top 30 truly removed resistance values (not recognized):")
        for res, count in sorted(removed_res.items(), key=lambda x: -x[1])[:30]:
            print(f"    {count:5d}x  {res}")

    # --- Validate Nucleotide_Change vs Protein_Change positions ---
    print("\nValidating Nucleotide_Change positions against Protein_Change...")
    valid_mask = df.apply(
        lambda row: validate_nuc_vs_prot(row["Nucleotide_Change"], row["Protein_Change"]),
        axis=1,
    )
    invalid_count = (~valid_mask).sum()
    df.loc[~valid_mask, "Nucleotide_Change"] = ""
    print(f"  {invalid_count} rows had Nucleotide_Change cleared (position != 3x protein position ±2)")

    # --- Promoter mutation stats ---
    promoter_mask = df["Nucleotide_Change"].apply(is_promoter_mutation)
    res_empty = (df["Resistance"] == "") | df["Resistance"].isna()
    promoter_no_res = promoter_mask & res_empty
    print(f"\n  Promoter mutations (negative position): {promoter_mask.sum()}")
    print(f"  Promoter mutations with empty Resistance (OK): {promoter_no_res.sum()}")

    # --- Drop rows with empty Resistance (unless promoter mutation) ---
    before_drop = len(df)
    keep = ~res_empty | promoter_mask
    df = df[keep]
    dropped = before_drop - len(df)
    print(f"\n  Dropped {dropped} non-promoter rows with no recognized antibiotic in Resistance")
    print(f"  {len(df)} rows remaining")

    # Save
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"\nSaved to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
