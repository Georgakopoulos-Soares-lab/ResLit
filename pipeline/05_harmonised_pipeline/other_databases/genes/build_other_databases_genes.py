#!/usr/bin/env python3
"""
Builds Full_list_genes_otherDatabases.csv from genes_databases_enriched.csv.

Key transformations
-------------------
- source_database (comma-separated) → one row per unique database
- sequence_accessions (pipe-separated) → classified as nucleotide or protein
  using NCBI accession format rules
- organisms_tested_in is empty for all rows → derived from the nucleotide
  accession (or protein accession if no nucleotide) via NCBI esummary/taxonomy,
  using a local JSON cache to avoid re-querying on reruns
"""

import csv
import json
import re
import time
from pathlib import Path
from Bio import Entrez

INPUT_CSV  = Path(__file__).parent / "genes_databases_enriched.csv"
OUTPUT_CSV = Path(__file__).parent / "Full_list_genes_otherDatabases.csv"
CACHE_FILE = Path(__file__).parent / ".ncbi_genes_organism_cache.json"

Entrez.email = "skulakis@gmail.com"
BATCH_SIZE = 200
SLEEP_SEC  = 0.4

OUT_FIELDS = [
    "Database",
    "Gene",
    "Allele",
    "Encodes",
    "Mechanism",
    "Resistance",
    "Organism",
    "Sequence_accession",
    "Protein_accession",
    "Validation_method",
    "PMID",
    "Paper_title",
    "Publication_year",
    "Key_findings",
    "Geographic_location",
    "Notes",
]

# ── accession classification ──────────────────────────────────────────────────
# Protein: 3-letter prefix + digits, or RefSeq protein prefixes (NP/XP/YP/WP)
_PROTEIN_RE = re.compile(r'^([A-Z]{3}\d+|[NXWY]P_\d+|WP_\d+)\.\d+$')
# Nucleotide: 1-2 letter prefix + digits, or RefSeq nucleotide prefixes
_NUC_RE     = re.compile(r'^([A-Z]{1,2}\d+|N[CGZRTWM]_\d+|NR_\d+)\.\d+$')
# Valid NCBI accession: must start with a letter, have digits, and a version (.N)
# Rejects numbers-only (000964), range notation (064726:101-988), etc.
_VALID_ACC_RE = re.compile(r'^[A-Z][\w_]*\d+\.\d+$')


def classify_accession(acc: str) -> str:
    """Return 'protein', 'nucleotide', or 'invalid'."""
    acc = acc.strip()
    if not _VALID_ACC_RE.match(acc):
        return "invalid"   # numbers-only, range notation, no version, etc.
    if _PROTEIN_RE.match(acc):
        return "protein"
    if _NUC_RE.match(acc):
        return "nucleotide"
    return "invalid"


def split_accessions(field: str) -> tuple[list[str], list[str]]:
    """Split pipe-separated accessions into (nucleotide_list, protein_list).
    Entries that don't match a valid NCBI accession format are silently dropped."""
    nuc, prot = [], []
    for acc in field.split("|"):
        acc = acc.strip()
        if not acc:
            continue
        kind = classify_accession(acc)
        if kind == "protein":
            prot.append(acc)
        elif kind == "nucleotide":
            nuc.append(acc)
        # 'invalid' → dropped entirely, no NCBI query attempted
    return nuc, prot


# ── database splitting ────────────────────────────────────────────────────────

def split_databases(field: str) -> list[str]:
    """Return unique, non-empty databases from a comma-separated field."""
    seen, result = set(), []
    for db in field.split(","):
        db = db.strip()
        if db and db not in seen:
            seen.add(db)
            result.append(db)
    return result if result else [""]


# ── NCBI helpers ──────────────────────────────────────────────────────────────

def load_cache() -> dict:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text())
    return {"acc2taxid": {}, "taxid2name": {}}


def save_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, indent=2))


