#!/usr/bin/env python3
"""
Adds an organism_accession column to full_list_mutations_enriched_with_dna_accession.csv
by querying NCBI for the organism associated with each DNA_Accession value.

Strategy:
  1. Batch-esummary the nucleotide database to get TaxIds for all accessions.
  2. Batch-efetch the taxonomy database to get ScientificName for each TaxId.
  3. A local JSON cache avoids re-querying NCBI on re-runs.
"""

import csv
import json
import time
from pathlib import Path
from Bio import Entrez

INPUT_CSV  = Path(__file__).parent / "full_list_mutations_enriched_with_dna_accession.csv"
OUTPUT_CSV = Path(__file__).parent / "full_list_mutations_enriched_with_organism.csv"
CACHE_FILE = Path(__file__).parent / ".ncbi_organism_cache.json"

Entrez.email = "skulakis@gmail.com"
BATCH_SIZE = 200
SLEEP_SEC  = 0.4   # stay under the 3 req/s unauthenticated limit


# ── cache helpers ────────────────────────────────────────────────────────────

def load_cache() -> dict:
    """Cache structure: {"acc2taxid": {...}, "taxid2name": {...}}"""
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text())
    return {"acc2taxid": {}, "taxid2name": {}}


def save_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, indent=2))


# ── NCBI helpers ─────────────────────────────────────────────────────────────

def fetch_taxids(accessions: list[str], cache: dict) -> None:
    """Populate cache['acc2taxid'] for any accession not already cached."""
    acc2taxid: dict[str, str] = cache["acc2taxid"]
    to_fetch = [a for a in accessions if a not in acc2taxid]
    if not to_fetch:
        return

    print(f"Step 1 — fetching TaxIds for {len(to_fetch)} accession(s)…")
    for i in range(0, len(to_fetch), BATCH_SIZE):
        batch = to_fetch[i : i + BATCH_SIZE]
        print(f"  nucleotide esummary batch {i // BATCH_SIZE + 1}/{-(-len(to_fetch) // BATCH_SIZE)}"
              f"  ({batch[0]} … {batch[-1]})")
        try:
            handle = Entrez.esummary(db="nucleotide", id=",".join(batch), retmode="xml")
            records = Entrez.read(handle)
            handle.close()

            # Build a caption→taxid map from returned records
            caption_map: dict[str, str] = {}
            for rec in records:
                caption = rec.get("Caption", "").strip()   # e.g. "CP010781" (no version)
                raw_taxid = rec.get("TaxId", 0)
                taxid = str(int(raw_taxid)) if raw_taxid else ""
                if caption and taxid and taxid != "0":
                    caption_map[caption] = taxid

            # Map back to the original versioned accession
            for acc in batch:
                base = acc.split(".")[0]   # strip version
                taxid = caption_map.get(base, "")
                acc2taxid[acc] = taxid
                if not taxid:
                    print(f"    WARNING: no TaxId found for {acc}")

        except Exception as exc:
            print(f"  WARNING: batch failed ({exc}); retrying one-by-one…")
            for acc in batch:
                time.sleep(SLEEP_SEC)
                try:
                    h = Entrez.esummary(db="nucleotide", id=acc, retmode="xml")
                    recs = Entrez.read(h)
                    h.close()
                    if recs:
                        raw_taxid = recs[0].get("TaxId", 0)
                        taxid = str(int(raw_taxid)) if raw_taxid else ""
                        acc2taxid[acc] = taxid if taxid and taxid != "0" else ""
                    else:
                        acc2taxid[acc] = ""
                except Exception as inner_exc:
                    print(f"    WARNING: {acc} failed individually ({inner_exc})")
                    acc2taxid[acc] = ""
        time.sleep(SLEEP_SEC)

    save_cache(cache)


def fetch_organism_names(taxids: set[str], cache: dict) -> None:
    """Populate cache['taxid2name'] for any TaxId not already cached."""
    taxid2name: dict[str, str] = cache["taxid2name"]
    to_fetch = [t for t in taxids if t and t not in taxid2name]
    if not to_fetch:
        return

    print(f"Step 2 — fetching organism names for {len(to_fetch)} TaxId(s)…")
    for i in range(0, len(to_fetch), BATCH_SIZE):
        batch = to_fetch[i : i + BATCH_SIZE]
        print(f"  taxonomy efetch batch {i // BATCH_SIZE + 1}/{-(-len(to_fetch) // BATCH_SIZE)}")
        try:
            handle = Entrez.efetch(db="taxonomy", id=",".join(batch), retmode="xml")
            records = Entrez.read(handle)
            handle.close()
            for rec in records:
                raw_tid = rec.get("TaxId", 0)
                tid  = str(int(raw_tid)) if raw_tid else ""
                name = rec.get("ScientificName", "").strip()
                if tid:
                    taxid2name[tid] = name
        except Exception as exc:
            print(f"  WARNING: batch failed ({exc}); skipping")
            for tid in batch:
                taxid2name.setdefault(tid, "")
        time.sleep(SLEEP_SEC)

    save_cache(cache)


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    rows: list[dict] = []
    accessions: set[str] = set()

    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames[:]
        for row in reader:
            rows.append(row)
            acc = row["DNA_Accession"].strip()
            if acc:
                accessions.add(acc)

    print(f"Loaded {len(rows)} rows, {len(accessions)} unique accessions.")

    cache = load_cache()

    # Step 1: accession → TaxId
    fetch_taxids(sorted(accessions), cache)

    # Step 2: TaxId → scientific name
    all_taxids = set(cache["acc2taxid"].values())
    fetch_organism_names(all_taxids, cache)

    # Write output
    out_fields = fieldnames + ["organism_accession"]
    with open(OUTPUT_CSV, newline="", encoding="utf-8", mode="w") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields)
        writer.writeheader()
        for row in rows:
            acc    = row["DNA_Accession"].strip()
            taxid  = cache["acc2taxid"].get(acc, "")
            name   = cache["taxid2name"].get(taxid, "") if taxid else ""
            row["organism_accession"] = name
            writer.writerow(row)

    print(f"Done → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
