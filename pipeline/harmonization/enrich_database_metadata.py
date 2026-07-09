#!/usr/bin/env python3
"""
enrich_database_metadata.py
=============================
Enriches a CSV with paper titles and publication years from PubMed.

Two strategies:
  1. Rows WITH paper_pmid but no title   → fetch title + year from PubMed
  2. Rows WITHOUT paper_pmid             → search for PMID via GenBank accession,
                                           then fetch title + year

Rows that already have both paper_title and publication_year are skipped.

Usage:
    python3 enrich_database_metadata.py input.csv output.csv
    python3 enrich_database_metadata.py mutations_all.csv mutations_all_enriched.csv --email you@email.com

Optional:
    --email   your@email.com   (recommended by NCBI policy)
    --api-key YOUR_NCBI_KEY    (10 req/s instead of 3 req/s)
"""

import sys
import csv
import time
import argparse
from pathlib import Path

try:
    from Bio import Entrez
except ImportError:
    print("❌ Biopython not installed. Run: pip install biopython")
    sys.exit(1)


# ── Entrez helpers ────────────────────────────────────────────────────────────

def is_valid_pmid(pmid: str) -> bool:
    return bool(str(pmid).strip().isdigit())


def fetch_pubmed_details(pmids: list, batch_size: int = 100) -> dict:
    """
    Fetch title and year for a list of PMIDs.
    Invalid PMIDs (non-numeric) are skipped.
    Falls back to per-PMID fetch if a batch fails.
    """
    results = {}
    pmids = [str(p).strip() for p in pmids if is_valid_pmid(str(p).strip())]
    if not pmids:
        return results

    for i in range(0, len(pmids), batch_size):
        batch = pmids[i:i + batch_size]
        try:
            handle = Entrez.esummary(db="pubmed", id=",".join(batch), retmode="xml")
            records = Entrez.read(handle)
            handle.close()
            for rec in records:
                pmid     = str(rec.get("Id", ""))
                title    = str(rec.get("Title", ""))
                pub_date = str(rec.get("PubDate", ""))
                year     = pub_date.split()[0] if pub_date else ""
                results[pmid] = {"title": title, "year": year}
            time.sleep(0.34)
        except Exception as e:
            print(f"  Warning: batch {i//batch_size + 1} failed ({e}), retrying one by one...")
            for pmid in batch:
                try:
                    handle = Entrez.esummary(db="pubmed", id=pmid, retmode="xml")
                    records = Entrez.read(handle)
                    handle.close()
                    for rec in records:
                        pid      = str(rec.get("Id", ""))
                        title    = str(rec.get("Title", ""))
                        pub_date = str(rec.get("PubDate", ""))
                        year     = pub_date.split()[0] if pub_date else ""
                        results[pid] = {"title": title, "year": year}
                    time.sleep(0.34)
                except Exception:
                    pass
    return results


def accession_to_pmid(accession: str) -> str:
    """Search PubMed directly for a GenBank accession number."""
    acc = accession.strip().split(".")[0]
    if not acc:
        return ""
    try:
        handle = Entrez.esearch(db="pubmed", term=f'"{acc}"[All Fields]', retmax=1)
        record = Entrez.read(handle)
        handle.close()
        ids = record.get("IdList", [])
        if ids:
            return str(ids[0])
        time.sleep(0.34)
    except Exception as e:
        print(f"    Warning: accession lookup error ({acc}): {e}")
        time.sleep(2)
    return ""


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input',     help='Input CSV')
    parser.add_argument('output',    help='Output CSV (enriched)')
    parser.add_argument('--email',   default='reslit@example.com',
                        help='Email for NCBI (required by their policy)')
    parser.add_argument('--api-key', default='',
                        help='NCBI API key (optional, 10 req/s)')
    args = parser.parse_args()

    Entrez.email   = args.email
    Entrez.api_key = args.api_key or None
    rate_sleep     = 0.11 if args.api_key else 0.34

    in_path  = Path(args.input)
    out_path = Path(args.output)

    if not in_path.exists():
        print(f'❌ File not found: {in_path}')
        sys.exit(1)

    # ── Read input ────────────────────────────────────────────────────────────
    print(f'📖 Reading {in_path.name}...')
    with open(in_path, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    print(f'  {len(rows):,} rows loaded')

    # ── Classify rows ─────────────────────────────────────────────────────────
    already_complete = []   # have both title and year — skip
    pmid_rows        = []   # (index, pmid) — have pmid, need title
    no_pmid_rows     = []   # (index, accession) — need pmid lookup

    for i, row in enumerate(rows):
        pmid  = str(row.get('paper_pmid',        '') or '').strip()
        title = str(row.get('paper_title',       '') or '').strip()
        year  = str(row.get('publication_year',  '') or '').strip()

        if title and year:
            already_complete.append(i)
            continue

        if is_valid_pmid(pmid):
            pmid_rows.append((i, pmid))
        else:
            accs = str(row.get('sequence_accessions', '') or '').strip()
            first_acc = accs.split('|')[0].strip() if accs else ''
            if first_acc:
                no_pmid_rows.append((i, first_acc))

    unique_pmids = list({p for _, p in pmid_rows})
    print(f'\n  {len(already_complete):,} rows already have title + year (skipped)')
    print(f'  {len(pmid_rows):,} rows have PMID, need title ({len(unique_pmids):,} unique PMIDs)')
    print(f'  {len(no_pmid_rows):,} rows have no PMID (will try GenBank accession lookup)')

    # ── Pass 1: fetch titles for known PMIDs ──────────────────────────────────
    if unique_pmids:
        print(f'\n🔍 Fetching PubMed titles for {len(unique_pmids):,} PMIDs...')
        pmid_details = fetch_pubmed_details(unique_pmids)
        print(f'  ✓ Got details for {len(pmid_details):,} PMIDs')

        for i, pmid in pmid_rows:
            details = pmid_details.get(pmid, {})
            if details.get('title'):
                rows[i]['paper_title']      = details['title']
                rows[i]['publication_year'] = details['year']

    # ── Pass 2: look up PMIDs via GenBank accession ───────────────────────────
    found_via_acc = 0
    if no_pmid_rows:
        print(f'\n🔍 Looking up PMIDs for {len(no_pmid_rows):,} rows via GenBank accession...')
        for n, (i, acc) in enumerate(no_pmid_rows, 1):
            if n % 100 == 0:
                print(f'  {n:,}/{len(no_pmid_rows):,}  found so far: {found_via_acc:,}', flush=True)
            pmid = ""
            for attempt in range(3):
                try:
                    pmid = accession_to_pmid(acc)
                    break
                except Exception:
                    time.sleep(2 ** attempt)
            time.sleep(rate_sleep)
            if pmid:
                rows[i]['paper_pmid'] = pmid
                found_via_acc += 1
                details = fetch_pubmed_details([pmid])
                d = details.get(pmid, {})
                rows[i]['paper_title']      = d.get('title', '')
                rows[i]['publication_year'] = d.get('year', '')
                time.sleep(rate_sleep)

        print(f'  ✓ Found PMIDs for {found_via_acc:,} / {len(no_pmid_rows):,} rows')

    # ── Write output ──────────────────────────────────────────────────────────
    print(f'\n💾 Writing to {out_path.name}...')
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    enriched = sum(1 for r in rows if r.get('paper_title'))
    print(f'✅ Done. {enriched:,} / {len(rows):,} rows now have a paper title.')


if __name__ == '__main__':
    main()