def fetch_taxids(accessions: list[str], db_type: str, cache: dict) -> None:
    """Query NCBI esummary for TaxIds; db_type is 'nucleotide' or 'protein'."""
    acc2taxid: dict = cache["acc2taxid"]
    to_fetch = [a for a in accessions if a not in acc2taxid]
    if not to_fetch:
        return

    n_batches = -(-len(to_fetch) // BATCH_SIZE)
    print(f"  Fetching TaxIds ({db_type}) for {len(to_fetch)} accession(s) in {n_batches} batch(es)…")
    for i in range(0, len(to_fetch), BATCH_SIZE):
        batch      = to_fetch[i : i + BATCH_SIZE]
        batch_num  = i // BATCH_SIZE + 1
        print(f"  [{db_type}] batch {batch_num}/{n_batches}  ({batch[0]} … {batch[-1]})", flush=True)
        try:
            handle  = Entrez.esummary(db=db_type, id=",".join(batch), retmode="xml")
            records = Entrez.read(handle)
            handle.close()
            caption_map: dict[str, str] = {}
            for rec in records:
                caption = rec.get("Caption", "").strip()
                raw     = rec.get("TaxId", 0)
                taxid   = str(int(raw)) if raw else ""
                if caption and taxid and taxid != "0":
                    caption_map[caption] = taxid
            for acc in batch:
                base  = acc.split(".")[0]
                taxid = caption_map.get(base, "")
                acc2taxid[acc] = taxid
            print(f"    → {sum(1 for a in batch if acc2taxid.get(a))} TaxIds resolved", flush=True)
        except Exception as exc:
            # Binary-split the batch to isolate bad accessions quickly
            # instead of retrying all 200 one-by-one
            print(f"    Batch failed ({exc}); binary-splitting to isolate bad UIDs…", flush=True)
            queue = [batch]
            while queue:
                chunk = queue.pop()
                if len(chunk) == 1:
                    # Single accession — mark as invalid and move on
                    print(f"    Invalid UID: {chunk[0]}", flush=True)
                    acc2taxid[chunk[0]] = ""
                    continue
                time.sleep(SLEEP_SEC)
                try:
                    h    = Entrez.esummary(db=db_type, id=",".join(chunk), retmode="xml")
                    recs = Entrez.read(h)
                    h.close()
                    cmap: dict[str, str] = {}
                    for rec in recs:
                        cap = rec.get("Caption", "").strip()
                        raw = rec.get("TaxId", 0)
                        tid = str(int(raw)) if raw else ""
                        if cap and tid and tid != "0":
                            cmap[cap] = tid
                    for acc in chunk:
                        acc2taxid[acc] = cmap.get(acc.split(".")[0], "")
                except Exception:
                    # Split further
                    mid = len(chunk) // 2
                    queue.append(chunk[:mid])
                    queue.append(chunk[mid:])
        time.sleep(SLEEP_SEC)
    save_cache(cache)
    print(f"  Done — cache saved ({len(acc2taxid)} entries total)", flush=True)


def fetch_organism_names(taxids: set[str], cache: dict) -> None:
    taxid2name: dict = cache["taxid2name"]
    to_fetch = [t for t in taxids if t and t not in taxid2name]
    if not to_fetch:
        return
    n_batches = -(-len(to_fetch) // BATCH_SIZE)
    print(f"  Fetching organism names for {len(to_fetch)} TaxId(s) in {n_batches} batch(es)…")
    for i in range(0, len(to_fetch), BATCH_SIZE):
        batch     = to_fetch[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        print(f"  [taxonomy] batch {batch_num}/{n_batches}", flush=True)
        try:
            handle  = Entrez.efetch(db="taxonomy", id=",".join(batch), retmode="xml")
            records = Entrez.read(handle)
            handle.close()
            for rec in records:
                raw  = rec.get("TaxId", 0)
                tid  = str(int(raw)) if raw else ""
                name = rec.get("ScientificName", "").strip()
                if tid:
                    taxid2name[tid] = name
        except Exception as exc:
            print(f"    Batch failed ({exc}); skipping", flush=True)
            for t in batch:
                taxid2name.setdefault(t, "")
        time.sleep(SLEEP_SEC)
    save_cache(cache)
    print(f"  Done — {len(taxid2name)} organism names cached", flush=True)


def resolve_organism(nuc_accs: list[str], prot_accs: list[str], cache: dict) -> str:
    """Return organism name via TaxId lookup; prefer nucleotide accessions."""
    acc2taxid: dict = cache["acc2taxid"]
    taxid2name: dict = cache["taxid2name"]
    for acc in nuc_accs + prot_accs:
        taxid = acc2taxid.get(acc, "")
        if taxid:
            name = taxid2name.get(taxid, "")
            if name:
                return name
    return ""


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    # 1. Load and expand rows
    raw_rows: list[dict] = []
    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            raw_rows.append(row)
    print(f"Loaded {len(raw_rows)} source rows.")

    # 2. Classify accessions and collect unique ones for NCBI lookup
    all_nuc_accs:  list[str] = []
    all_prot_accs: list[str] = []
    for row in raw_rows:
        nuc, prot = split_accessions(row["sequence_accessions"])
        row["_nuc_accs"]  = nuc
        row["_prot_accs"] = prot
        all_nuc_accs.extend(nuc)
        all_prot_accs.extend(prot)

    unique_nuc  = sorted(set(all_nuc_accs))
    unique_prot = sorted(set(all_prot_accs))
    print(f"Unique nucleotide accessions: {len(unique_nuc)}")
    print(f"Unique protein accessions:    {len(unique_prot)}")

    # 3. NCBI lookups
    cache = load_cache()
    print("\nStep 1 — nucleotide TaxIds…")
    fetch_taxids(unique_nuc, "nucleotide", cache)
    print("Step 2 — protein TaxIds…")
    fetch_taxids(unique_prot, "protein", cache)

    all_taxids = set(cache["acc2taxid"].values()) - {""}
    print(f"Step 3 — organism names for {len(all_taxids)} TaxId(s)…")
    fetch_organism_names(all_taxids, cache)

    # 4. Write output — one row per unique database per source row
    out_rows = 0
    with open(OUTPUT_CSV, newline="", encoding="utf-8", mode="w") as f:
        writer = csv.DictWriter(f, fieldnames=OUT_FIELDS)
        writer.writeheader()

        for row in raw_rows:
            nuc_accs  = row["_nuc_accs"]
            prot_accs = row["_prot_accs"]
            organism  = row["organisms_tested_in"].strip() or resolve_organism(
                nuc_accs, prot_accs, cache
            )

            databases = split_databases(row["source_database"])
            for db in databases:
                writer.writerow({
                    "Database":            db,
                    "Gene":                row["gene_name"].strip(),
                    "Allele":              row["allele"].strip(),
                    "Encodes":             row["encodes"].strip(),
                    "Mechanism":           row["mechanism"].strip(),
                    "Resistance":          row["confers_resistance_to"].strip(),
                    "Organism":            organism,
                    "Sequence_accession":  "|".join(nuc_accs),
                    "Protein_accession":   "|".join(prot_accs),
                    "Validation_method":   row["validation_method"].strip(),
                    "PMID":                row["paper_pmid"].strip(),
                    "Paper_title":         row["paper_title"].strip(),
                    "Publication_year":    row["publication_year"].strip(),
                    "Key_findings":        row["key_findings"].strip(),
                    "Geographic_location": row["geographic_location"].strip(),
                    "Notes":               row["notes"].strip(),
                })
                out_rows += 1

    print(f"\nDone → {OUTPUT_CSV}  ({out_rows} rows)")


if __name__ == "__main__":
    main()
