#!/usr/bin/env python3
"""
Second pass on Full_list_genes_otherDatabases.csv.
For rows where Organism is empty, queries NCBI protein database
using the Protein_accession column and fills in the organism name.

v3 changes:
  - Retry-safe caching: a previously failed lookup no longer blocks
    retries on later runs (toggle RETRY_FAILED to change this).
  - NEW: accessions that ESummary rejects as "Invalid uid" (common for
    newer WGS/Pathogen-Detection-pipeline protein accessions, e.g. the
    3-letter-prefix style like HDK.../EAB...) are retried via EFetch in
    GenPept format, which resolves them through a different backend
    and reads the organism name straight out of the record — no TaxID
    round-trip needed for these.
  - Unresolved accessions (after both paths) are logged with reasons.
"""

import csv
import io
import json
import time
from pathlib import Path
from Bio import Entrez, SeqIO

INPUT_CSV      = Path(__file__).parent / "Full_list_genes_otherDatabases.csv"
OUTPUT_CSV     = Path(__file__).parent / "Full_list_genes_otherDatabases.csv"  # overwrite in place
CACHE_FILE     = Path(__file__).parent / ".ncbi_genes_organism_cache.json"
UNRESOLVED_LOG = Path(__file__).parent / "unresolved_protein_accessions.csv"

Entrez.email = "skulakis@gmail.com"
BATCH_SIZE        = 200   # esummary batch size
EFETCH_BATCH_SIZE = 50    # smaller, since gp records are heavier than docsums
SLEEP_SEC         = 0.4
RETRY_FAILED      = True  # if True, accessions cached as "" / unresolved are retried each run


def load_cache() -> dict:
    if CACHE_FILE.exists():
        cache = json.loads(CACHE_FILE.read_text())
    else:
        cache = {}
    cache.setdefault("acc2taxid", {})
    cache.setdefault("taxid2name", {})
    cache.setdefault("acc2organism_fallback", {})  # accession -> organism name, bypassing taxid
    return cache


def save_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, indent=2))


