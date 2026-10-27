#!/usr/bin/env python3
"""
Fetch PubMed Publication Types for every paper in the ResLit release and label
each one Review or Research Article.

PMIDs come from all four release CSVs in site/scripts/seed-data/: ResLit
genes and mutations, and the CARD / ResFinder / NCBI RGC reference genes and
mutations. Multi-PMID cells are split on , and ; and non-numeric values are
ignored. Each paper's sources (ResLit, CARD, ResFinder, NCBI RGC) are kept, so
ResLit evidence papers and reference-database papers can be told apart. Publication types are fetched from NCBI
E-utilities (efetch, PubMed XML) in batches.

Paper_Type rule:
  Review            PubMed lists "Review" or "Systematic Review"
  Research Article  anything else
  (not found)       PMID not returned by PubMed (deleted/merged records)
The full list of PubMed types is kept in the output, so other groupings
(e.g. Letter, Case Reports, Comment) can be made later without refetching.

Progress is cached in pubmed_cache.jsonl after every batch, so an
interrupted run resumes where it stopped.

Usage:
    python fetch_pubmed_paper_types.py --email you@example.com [--api-key KEY]
                                       [--repo /path/to/ResLit/repo] [--limit N]

NCBI asks for an email address with every request. Without an API key the
limit is 3 requests/second; with one (or NCBI_API_KEY set) it is 10.

Outputs (in this folder):
  pubmed_paper_types.csv  pmid, paper_type, sources, in_reslit, publication_types,
                          title, journal, year
  not_found_pmids.txt     PMIDs PubMed did not return
"""

import argparse
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
DEFAULT_REPO = HERE.parents[1]  # archive root
SEED_DATA = Path("website/scripts/seed-data")
# (path, fixed source label or None to use each row's Database column)
INPUTS = [
    (SEED_DATA / "Full_list_genes_Reslit_harmonized_antib_bact.csv", "ResLit"),
    (SEED_DATA / "Full_list_mutations_Reslit_antib_bact.csv", "ResLit"),
    (SEED_DATA / "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv", None),
    (SEED_DATA / "Full_list_mutations_otherDatabases_clean.csv", None),
]
# Reference database labels in the CSVs -> the names used in the manuscript
SOURCE_NAMES = {
    "Card Database": "CARD", "CARD": "CARD",
    "ResFinder Database": "ResFinder", "ResFinder": "ResFinder",
    "Reference Gene Catalog": "NCBI RGC", "AMRFinder": "NCBI RGC",
}
SOURCE_ORDER = ["ResLit", "CARD", "ResFinder", "NCBI RGC"]
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
BATCH_SIZE = 200
MAX_RETRIES = 5
REVIEW_TYPES = {"Review", "Systematic Review"}

CACHE = HERE / "pubmed_cache.jsonl"
OUTPUT = HERE / "pubmed_paper_types.csv"
NOT_FOUND = HERE / "not_found_pmids.txt"


def read_pmids(repo):
    """Every PMID in the release, mapped to the sources that cite it."""
    sources = {}
    for rel, fixed in INPUTS:
        df = pd.read_csv(repo / rel, dtype=str, keep_default_na=False)
        labels = [fixed] * len(df) if fixed else [SOURCE_NAMES[d.strip()] for d in df["Database"]]
        for cell, label in zip(df["PMID"], labels):
            for p in re.split(r"[,;]", cell):
                if p.strip().isdigit():
                    sources.setdefault(p.strip(), set()).add(label)
    return sources


def load_cache():
    """Records already fetched, keyed by PMID ({"pmid": ..., "found": False} for misses)."""
    done = {}
    if CACHE.exists():
        for line in CACHE.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                done[rec["pmid"]] = rec
    return done


def parse_articles(xml_text):
    records = {}
    root = ET.fromstring(xml_text)
    for art in root.iter("PubmedArticle"):
        pmid = art.findtext("MedlineCitation/PMID")
        if not pmid:
            continue
        article = art.find("MedlineCitation/Article")
        types = [t.text.strip() for t in article.iter("PublicationType") if t.text] if article is not None else []
        title = "".join(article.find("ArticleTitle").itertext()).strip() if article is not None and article.find("ArticleTitle") is not None else ""
        journal = article.findtext("Journal/Title", default="") if article is not None else ""
        year = (article.findtext("Journal/JournalIssue/PubDate/Year")
                or (article.findtext("Journal/JournalIssue/PubDate/MedlineDate") or "")[:4]) if article is not None else ""
        records[pmid.strip()] = {"pmid": pmid.strip(), "found": True, "publication_types": types,
                                 "title": title, "journal": journal.strip(), "year": year}
    # Books and chapters in PubMed (rare) carry their types elsewhere
    for book in root.iter("PubmedBookArticle"):
        pmid = book.findtext("BookDocument/PMID")
        if pmid:
            types = [t.text.strip() for t in book.iter("PublicationType") if t.text]
            title_el = book.find("BookDocument/ArticleTitle")
            records[pmid.strip()] = {"pmid": pmid.strip(), "found": True, "publication_types": types,
                                     "title": "".join(title_el.itertext()).strip() if title_el is not None else "",
                                     "journal": "", "year": ""}
    return records


