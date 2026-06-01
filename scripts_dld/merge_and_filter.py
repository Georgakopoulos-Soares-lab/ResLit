#!/usr/bin/env python3
"""Merge OA and API txt files, deduplicate by PMID, filter to verified full text.

Usage:
    python3 merge_and_filter.py \\
        --oa-dirs  outputs_oa_p1/oa/txt outputs_oa_p2/oa/txt \\
        --api-dirs outputs_api_p1/api/txt outputs_api_p2/api/txt \\
        --out-dir  outputs_merged

    # Single-batch shorthand (same base dir for OA and API):
    python3 merge_and_filter.py --base-dir outputs_mutations --out-dir outputs_mutations_merged
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

MIN_WORDS = 500

# Source quality ranking for deduplication (lower index = higher priority)
SOURCE_PRIORITY = [
    "PMC_OA_Bulk_XML",
    "EuropePMC_FullText_XML",
    "PMC_EFetch_XML",
    "PMC_OA_BioC",
    "Elsevier_Candidate_XML",
    "Elsevier_Candidate_Text",
    "OA_HTML",
    "Publisher_HTML",
    "Publisher_PDF",
    "PubMed_BioC",
    "unknown",
]

NON_BODY_SECTIONS = {
    "abstract","title","keywords","references","selected references",
    "supplementary material","supplemental material","supplementary data",
    "supporting information","funding","transparency declarations",
    "acknowledgements","acknowledgments","author contributions",
    "authors contributions","competing interests","conflict of interest",
    "data availability","availability of data and materials","declarations",
    "ethics","consent","resources","raw_pdf_note","publisher_html","oa_html",
    "elsevier_xml","publisher_full_text_json","springer_jats_xml",
}
BODY_HEADING_MARKERS = {
    "introduction","background","materials and methods","methods",
    "patients and methods","experimental procedures","results","discussion",
    "results and discussion","conclusion","conclusions","case report",
    "case presentation","case 1","case 2","case 3","the study","observations",
}
STOP_HEADING_MARKERS = {
    "references","selected references","resources","cite","collections",
    "permalink","figures","metrics","article metrics loading...",
}
PLACEHOLDER_LINE_MARKERS = (
    "full text","pdf","previous","next","open in a new tab",
    "view on publisher site","image on p.",
)
_ELSEVIER_BODY_RE = re.compile(r"<(?:ce:sections|ce:para|body)\b", re.IGNORECASE)


# ── Text analysis helpers (duplicated from 04_filter_fulltext.py) ────────────

def normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip().lower()).rstrip(":.")

def get_source(text: str) -> str:
    for line in text.splitlines()[:20]:
        if line.startswith("Source:"):
            return line.split(":", 1)[1].strip()
    return "unknown"

def get_header_value(text: str, field: str) -> str:
    prefix = f"{field}:"
    for line in text.splitlines()[:20]:
        if line.startswith(prefix):
            return line.split(":", 1)[1].strip()
    return ""

def get_sections(text: str) -> list[str]:
    return [l.strip() for l in text.splitlines() if l.startswith("## ")]

def normalize_section(s: str) -> str:
    return normalize_line(s[3:] if s.startswith("## ") else s)

def count_words(text: str) -> int:
    return len(re.sub(r"<[^>]+>", " ", text).split())

def count_section_words(text: str) -> int:
    words = 0; in_sec = False
    for line in text.splitlines():
        if line.startswith("## "): in_sec = True; continue
        if in_sec:
            s = line.strip()
            if s: words += count_words(s)
    return words

def count_body_section_words(text: str) -> int:
    words = 0; cur = ""
    for line in text.splitlines():
        if line.startswith("## "): cur = normalize_section(line); continue
        s = line.strip()
        if s and cur not in NON_BODY_SECTIONS: words += count_words(s)
    return words

def count_between_headings(lines: list[str], starts: set, stops: set) -> int:
    normalized = [normalize_line(l) for l in lines]
    start_idx = next((i+1 for i,l in enumerate(normalized) if l in starts), None)
    if start_idx is None: return 0
    stop_idx = next((i for i in range(start_idx, len(normalized)) if normalized[i] in stops), len(lines))
    words = 0
    for raw in lines[start_idx:stop_idx]:
        s = raw.strip(); low = normalize_line(s)
        if not s or low in PLACEHOLDER_LINE_MARKERS: continue
        if re.fullmatch(r"[\d\s.]+", s): continue
        if s.startswith("PMID:") or s.startswith("PMCID:"): continue
        if len(s) < 20: continue
        words += count_words(s)
    return words

def count_body_heading_markers(lines: list[str]) -> int:
    return sum(1 for l in lines if normalize_line(l) in BODY_HEADING_MARKERS)

def is_jstage_overview(text: str) -> bool:
    l = text.lower()
    return "j-stage home" in l and "browse" in l and "all titles" in l

def is_pmc_pdf_page(text: str) -> bool:
    l = text.lower()
    return ("search pmc full-text archive search in pmc" in l and "selected references" in l
            and ("image on p." in l or "\nfull text\npdf\n" in l))

def is_europepmc_pdf_placeholder(text: str) -> bool:
    return "the full text of this article is available as a pdf" in text.lower()

def classify_record(text: str) -> tuple[bool, str]:
    source = get_source(text)
    sections = get_sections(text)
    body_secs = [s for s in sections if normalize_section(s) not in NON_BODY_SECTIONS]
    sec_words = count_section_words(text)
    body_words = count_body_section_words(text)
    lines = text.splitlines()
    markers = count_body_heading_markers(lines)
    abst_words = count_between_headings(lines, {"abstract"}, STOP_HEADING_MARKERS)

    if source == "PubMed_BioC":          return False, "pubmed_abstract_only"
    if source == "Wiley_TDM_PDF":        return False, "wiley_pdf_note_only"
    if source == "EuropePMC_FullText_XML" and is_europepmc_pdf_placeholder(text):
        return False, "epmc_pdf_placeholder"
    if source == "Elsevier_Candidate_XML":
        if not _ELSEVIER_BODY_RE.search(text): return False, "elsevier_xml_no_body"
        return (sec_words >= MIN_WORDS, "elsevier_body" if sec_words >= MIN_WORDS else "body_below_min_words")
    if source in {"PMC_OA_Bulk_XML","PMC_EFetch_XML","PMC_OA_BioC","EuropePMC_FullText_XML"}:
        if not body_secs:             return False, "meta_sections_only"
        if body_words < MIN_WORDS:    return False, "body_below_min_words"
        return True, "structured_body"
    if source == "OA_HTML":
        if is_pmc_pdf_page(text):     return False, "pmc_pdf_page_only"
        if markers:                   return (abst_words >= MIN_WORDS, f"oa_html_markers:{markers}" if abst_words >= MIN_WORDS else "body_below_min_words")
        if abst_words >= max(MIN_WORDS*2, 1800): return True, "oa_html_core_text"
        return False, "publisher_preview_only"
    if source == "Publisher_HTML":
        if is_jstage_overview(text):  return False, "jstage_overview_only"
        l = text.lower()
        if "full text loading..." in l or "article metrics loading" in l: return False, "publisher_preview_only"
        if markers:                   return (abst_words >= MIN_WORDS, f"publisher_markers:{markers}" if abst_words >= MIN_WORDS else "body_below_min_words")
        if abst_words >= max(MIN_WORDS*2, 1800): return True, "publisher_core_text"
        return False, "publisher_preview_only"
    if source == "Elsevier_Candidate_Text":
        return (sec_words >= MIN_WORDS, "elsevier_body" if sec_words >= MIN_WORDS else "body_below_min_words")
    if body_secs and body_words >= MIN_WORDS: return True, "structured_body"
    if not body_secs:                 return False, "meta_sections_only"
    return False, "body_below_min_words"


# ── Main ─────────────────────────────────────────────────────────────────────

def source_rank(text: str) -> int:
    src = get_source(text)
    try: return SOURCE_PRIORITY.index(src)
    except ValueError: return len(SOURCE_PRIORITY)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--oa-dirs", nargs="*", default=[],
        metavar="DIR",
        help="One or more OA txt directories (e.g. outputs_p1/oa/txt).",
    )
    parser.add_argument(
        "--api-dirs", nargs="*", default=[],
        metavar="DIR",
        help="One or more API txt directories (e.g. outputs_p1/api/txt).",
    )
    parser.add_argument(
        "--base-dir", default=None,
        metavar="DIR",
        help="Shorthand: use <base-dir>/oa/txt and <base-dir>/api/txt as the sole source dirs.",
    )
    parser.add_argument(
        "--out-dir", required=True,
        metavar="DIR",
        help="Output root directory (will be created if absent).",
    )
    parser.add_argument(
        "--min-words", type=int, default=MIN_WORDS,
        help=f"Minimum body word count to qualify as full text (default: {MIN_WORDS}).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    oa_dirs: list[str] = list(args.oa_dirs)
    api_dirs: list[str] = list(args.api_dirs)
    if args.base_dir:
        oa_dirs.append(str(Path(args.base_dir) / "oa" / "txt"))
        api_dirs.append(str(Path(args.base_dir) / "api" / "txt"))
    if not oa_dirs and not api_dirs:
        print("Error: provide --oa-dirs / --api-dirs or --base-dir.", file=sys.stderr)
        return 1

    min_words = args.min_words
    out_dir = Path(args.out_dir)
    fulltext_dir = out_dir / "fulltext_txt"
    abstract_dir = out_dir / "abstract_txt"
    reports_dir  = out_dir / "reports"

    fulltext_dir.mkdir(parents=True, exist_ok=True)
    abstract_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: collect all txt files, deduplicate by PMID ──────────────────
    print("Scanning source directories...", file=sys.stderr)
    all_paths: dict[str, Path] = {}   # pmid -> best path

    all_source_dirs = [(d, "oa") for d in oa_dirs] + [(d, "api") for d in api_dirs]
    for dir_str, _ in all_source_dirs:
        d = Path(dir_str)
        if not d.exists():
            continue
        for f in d.glob("*.txt"):
            pmid = f.stem
            if pmid not in all_paths:
                all_paths[pmid] = f
            else:
                # Keep higher-priority source
                existing_text = all_paths[pmid].read_text(errors="ignore")
                new_text = f.read_text(errors="ignore")
                if source_rank(new_text) < source_rank(existing_text):
                    all_paths[pmid] = f

    total = len(all_paths)
    print(f"Unique PMIDs: {total:,}", file=sys.stderr)

    # ── Step 2: classify and copy ────────────────────────────────────────────
    fulltext_records: list[dict] = []
    abstract_records: list[dict] = []

    for i, (pmid, path) in enumerate(sorted(all_paths.items()), 1):
        if i % 5000 == 0:
            print(f"  [{i:,}/{total:,}] classified...", file=sys.stderr)

        text = path.read_text(errors="ignore")
        source = get_source(text)
        title   = get_header_value(text, "Title")
        journal = get_header_value(text, "Journal")
        words   = count_body_section_words(text) or count_section_words(text)
        verdict, reason = classify_record(text)

        record = {
            "pmid": pmid,
            "source": source,
            "title": title,
            "journal": journal,
            "word_count": words,
            "reason": reason,
            "source_file": str(path),
        }

        if verdict:
            fulltext_records.append(record)
            shutil.copy2(path, fulltext_dir / f"{pmid}.txt")
        else:
            abstract_records.append(record)
            shutil.copy2(path, abstract_dir / f"{pmid}.txt")

    # ── Step 3: write reports ─────────────────────────────────────────────────
    fulltext_by_source = Counter(r["source"] for r in fulltext_records)
    abstract_by_source = Counter(r["source"] for r in abstract_records)
    reason_counts = Counter(r["reason"] for r in abstract_records if r["source"] != "PubMed_BioC")

    summary = {
        "total_unique_pmids": total,
        "fulltext_count": len(fulltext_records),
        "abstract_only_count": len(abstract_records),
        "min_words_threshold": min_words,
        "fulltext_by_source": dict(fulltext_by_source.most_common()),
        "abstract_only_by_source": dict(abstract_by_source.most_common()),
        "filtered_no_body_by_reason": dict(reason_counts.most_common()),
        "fulltext_dir": str(fulltext_dir),
        "abstract_dir": str(abstract_dir),
    }

    (reports_dir / "merge_filter_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    )

    manifest_lines = [json.dumps(r, ensure_ascii=False) for r in fulltext_records]
    (reports_dir / "fulltext_manifest.jsonl").write_text("\n".join(manifest_lines) + "\n")

    # ── Step 4: print summary ─────────────────────────────────────────────────
    print(f"\n{'='*55}")
    print(f"Total unique PMIDs processed : {total:,}")
    print(f"Verified full-text           : {len(fulltext_records):,}")
    print(f"Abstract-only / rejected     : {len(abstract_records):,}")
    print(f"{'='*55}")
    print("\nFull-text by source:")
    for src, cnt in fulltext_by_source.most_common():
        print(f"  {src:<35} {cnt:>7,}")
    print("\nRejected (non-BioC) by reason:")
    for rsn, cnt in reason_counts.most_common(10):
        print(f"  {rsn:<35} {cnt:>7,}")
    print(f"\nOutputs:")
    print(f"  Full-text copies : {fulltext_dir}")
    print(f"  Abstract copies  : {abstract_dir}")
    print(f"  Summary JSON     : {reports_dir}/merge_filter_summary.json")
    print(f"  Manifest JSONL   : {reports_dir}/fulltext_manifest.jsonl")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