def fetch_taxids_protein(accessions: list[str], cache: dict, fail_reasons: dict) -> list[str]:
    """Resolve accessions via ESummary. Returns the list of accessions still
    unresolved afterwards (candidates for the EFetch fallback)."""
    acc2taxid = cache["acc2taxid"]

    if RETRY_FAILED:
        to_fetch = [a for a in accessions if not acc2taxid.get(a)]
    else:
        to_fetch = [a for a in accessions if a not in acc2taxid]

    if not to_fetch:
        print("All protein accessions already in cache.")
        return [a for a in accessions if not acc2taxid.get(a)]

    n_batches = -(-len(to_fetch) // BATCH_SIZE)
    print(f"Fetching TaxIds (protein) for {len(to_fetch)} accession(s) in {n_batches} batch(es)…")

    for i in range(0, len(to_fetch), BATCH_SIZE):
        batch     = to_fetch[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        print(f"  [protein] batch {batch_num}/{n_batches}  ({batch[0]} … {batch[-1]})", flush=True)
        try:
            handle  = Entrez.esummary(db="protein", id=",".join(batch), retmode="xml")
            records = Entrez.read(handle)
            handle.close()
            caption_map: dict[str, str] = {}
            accver_map: dict[str, str] = {}
            for rec in records:
                caption = rec.get("Caption", "").strip()
                accver  = rec.get("AccessionVersion", "").strip()
                raw     = rec.get("TaxId", 0)
                taxid   = str(int(raw)) if raw else ""
                if caption and taxid and taxid != "0":
                    caption_map[caption] = taxid
                if accver and taxid and taxid != "0":
                    accver_map[accver] = taxid
            for acc in batch:
                base  = acc.split(".")[0]
                taxid = accver_map.get(acc) or caption_map.get(base, "")
                acc2taxid[acc] = taxid
                if taxid:
                    fail_reasons.pop(acc, None)
                else:
                    fail_reasons[acc] = "not_in_esummary_response"
            resolved = sum(1 for a in batch if acc2taxid.get(a))
            print(f"    → {resolved}/{len(batch)} TaxIds resolved", flush=True)
        except Exception as exc:
            print(f"    Batch failed ({exc}); binary-splitting…", flush=True)
            queue = [batch]
            while queue:
                chunk = queue.pop()
                if len(chunk) == 1:
                    print(f"    Invalid UID: {chunk[0]}", flush=True)
                    acc2taxid[chunk[0]] = ""
                    fail_reasons[chunk[0]] = "esummary_invalid_uid"
                    continue
                time.sleep(SLEEP_SEC)
                try:
                    h    = Entrez.esummary(db="protein", id=",".join(chunk), retmode="xml")
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
                        tid = cmap.get(acc.split(".")[0], "")
                        acc2taxid[acc] = tid
                        if tid:
                            fail_reasons.pop(acc, None)
                        else:
                            fail_reasons[acc] = "not_in_esummary_response"
                except Exception:
                    mid = len(chunk) // 2
                    queue.append(chunk[:mid])
                    queue.append(chunk[mid:])
        time.sleep(SLEEP_SEC)

    save_cache(cache)
    print(f"  Cache saved ({len(acc2taxid)} acc2taxid entries total)", flush=True)
    return [a for a in accessions if not acc2taxid.get(a)]


def fetch_organism_names(taxids: set[str], cache: dict) -> None:
    taxid2name = cache["taxid2name"]
    to_fetch   = [t for t in taxids if t and t not in taxid2name]
    if not to_fetch:
        print("All TaxIds already in cache.")
        return

    n_batches = -(-len(to_fetch) // BATCH_SIZE)
    print(f"Fetching organism names for {len(to_fetch)} TaxId(s) in {n_batches} batch(es)…")
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
    print(f"  Cache saved ({len(taxid2name)} taxid2name entries total)", flush=True)


def fetch_organism_via_efetch_fallback(accessions: list[str], cache: dict, fail_reasons: dict) -> None:
    """For accessions ESummary couldn't resolve, fetch the GenPept record
    directly via EFetch and read the organism name out of it."""
    fallback = cache["acc2organism_fallback"]

    if RETRY_FAILED:
        to_fetch = [a for a in accessions if not fallback.get(a)]
    else:
        to_fetch = [a for a in accessions if a not in fallback]

    if not to_fetch:
        print("No accessions need the EFetch fallback.")
        return

    n_batches = -(-len(to_fetch) // EFETCH_BATCH_SIZE)
    print(f"EFetch/GenPept fallback for {len(to_fetch)} accession(s) in {n_batches} batch(es)…")

    for i in range(0, len(to_fetch), EFETCH_BATCH_SIZE):
        batch     = to_fetch[i : i + EFETCH_BATCH_SIZE]
        batch_num = i // EFETCH_BATCH_SIZE + 1
        print(f"  [efetch-gp] batch {batch_num}/{n_batches}  ({batch[0]} … {batch[-1]})", flush=True)

        def resolve_chunk(chunk: list[str]) -> None:
            try:
                handle = Entrez.efetch(db="protein", id=",".join(chunk), rettype="gp", retmode="text")
                text   = handle.read()
                handle.close()
                found_ids = set()
                for rec in SeqIO.parse(io.StringIO(text), "genbank"):
                    organism = rec.annotations.get("organism", "").strip()
                    if not organism:
                        continue
                    rec_id   = rec.id  # usually ACCESSION.VERSION
                    rec_base = rec_id.split(".")[0]
                    found_ids.add(rec_id)
                    found_ids.add(rec_base)
                    for acc in chunk:
                        if acc == rec_id or acc.split(".")[0] == rec_base:
                            fallback[acc] = organism
                            fail_reasons.pop(acc, None)
                for acc in chunk:
                    if not fallback.get(acc):
                        if acc not in found_ids and acc.split(".")[0] not in found_ids:
                            fallback.setdefault(acc, "")
                            fail_reasons[acc] = "efetch_no_record_returned"
            except Exception as exc:
                if len(chunk) == 1:
                    print(f"    EFetch failed for {chunk[0]}: {exc}", flush=True)
                    fallback[chunk[0]] = ""
                    fail_reasons[chunk[0]] = "efetch_withdrawn_or_unavailable"
                else:
                    mid = len(chunk) // 2
                    time.sleep(SLEEP_SEC)
                    resolve_chunk(chunk[:mid])
                    time.sleep(SLEEP_SEC)
                    resolve_chunk(chunk[mid:])

        resolve_chunk(batch)
        resolved = sum(1 for a in batch if fallback.get(a))
        print(f"    → {resolved}/{len(batch)} organisms resolved via EFetch fallback", flush=True)
        time.sleep(SLEEP_SEC)

    save_cache(cache)
    print(f"  Cache saved ({len(fallback)} fallback entries total)", flush=True)


def main() -> None:
    rows: list[dict] = []
    fieldnames: list[str] = []
    missing_protein_accs: set[str] = set()
    acc_to_rows: dict[str, list[int]] = {}

    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        reader     = csv.DictReader(f)
        fieldnames = reader.fieldnames[:]
        for idx, row in enumerate(reader):
            rows.append(row)
            if not row["Organism"].strip():
                for acc in row["Protein_accession"].split("|"):
                    acc = acc.strip()
                    if acc:
                        missing_protein_accs.add(acc)
                        acc_to_rows.setdefault(acc, []).append(idx)

    print(f"Loaded {len(rows)} rows.")
    empty_before = sum(1 for r in rows if not r["Organism"].strip())
    print(f"Rows with empty organism: {empty_before}")
    print(f"Unique protein accessions to query: {len(missing_protein_accs)}")

    if not missing_protein_accs:
        print("Nothing to do.")
        return

    cache = load_cache()
    fail_reasons: dict[str, str] = {}

    still_unresolved = fetch_taxids_protein(sorted(missing_protein_accs), cache, fail_reasons)

    all_taxids = set(cache["acc2taxid"].values()) - {""}
    fetch_organism_names(all_taxids, cache)

    # Fallback pass for anything ESummary couldn't resolve
    if still_unresolved:
        fetch_organism_via_efetch_fallback(sorted(still_unresolved), cache, fail_reasons)

    acc2taxid  = cache["acc2taxid"]
    taxid2name = cache["taxid2name"]
    fallback   = cache["acc2organism_fallback"]
    filled = 0

    for row in rows:
        if row["Organism"].strip():
            continue
        for acc in row["Protein_accession"].split("|"):
            acc   = acc.strip()
            taxid = acc2taxid.get(acc, "")
            name  = taxid2name.get(taxid, "") if taxid else ""
            if not name:
                name = fallback.get(acc, "")
            if name:
                row["Organism"] = name
                filled += 1
                break

    with open(OUTPUT_CSV, newline="", encoding="utf-8", mode="w") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    empty_after = sum(1 for r in rows if not r["Organism"].strip())
    print(f"\nFilled {filled} previously empty organism fields.")
    print(f"Remaining empty: {empty_after}")

    final_unresolved = [
        a for a in missing_protein_accs
        if not acc2taxid.get(a) and not fallback.get(a)
    ]
    if final_unresolved:
        with open(UNRESOLVED_LOG, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["Protein_accession", "reason", "example_row_index"])
            for acc in sorted(final_unresolved):
                reason      = fail_reasons.get(acc, "unknown")
                example_row = acc_to_rows.get(acc, [""])[0]
                w.writerow([acc, reason, example_row])
        print(f"{len(final_unresolved)} accessions still unresolved — see {UNRESOLVED_LOG.name}")
    print(f"Done → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()