def fetch_batch(pmids, email, api_key, session):
    params = {"db": "pubmed", "retmode": "xml", "tool": "reslit_paper_types", "email": email}
    if api_key:
        params["api_key"] = api_key
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # POST keeps long id lists out of the URL
            r = session.post(EFETCH, data={**params, "id": ",".join(pmids)}, timeout=120)
            if r.status_code == 429 or r.status_code >= 500:
                raise requests.HTTPError(f"HTTP {r.status_code}")
            r.raise_for_status()
            return parse_articles(r.text)
        except (requests.RequestException, ET.ParseError) as err:
            if attempt == MAX_RETRIES:
                raise
            wait = 2 ** attempt
            print(f"  batch failed ({err}); retry {attempt}/{MAX_RETRIES - 1} in {wait}s", file=sys.stderr)
            time.sleep(wait)


def paper_type(rec):
    if not rec["found"]:
        return ""
    return "Review" if REVIEW_TYPES & set(rec["publication_types"]) else "Research Article"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[1])
    parser.add_argument("--email", required=True, help="contact email NCBI requires with each request")
    parser.add_argument("--api-key", default=os.environ.get("NCBI_API_KEY"), help="NCBI API key (or set NCBI_API_KEY)")
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO, help="ResLit repository root")
    parser.add_argument("--limit", type=int, help="only fetch the first N PMIDs (for a test run)")
    args = parser.parse_args()

    sources = read_pmids(args.repo)
    pmids = sorted(sources, key=int)
    if args.limit:
        pmids = pmids[: args.limit]
    done = load_cache()
    todo = [p for p in pmids if p not in done]
    print(f"{len(pmids)} PMIDs; {len(pmids) - len(todo)} already cached; fetching {len(todo)}")

    delay = 1 / 10 if args.api_key else 1 / 3
    session = requests.Session()
    with CACHE.open("a", encoding="utf-8") as cache:
        for i in range(0, len(todo), BATCH_SIZE):
            batch = todo[i: i + BATCH_SIZE]
            started = time.time()
            got = fetch_batch(batch, args.email, args.api_key, session)
            for p in batch:
                rec = got.get(p, {"pmid": p, "found": False, "publication_types": [], "title": "", "journal": "", "year": ""})
                done[p] = rec
                cache.write(json.dumps(rec, ensure_ascii=False) + "\n")
            cache.flush()
            print(f"  {min(i + BATCH_SIZE, len(todo))}/{len(todo)} fetched")
            time.sleep(max(0.0, delay - (time.time() - started)))

    rows = [done[p] for p in pmids]
    out = pd.DataFrame({
        "pmid": [r["pmid"] for r in rows],
        "paper_type": [paper_type(r) for r in rows],
        "sources": ["|".join(s for s in SOURCE_ORDER if s in sources[r["pmid"]]) for r in rows],
        "in_reslit": ["ResLit" in sources[r["pmid"]] for r in rows],
        "publication_types": ["|".join(r["publication_types"]) for r in rows],
        "title": [r["title"] for r in rows],
        "journal": [r["journal"] for r in rows],
        "year": [r["year"] for r in rows],
    })
    out.to_csv(OUTPUT, index=False)
    missing = [r["pmid"] for r in rows if not r["found"]]
    NOT_FOUND.write_text("".join(f"{p}\n" for p in missing))

    print(f"\nSaved {OUTPUT.name}: {len(out)} papers")
    labelled = out.assign(paper_type=out["paper_type"].replace("", "(not found)"))
    groups = {"all papers": labelled,
              "ResLit evidence papers": labelled[labelled["in_reslit"]],
              "reference-database papers": labelled[labelled["sources"].str.contains("CARD|ResFinder|NCBI RGC")]}
    for name, g in groups.items():
        counts = g["paper_type"].value_counts()
        print(f"  {name} ({len(g)}): " + ", ".join(f"{k} {v}" for k, v in counts.items()))
    print(f"Saved {NOT_FOUND.name}: {len(missing)} PMIDs not returned by PubMed")


if __name__ == "__main__":
    main()
