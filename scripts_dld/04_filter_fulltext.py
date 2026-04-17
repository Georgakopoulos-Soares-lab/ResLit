#!/usr/bin/env python3
"""Filter downloaded txt files into verified full-text and abstract-only sets.

Reads all .txt files from outputs/oa/txt/ and outputs/api/txt/, classifies
each by actual content (not just source label), and writes:

  outputs/fulltext_txt/        symlinks or copies of verified full-text files
  outputs/abstract_txt/        symlinks or copies of abstract-only files
  outputs/reports/txt_filter_summary.json   counts and per-source breakdown
  outputs/reports/txt_filter_manifest.jsonl  one record per file with verdict

Classification rules:
  - Elsevier_Candidate_XML: must contain <ce:sections>, <ce:para>, or <body>
    tags in the XML body (publisher-blocked XMLs have none of these)
  - All other sources: must have at least one body section (not in the
    abstract-only section list) AND >= MIN_CONTENT_WORDS content words
    after stripping XML/HTML tags

Usage:
    python3 04_filter_fulltext.py --out-dir outputs [--copy] [--min-words 300]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from collections import Counter
from pathlib import Path


# ---------------------------------------------------------------------------
# Section classification
# ---------------------------------------------------------------------------

# Sections that do not count as body content regardless of source
ABSTRACT_ONLY_SECTIONS: set[str] = {
    "abstract",
    "title",
    "keywords",
    "conflict of interest",
    "acknowledgements",
    "acknowledgments",
    "author contributions",
    "authors contributions",
    "competing interests",
    "funding",
    "data availability",
    "availability of data and materials",
    "supplementary material",
    "supplemental material",
    "supporting information",
    "abbreviations",
    "declarations",
    "ethics",
    "consent",
    # raw XML/HTML wrappers — handled separately per source
    "elsevier_xml",
    "publisher_full_text_json",
    "springer_jats_xml",
}


def _normalize_section(header: str) -> str:
    """Strip leading '#' and whitespace, lowercase."""
    return header.lstrip("#").strip().lower()


def get_sections(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.startswith("## ")]


def get_body_sections(text: str) -> list[str]:
    return [
        s for s in get_sections(text)
        if _normalize_section(s) not in ABSTRACT_ONLY_SECTIONS
    ]


def get_source(text: str) -> str:
    for line in text.splitlines()[:20]:
        if line.startswith("Source:"):
            return line.split(":", 1)[1].strip()
    return "unknown"


def get_content_words(text: str, min_line_len: int = 2) -> int:
    """Count words in section content after stripping XML/HTML tags."""
    words = 0
    in_section = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_section = True
            continue
        if in_section and len(line.strip()) >= min_line_len:
            clean = re.sub(r"<[^>]+>", " ", line)
            words += len(clean.split())
    return words


# ---------------------------------------------------------------------------
# Per-source full-text detection
# ---------------------------------------------------------------------------

# Elsevier API returns XML even for publisher-blocked articles, but the
# body tags are absent when only metadata was returned.
_ELSEVIER_BODY_RE = re.compile(r"<(?:ce:sections|ce:para|body)\b")


def is_fulltext(text: str, min_words: int = 300) -> bool:
    src = get_source(text)

    if src == "Elsevier_Candidate_XML":
        return bool(_ELSEVIER_BODY_RE.search(text))

    if src in ("Elsevier_Candidate_Text", "Publisher_HTML",
               "PMC_EFetch_XML", "PMC_OA_BioC"):
        body = get_body_sections(text)
        return bool(body) and get_content_words(text) >= min_words

    # Default: body sections + word count threshold
    body = get_body_sections(text)
    return bool(body) and get_content_words(text) >= min_words


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def write_json(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2))


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n")


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def link_or_copy(src: Path, dst: Path, use_copy: bool) -> None:
    if dst.exists() or dst.is_symlink():
        dst.unlink()
    if use_copy:
        shutil.copy2(src, dst)
    else:
        dst.symlink_to(src.resolve())


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out-dir", default="outputs",
                   help="Root output directory (default: outputs)")
    p.add_argument("--min-words", type=int, default=300,
                   help="Minimum content word count for non-Elsevier sources (default: 300)")
    p.add_argument("--copy", action="store_true",
                   help="Copy files instead of creating symlinks")
    return p


def main() -> int:
    args = build_arg_parser().parse_args()
    out_root = Path(args.out_dir)

    src_dirs = [
        out_root / "oa" / "txt",
        out_root / "api" / "txt",
    ]

    fulltext_dir = ensure_dir(out_root / "fulltext_txt")
    abstract_dir = ensure_dir(out_root / "abstract_txt")
    reports_dir = ensure_dir(out_root / "reports")

    all_txt: list[Path] = []
    for d in src_dirs:
        if d.exists():
            all_txt.extend(sorted(d.glob("*.txt")))

    if not all_txt:
        print(f"No .txt files found under {[str(d) for d in src_dirs]}", file=sys.stderr)
        return 1

    print(f"Found {len(all_txt)} txt files, classifying...", file=sys.stderr)

    fulltext_records: list[dict] = []
    abstract_records: list[dict] = []
    manifest: list[dict] = []

    for f in all_txt:
        text = f.read_text(errors="ignore")
        src = get_source(text)
        verdict = is_fulltext(text, min_words=args.min_words)
        words = get_content_words(text)
        sections = get_sections(text)

        record = {
            "pmid": f.stem,
            "source_file": str(f),
            "source": src,
            "verdict": "fulltext" if verdict else "abstract_only",
            "content_words": words,
            "sections": sections,
        }
        manifest.append(record)

        dest_dir = fulltext_dir if verdict else abstract_dir
        link_or_copy(f, dest_dir / f.name, args.copy)

        if verdict:
            fulltext_records.append(record)
        else:
            abstract_records.append(record)

    # Summary
    ft_by_src = Counter(r["source"] for r in fulltext_records)
    ab_by_src = Counter(r["source"] for r in abstract_records)

    summary = {
        "total_files": len(all_txt),
        "fulltext_count": len(fulltext_records),
        "abstract_only_count": len(abstract_records),
        "min_words_threshold": args.min_words,
        "fulltext_by_source": dict(ft_by_src.most_common()),
        "abstract_only_by_source": dict(ab_by_src.most_common()),
        "fulltext_dir": str(fulltext_dir),
        "abstract_dir": str(abstract_dir),
    }

    write_json(reports_dir / "txt_filter_summary.json", summary)
    write_jsonl(reports_dir / "txt_filter_manifest.jsonl", manifest)

    # Print summary
    print(f"\n{'='*50}")
    print(f"Full-text (verified):  {len(fulltext_records)}")
    print(f"Abstract-only:         {len(abstract_records)}")
    print(f"{'='*50}")
    print("\nFull-text by source:")
    for src, cnt in ft_by_src.most_common():
        print(f"  {src}: {cnt}")
    print("\nAbstract-only by source:")
    for src, cnt in ab_by_src.most_common():
        print(f"  {src}: {cnt}")
    print(f"\nOutputs written to:")
    print(f"  {fulltext_dir}")
    print(f"  {abstract_dir}")
    print(f"  {reports_dir / 'txt_filter_summary.json'}")
    print(f"  {reports_dir / 'txt_filter_manifest.jsonl'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
