#!/usr/bin/env python3
"""Validate downloaded txt files and keep only article body text.

This script is intentionally stricter than a simple source-label or word-count
check. It tries to exclude common false full-text captures such as:

- Wiley PDF note placeholders
- Europe PMC "full text available as PDF" placeholders
- PMC page-image views with abstract/reference text but no article body
- publisher landing pages or abstract-only preview pages
- metadata-only section bundles (funding/supplementary-only)

Outputs:

- <out-dir>/fulltext_txt/                      verified full-text symlinks/copies
- <out-dir>/abstract_txt/                      everything else
- <out-dir>/clean_fulltext_body/SUMMARY.json   strict corpus summary
- <out-dir>/clean_fulltext_body/manifest.jsonl strict full-text manifest
- <out-dir>/reports/txt_filter_summary.json    strict split summary
- <out-dir>/reports/txt_filter_manifest.jsonl  one record per txt file
- <out-dir>/reports/fulltext_body_filter_summary.json
- <out-dir>/reports/fulltext_filtered_no_body.tsv
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path
from typing import Any


NON_BODY_SECTIONS: set[str] = {
    "abstract",
    "title",
    "keywords",
    "references",
    "selected references",
    "supplementary material",
    "supplemental material",
    "supplementary data",
    "supporting information",
    "funding",
    "transparency declarations",
    "acknowledgements",
    "acknowledgments",
    "author contributions",
    "authors contributions",
    "competing interests",
    "conflict of interest",
    "data availability",
    "availability of data and materials",
    "declarations",
    "ethics",
    "consent",
    "resources",
    "raw_pdf_note",
    "publisher_html",
    "oa_html",
    "elsevier_xml",
    "publisher_full_text_json",
    "springer_jats_xml",
}

BODY_HEADING_MARKERS: set[str] = {
    "introduction",
    "background",
    "materials and methods",
    "methods",
    "patients and methods",
    "experimental procedures",
    "results",
    "discussion",
    "results and discussion",
    "conclusion",
    "conclusions",
    "case report",
    "case presentation",
    "case 1",
    "case 2",
    "case 3",
    "the study",
    "observations",
}

STOP_HEADING_MARKERS: set[str] = {
    "references",
    "selected references",
    "resources",
    "cite",
    "collections",
    "permalink",
    "figures",
    "metrics",
    "article metrics loading...",
}

PLACEHOLDER_LINE_MARKERS: tuple[str, ...] = (
    "full text",
    "pdf",
    "previous",
    "next",
    "open in a new tab",
    "view on publisher site",
    "image on p.",
)

_ELSEVIER_BODY_RE = re.compile(r"<(?:ce:sections|ce:para|body)\b", re.IGNORECASE)


def write_json(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


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


def safe_unlink_children(directory: Path) -> None:
    if not directory.exists():
        return
    for child in directory.iterdir():
        if child.is_symlink() or child.is_file():
            child.unlink()


def normalize_line(line: str) -> str:
    cleaned = re.sub(r"\s+", " ", line.strip().lower())
    return cleaned.rstrip(":.")


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
    return [line.strip() for line in text.splitlines() if line.startswith("## ")]


def normalize_section(section: str) -> str:
    return normalize_line(section[3:] if section.startswith("## ") else section)


def body_sections(sections: list[str]) -> list[str]:
    return [section for section in sections if normalize_section(section) not in NON_BODY_SECTIONS]


def count_words(text: str) -> int:
    clean = re.sub(r"<[^>]+>", " ", text)
    return len(clean.split())


def count_section_words(text: str) -> int:
    words = 0
    in_section = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_section = True
            continue
        if in_section:
            stripped = line.strip()
            if not stripped:
                continue
            words += count_words(stripped)
    return words


def count_body_section_words(text: str) -> int:
    words = 0
    current_section = ""
    for line in text.splitlines():
        if line.startswith("## "):
            current_section = normalize_section(line)
            continue
        stripped = line.strip()
        if not stripped or current_section in NON_BODY_SECTIONS:
            continue
        words += count_words(stripped)
    return words


def count_between_headings(lines: list[str], start_markers: set[str], stop_markers: set[str]) -> int:
    start_idx = None
    stop_idx = None
    normalized = [normalize_line(line) for line in lines]
    for idx, line in enumerate(normalized):
        if line in start_markers:
            start_idx = idx + 1
            break
    if start_idx is None:
        return 0
    for idx in range(start_idx, len(normalized)):
        if normalized[idx] in stop_markers:
            stop_idx = idx
            break
    if stop_idx is None:
        stop_idx = len(lines)

    body_words = 0
    for raw in lines[start_idx:stop_idx]:
        stripped = raw.strip()
        lowered = normalize_line(stripped)
        if not stripped:
            continue
        if lowered in PLACEHOLDER_LINE_MARKERS:
            continue
        if re.fullmatch(r"[\d\s.]+", stripped):
            continue
        if stripped.startswith("PMID:") or stripped.startswith("PMCID:"):
            continue
        if len(stripped) < 20:
            continue
        body_words += count_words(stripped)
    return body_words


def count_body_heading_markers(lines: list[str]) -> int:
    count = 0
    for line in lines:
        if normalize_line(line) in BODY_HEADING_MARKERS:
            count += 1
    return count


def is_jstage_overview(text: str) -> bool:
    lowered = text.lower()
    return "j-stage home" in lowered and "browse" in lowered and "all titles" in lowered


def is_pmc_pdf_page(text: str) -> bool:
    lowered = text.lower()
    return (
        "search pmc full-text archive search in pmc" in lowered
        and "selected references" in lowered
        and ("image on p." in lowered or "\nfull text\npdf\n" in lowered)
    )


def is_europepmc_pdf_placeholder(text: str) -> bool:
    lowered = text.lower()
    return "the full text of this article is available as a pdf" in lowered


def classify_record(text: str, min_words: int) -> tuple[bool, str]:
    source = get_source(text)
    sections = get_sections(text)
    body_secs = body_sections(sections)
    section_words = count_section_words(text)
    body_words = count_body_section_words(text)
    lines = text.splitlines()
    heading_markers = count_body_heading_markers(lines)
    abstract_window_words = count_between_headings(lines, {"abstract"}, STOP_HEADING_MARKERS)

    if source == "PubMed_BioC":
        return False, "pubmed_abstract_only"

    if source == "Wiley_TDM_PDF":
        return False, "wiley_pdf_note_only"

    if source == "EuropePMC_FullText_XML" and is_europepmc_pdf_placeholder(text):
        return False, "epmc_pdf_placeholder"

    if source == "Elsevier_Candidate_XML":
        if not _ELSEVIER_BODY_RE.search(text):
            return False, "elsevier_xml_no_body"
        return (
            section_words >= min_words,
            "elsevier_body" if section_words >= min_words else "body_below_min_words",
        )

    if source in {"PMC_OA_Bulk_XML", "PMC_EFetch_XML", "PMC_OA_BioC"}:
        if not body_secs:
            return False, "meta_sections_only"
        if body_words < min_words:
            return False, "body_below_min_words"
        return True, "structured_body"

    if source == "OA_HTML":
        if is_pmc_pdf_page(text):
            return False, "pmc_pdf_page_only"
        if heading_markers:
            return (abstract_window_words >= min_words, f"oa_html_markers:{heading_markers}" if abstract_window_words >= min_words else "body_below_min_words")
        if abstract_window_words >= max(min_words * 2, 1800):
            return True, "oa_html_core_text"
        return False, "publisher_preview_only"

    if source == "Publisher_HTML":
        if is_jstage_overview(text):
            return False, "jstage_overview_only"
        lowered = text.lower()
        if "full text loading..." in lowered or "article metrics loading" in lowered:
            return False, "publisher_preview_only"
        if heading_markers:
            return (abstract_window_words >= min_words, f"publisher_markers:{heading_markers}" if abstract_window_words >= min_words else "body_below_min_words")
        if abstract_window_words >= max(min_words * 2, 1800):
            return True, "publisher_core_text"
        return False, "publisher_preview_only"

    if source == "Elsevier_Candidate_Text":
        return (section_words >= min_words, "elsevier_body" if section_words >= min_words else "body_below_min_words")

    if body_secs and body_words >= min_words:
        return True, "structured_body"
    if not body_secs:
        return False, "meta_sections_only"
    return False, "body_below_min_words"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", default="outputs", help="Root output directory (default: outputs)")
    parser.add_argument(
        "--min-words",
        type=int,
        default=500,
        help="Minimum body-word threshold for a record to count as verified full-text (default: 500)",
    )
    parser.add_argument("--copy", action="store_true", help="Copy files instead of creating symlinks")
    return parser


def load_historical_meta(meta_dir: Path) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    if not meta_dir.exists():
        return records
    for path in meta_dir.glob("*.json"):
        try:
            payload = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        records[path.stem] = payload
    return records


def build_filtered_tsv(records: list[dict]) -> str:
    lines = ["pmid\tsource\treason\tword_count\tjournal\ttitle\ttext_file"]
    for record in records:
        lines.append(
            "\t".join(
                [
                    record["pmid"],
                    record["source"],
                    record["reason"],
                    str(record["word_count"]),
                    record["journal"].replace("\t", " "),
                    record["title"].replace("\t", " ").replace("\n", " "),
                    record["source_file"],
                ]
            )
        )
    return "\n".join(lines) + "\n"


def summarize_word_stats(records: list[dict]) -> dict:
    if not records:
        return {}
    values = sorted(record["word_count"] for record in records)

    def percentile(p: float) -> int:
        idx = min(len(values) - 1, max(0, int(round((len(values) - 1) * p))))
        return values[idx]

    return {
        "min": values[0],
        "p10": percentile(0.10),
        "p25": percentile(0.25),
        "median": percentile(0.50),
        "p75": percentile(0.75),
        "p90": percentile(0.90),
        "max": values[-1],
    }


def summarize_word_bins(records: list[dict]) -> dict[str, int]:
    bins = {"<500": 0, "500-999": 0, "1000-1999": 0, "2000-4999": 0, "5000+": 0}
    for record in records:
        words = record["word_count"]
        if words < 500:
            bins["<500"] += 1
        elif words < 1000:
            bins["500-999"] += 1
        elif words < 2000:
            bins["1000-1999"] += 1
        elif words < 5000:
            bins["2000-4999"] += 1
        else:
            bins["5000+"] += 1
    return bins


def main() -> int:
    args = build_arg_parser().parse_args()
    out_root = Path(args.out_dir)

    src_dirs = [out_root / "oa" / "txt", out_root / "api" / "txt"]
    fulltext_dir = ensure_dir(out_root / "fulltext_txt")
    abstract_dir = ensure_dir(out_root / "abstract_txt")
    clean_dir = ensure_dir(out_root / "clean_fulltext_body")
    clean_txt_dir = ensure_dir(clean_dir / "txt")
    clean_meta_dir = ensure_dir(clean_dir / "meta")
    reports_dir = ensure_dir(out_root / "reports")
    historical_meta = load_historical_meta(clean_meta_dir)

    safe_unlink_children(fulltext_dir)
    safe_unlink_children(abstract_dir)
    safe_unlink_children(clean_txt_dir)

    all_txt: list[Path] = []
    for directory in src_dirs:
        if directory.exists():
            all_txt.extend(sorted(directory.glob("*.txt")))

    if not all_txt:
        print(f"No .txt files found under {[str(d) for d in src_dirs]}", file=sys.stderr)
        return 1

    print(f"Found {len(all_txt)} txt files, validating body content...", file=sys.stderr)

    fulltext_records: list[dict] = []
    non_body_records: list[dict] = []
    manifest: list[dict] = []

    for path in all_txt:
        text = path.read_text(errors="ignore")
        source = get_source(text)
        title = get_header_value(text, "Title")
        journal = get_header_value(text, "Journal")
        words = count_body_section_words(text) or count_section_words(text)
        verdict, reason = classify_record(text, min_words=args.min_words)
        exported_source = path
        historical = historical_meta.get(path.stem)
        historical_used = False

        if not verdict and historical:
            historical_words = int(historical.get("word_count", 0) or 0)
            historical_original = Path(str(historical.get("original_text_file", "")))
            historical_exported = Path(str(historical.get("exported_text_file", "")))
            if historical_words >= max(args.min_words, 1000):
                if historical_original.exists():
                    verdict = True
                    reason = f"historical_{historical.get('body_validation_reason', 'validated')}"
                    exported_source = historical_original
                    words = historical_words
                    title = historical.get("title", "") or title
                    journal = historical.get("journal", "") or journal
                    historical_used = True
                elif historical_exported.exists():
                    verdict = True
                    reason = f"historical_{historical.get('body_validation_reason', 'validated')}"
                    exported_source = historical_exported
                    words = historical_words
                    title = historical.get("title", "") or title
                    journal = historical.get("journal", "") or journal
                    historical_used = True

        record = {
            "pmid": path.stem,
            "source_file": str(path),
            "source": source,
            "title": title,
            "journal": journal,
            "word_count": words,
            "sections": get_sections(text),
            "verdict": "fulltext" if verdict else "abstract_only",
            "reason": reason,
            "export_source_file": str(exported_source),
            "historical_fallback_used": historical_used,
        }
        manifest.append(record)

        if verdict:
            fulltext_records.append(record)
            link_or_copy(path, fulltext_dir / path.name, args.copy)
            link_or_copy(exported_source, clean_txt_dir / path.name, args.copy)
        else:
            non_body_records.append(record)
            link_or_copy(path, abstract_dir / path.name, args.copy)

    fulltext_by_source = Counter(record["source"] for record in fulltext_records)
    abstract_by_source = Counter(record["source"] for record in non_body_records)
    filtered_non_body = [record for record in non_body_records if record["source"] != "PubMed_BioC"]
    filtered_by_reason = Counter(record["reason"] for record in filtered_non_body)
    filtered_by_source = Counter(record["source"] for record in filtered_non_body)

    txt_filter_summary = {
        "total_files": len(all_txt),
        "fulltext_count": len(fulltext_records),
        "abstract_only_count": len(non_body_records),
        "min_words_threshold": args.min_words,
        "fulltext_by_source": dict(fulltext_by_source.most_common()),
        "abstract_only_by_source": dict(abstract_by_source.most_common()),
        "fulltext_dir": str(fulltext_dir),
        "abstract_dir": str(abstract_dir),
    }

    strict_summary = {
        "original_fulltext_count": sum(1 for record in manifest if record["source"] != "PubMed_BioC"),
        "retained_after_body_filter": len(fulltext_records),
        "filtered_no_real_body": len(filtered_non_body),
        "retained_by_source": dict(fulltext_by_source.most_common()),
        "filtered_by_reason": dict(filtered_by_reason.most_common()),
        "filtered_by_source": dict(filtered_by_source.most_common()),
        "retained_word_stats": summarize_word_stats(fulltext_records),
        "retained_word_bins": summarize_word_bins(fulltext_records),
    }

    clean_summary = {
        "export_dir": str(clean_dir),
        "retained_count": len(fulltext_records),
        "by_source": dict(fulltext_by_source.most_common()),
        "min_word_count": min((record["word_count"] for record in fulltext_records), default=0),
        "max_word_count": max((record["word_count"] for record in fulltext_records), default=0),
    }

    write_json(reports_dir / "txt_filter_summary.json", txt_filter_summary)
    write_jsonl(reports_dir / "txt_filter_manifest.jsonl", manifest)
    write_json(reports_dir / "fulltext_body_filter_summary.json", strict_summary)
    (reports_dir / "fulltext_filtered_no_body.tsv").write_text(build_filtered_tsv(filtered_non_body))

    write_json(clean_dir / "SUMMARY.json", clean_summary)
    write_jsonl(clean_dir / "manifest.jsonl", fulltext_records)

    print(f"\n{'=' * 50}")
    print(f"Full-text (verified):  {len(fulltext_records)}")
    print(f"Abstract-only:         {len(non_body_records)}")
    print(f"Filtered non-body:     {len(filtered_non_body)}")
    print(f"{'=' * 50}")
    print("\nVerified full-text by source:")
    for source, count in fulltext_by_source.most_common():
        print(f"  {source}: {count}")
    print("\nFiltered non-body by reason:")
    for reason, count in filtered_by_reason.most_common():
        print(f"  {reason}: {count}")
    print("\nOutputs written to:")
    print(f"  {fulltext_dir}")
    print(f"  {abstract_dir}")
    print(f"  {clean_dir / 'SUMMARY.json'}")
    print(f"  {reports_dir / 'txt_filter_summary.json'}")
    print(f"  {reports_dir / 'fulltext_body_filter_summary.json'}")
    print(f"  {reports_dir / 'fulltext_filtered_no_body.tsv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
