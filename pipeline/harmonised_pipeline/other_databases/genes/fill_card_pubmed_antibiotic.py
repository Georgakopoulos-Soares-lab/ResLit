#!/usr/bin/env python3
"""
For Card Database rows in the final genes file that are missing PMID and/or
Resistance, look up their ARO number (carried in the Notes column) against
genes_annotation_databases.csv -- the earlier, pre-fanout merge of CARD/
ResFinder/Reference Gene Catalog -- and backfill PMID from pubmed_reference
and Resistance (antibiotic class) from subclass. Already-populated fields
are left untouched; non-Card rows pass through unchanged.
"""
import csv
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent

INPUT_FILE = str(HERE / "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv")
ANNOTATION_FILE = str(HERE / "genes_annotation_databases.csv")
OUTPUT_FILE = INPUT_FILE.replace(".csv", "_pubmed_antibiotic_corrected.csv")

ARO_RE = re.compile(r"ARO:\d+")


def split_clean(value, drop=("-",)):
    if not value:
        return []
    out = []
    seen = set()
    for tok in value.split(","):
        tok = tok.strip()
        if tok and tok not in drop and tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


# --- Build ARO -> {pmids, subclasses} index from genes_annotation_databases.csv ---
aro_pmids = defaultdict(list)
aro_subclasses = defaultdict(list)

with open(ANNOTATION_FILE, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter="\t")
    for row in reader:
        for aro in ARO_RE.findall(row.get("Notes", "") or ""):
            for pmid in split_clean(row.get("pubmed_reference", "")):
                if pmid not in aro_pmids[aro]:
                    aro_pmids[aro].append(pmid)
            for subclass in split_clean(row.get("subclass", "")):
                if subclass not in aro_subclasses[aro]:
                    aro_subclasses[aro].append(subclass)

print(f"Indexed {len(set(aro_pmids) | set(aro_subclasses))} unique ARO numbers from {ANNOTATION_FILE}")

# --- Pass over the final genes file, filling blanks for Card Database rows ---
card_rows = 0
targeted_rows = 0
pmid_filled = 0
resistance_filled = 0
pmid_still_missing = 0
resistance_still_missing = 0
no_aro_match = 0

with open(INPUT_FILE, newline="", encoding="utf-8") as fin, \
     open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as fout:
    reader = csv.DictReader(fin)
    writer = csv.DictWriter(fout, fieldnames=reader.fieldnames, quoting=csv.QUOTE_ALL)
    writer.writeheader()

    for row in reader:
        if row["Database"] == "Card Database":
            card_rows += 1
            missing_pmid = not row["PMID"].strip()
            missing_resistance = not row["Resistance"].strip()

            if missing_pmid or missing_resistance:
                targeted_rows += 1
                aro_tokens = ARO_RE.findall(row.get("Notes", "") or "")

                pmids, subclasses = [], []
                for aro in aro_tokens:
                    for pmid in aro_pmids.get(aro, []):
                        if pmid not in pmids:
                            pmids.append(pmid)
                    for subclass in aro_subclasses.get(aro, []):
                        if subclass not in subclasses:
                            subclasses.append(subclass)

                if not pmids and not subclasses:
                    no_aro_match += 1

                if missing_pmid:
                    if pmids:
                        row["PMID"] = pmids[0]
                        pmid_filled += 1
                    else:
                        pmid_still_missing += 1

                if missing_resistance:
                    if subclasses:
                        row["Resistance"] = "|".join(subclasses)
                        resistance_filled += 1
                    else:
                        resistance_still_missing += 1

        writer.writerow(row)

print(f"Card Database rows: {card_rows}")
print(f"Card rows missing PMID and/or Resistance: {targeted_rows}")
print(f"PMID filled: {pmid_filled} (still missing after lookup: {pmid_still_missing})")
print(f"Resistance filled: {resistance_filled} (still missing after lookup: {resistance_still_missing})")
print(f"Targeted rows with no ARO match at all in annotation file: {no_aro_match}")
print(f"Output: {OUTPUT_FILE}")
