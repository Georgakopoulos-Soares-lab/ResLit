#!/usr/bin/env python3
"""Build consolidated reports from OA/API download runs."""

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path

from pubmed_common import (
    build_arg_parser,
    ensure_dir,
    infer_failure_category,
    load_jsonl,
    write_json,
    write_jsonl,
)


def build_final_index(rows: list[dict]) -> dict[str, dict]:
    final_by_pmid: dict[str, dict] = {}
    for row in rows:
        pmid = str(row.get("pmid", "")).strip()
        if not pmid:
            continue
        current = final_by_pmid.get(pmid)
        if current is None:
            final_by_pmid[pmid] = row
            continue
        if row.get("status") == "success":
            final_by_pmid[pmid] = row
            continue
        if current.get("status") != "success":
            final_by_pmid[pmid] = row
    return final_by_pmid


def classify_tdm_route(metadata: dict) -> tuple[str, str]:
    family = metadata.get("publisher_family") or "Unclassified"
    if metadata.get("pdf_fallback_reason") == "wiley_tdm_unavailable_old_article":
        return "Wiley", "wiley_legacy_pdf"
    if family == "Wiley":
        return "Wiley", "wiley_tdm_or_pdf"
    if family == "OUP":
        return "OUP", "institution_tdm_or_subscription"
    if family == "SAGE":
        return "SAGE", "subscription_tdm_via_crossref"
    if family == "ACS":
        return "ACS", "institution_or_commercial_tdm"
    if family == "ASM":
        return "ASM", "institution_access_review"
    if family == "Springer Nature":
        return "Springer Nature", "springer_api_or_html"
    return family, "manual_review"


def summarize_failures(final_by_pmid: dict[str, dict]) -> dict:
    failed = [row for row in final_by_pmid.values() if row.get("status") == "failed"]
    by_category = Counter()
    by_journal = Counter()
    details = []

    for row in failed:
        category = row.get("failure_category") or infer_failure_category(row)
        metadata = row.get("metadata") or {}
        journal = metadata.get("journal") or "UNKNOWN"
        by_category[category] += 1
        by_journal[journal] += 1
        details.append(
            {
                "pmid": row.get("pmid"),
                "journal": journal,
                "title": metadata.get("title", ""),
                "doi": metadata.get("doi", ""),
                "pmcid": metadata.get("pmcid", ""),
                "reason": row.get("reason", ""),
                "failure_category": category,
            }
        )

    grouped = defaultdict(list)
    for item in details:
        grouped[item["failure_category"]].append(item)

    return {
        "total_unique_pmids": len(final_by_pmid),
        "failed_count": len(failed),
        "failure_categories": dict(by_category.most_common()),
        "top_journals": dict(by_journal.most_common(30)),
        "details": details,
        "details_by_category": dict(grouped),
    }


def summarize_abstract_followups(api_rows: list[dict]) -> tuple[list[dict], dict]:
    abstract_rows = []
    status_counts = Counter()
    candidate_source_counts = Counter()

    for row in api_rows:
        metadata = row.get("metadata") or {}
        if row.get("status") != "success" or metadata.get("source") != "PubMed_BioC":
            continue
        followup_status = metadata.get("followup_status", "unknown")
        status_counts[followup_status] += 1
        for candidate in metadata.get("fulltext_candidates", []) or []:
            candidate_source_counts[f"{candidate.get('source')}::{candidate.get('type')}"] += 1
        abstract_rows.append(
            {
                "pmid": row.get("pmid"),
                "doi": metadata.get("doi", ""),
                "journal": metadata.get("journal", ""),
                "title": metadata.get("title", ""),
                "publisher_family": metadata.get("publisher_family", "") or "Unclassified",
                "followup_status": followup_status,
                "fulltext_candidate_count": metadata.get("fulltext_candidate_count", 0),
                "fulltext_candidates": metadata.get("fulltext_candidates", []),
                "text_file": metadata.get("text_file", ""),
                "pdf_fallback_bucket": metadata.get("pdf_fallback_bucket", ""),
            }
        )

    abstract_rows.sort(key=lambda item: (item["followup_status"], item["pmid"]))
    summary = {
        "abstract_only_count": len(abstract_rows),
        "followup_status_counts": dict(status_counts.most_common()),
        "candidate_source_counts": dict(candidate_source_counts.most_common()),
    }
    return abstract_rows, summary


def summarize_tdm_candidates(abstract_rows: list[dict]) -> tuple[list[dict], dict]:
    manifest = []
    strategy_counts = Counter()
    family_counts = Counter()

    for item in abstract_rows:
        family, strategy = classify_tdm_route(item)
        strategy_counts[strategy] += 1
        family_counts[family] += 1
        manifest.append(
            {
                "pmid": item["pmid"],
                "doi": item["doi"],
                "journal": item["journal"],
                "title": item["title"],
                "publisher_family": family,
                "followup_status": item["followup_status"],
                "pdf_fallback_bucket": item["pdf_fallback_bucket"],
                "recommended_route": strategy,
                "fulltext_candidates": item["fulltext_candidates"],
            }
        )

    manifest.sort(key=lambda item: (item["recommended_route"], item["publisher_family"], item["pmid"]))
    summary = {
        "abstract_only_count": len(manifest),
        "publisher_family_counts": dict(family_counts.most_common()),
        "recommended_route_counts": dict(strategy_counts.most_common()),
    }
    return manifest, summary


def build_summary(final_by_pmid: dict[str, dict], tdm_summary: dict, failure_report: dict) -> str:
    success_rows = [row for row in final_by_pmid.values() if row.get("status") == "success"]
    success_sources = Counter((row.get("metadata") or {}).get("source", "UNKNOWN") for row in success_rows)
    fulltext_count = sum(1 for row in success_rows if (row.get("metadata") or {}).get("source") != "PubMed_BioC")
    abstract_count = success_sources.get("PubMed_BioC", 0)
    failed_count = failure_report["failed_count"]

    lines = [
        "# Retrieval Summary",
        "",
        "## Corpus totals",
        f"- Valid PMIDs: {len(final_by_pmid)}",
        f"- Full-text retrieved: {fulltext_count}",
        f"- Abstract-only: {abstract_count}",
        f"- Failed: {failed_count}",
        "",
        "## Full-text source distribution",
    ]
    for source, count in success_sources.most_common():
        if source == "PubMed_BioC":
            continue
        lines.append(f"- {source}: {count}")

    lines.extend(["", "## Remaining abstract-only publisher families"])
    for family, count in tdm_summary["publisher_family_counts"].items():
        lines.append(f"- {family}: {count}")

    lines.extend(["", "## Recommended next-step buckets"])
    for route, count in tdm_summary["recommended_route_counts"].items():
        lines.append(f"- {route}: {count}")

    if failure_report["failed_count"]:
        lines.extend(["", "## Remaining failures"])
        for category, count in failure_report["failure_categories"].items():
            lines.append(f"- {category}: {count}")

    return "\n".join(lines) + "\n"


def build_next_steps_tsv(tdm_manifest: list[dict]) -> str:
    by_route: dict[str, list[dict]] = defaultdict(list)
    for item in tdm_manifest:
        by_route[item["recommended_route"]].append(item)

    lines = ["recommended_route\tcount\trepresentative_pmid\tdoi\tpublisher_family\tjournal"]
    for route, items in sorted(by_route.items(), key=lambda part: (-len(part[1]), part[0])):
        sample = items[0]
        lines.append(
            "\t".join(
                [
                    route,
                    str(len(items)),
                    str(sample.get("pmid", "")),
                    str(sample.get("doi", "")),
                    str(sample.get("publisher_family", "")),
                    str(sample.get("journal", "")).replace("\t", " "),
                ]
            )
        )
    return "\n".join(lines) + "\n"


def build_failure_markdown(report: dict) -> str:
    md_lines = [
        "# Failure report",
        "",
        f"Failed PMIDs: {report['failed_count']}",
        "",
        "## Failure categories",
    ]
    for category, count in report["failure_categories"].items():
        md_lines.append(f"- {category}: {count}")
    md_lines.extend(["", "## Top journals"])
    for journal, count in report["top_journals"].items():
        md_lines.append(f"- {journal}: {count}")
    md_lines.extend(["", "## Failed PMIDs"])
    for item in report["details"]:
        md_lines.append(
            f"- PMID {item['pmid']} | {item['journal']} | {item['failure_category']} | {item['reason']}"
        )
    return "\n".join(md_lines) + "\n"


def main() -> int:
    parser = build_arg_parser("Build consolidated reports from OA/API download runs.")
    parser.add_argument(
        "--results",
        nargs="+",
        default=["outputs/runs/oa_results.jsonl", "outputs/runs/api_results.jsonl"],
        help="One or more JSONL result files from the download scripts.",
    )
    parser.add_argument(
        "--api-results",
        default="outputs/runs/api_results.jsonl",
        help="JSONL output from 02_download_api_key_articles.py",
    )
    args = parser.parse_args()

    out_root = ensure_dir(args.out_dir)
    report_dir = ensure_dir(out_root / "reports")

    all_rows = []
    for path in args.results:
        if Path(path).exists():
            all_rows.extend(load_jsonl(path))
    api_rows = load_jsonl(args.api_results) if Path(args.api_results).exists() else []

    final_by_pmid = build_final_index(all_rows)
    failure_report = summarize_failures(final_by_pmid)
    abstract_rows, abstract_summary = summarize_abstract_followups(api_rows)
    tdm_manifest, tdm_summary = summarize_tdm_candidates(abstract_rows)

    write_json(report_dir / "failure_report.json", failure_report)
    (report_dir / "failure_report.md").write_text(build_failure_markdown(failure_report))

    write_jsonl(report_dir / "abstract_followups.jsonl", abstract_rows)
    write_json(report_dir / "abstract_followups_summary.json", abstract_summary)
    (report_dir / "abstract_only_pmids.txt").write_text(
        "".join(f"{item['pmid']}\n" for item in abstract_rows)
    )

    write_jsonl(report_dir / "tdm_candidates_manifest.jsonl", tdm_manifest)
    write_json(report_dir / "tdm_candidates_summary.json", tdm_summary)

    (report_dir / "REPORT_SUMMARY.md").write_text(build_summary(final_by_pmid, tdm_summary, failure_report))
    (report_dir / "NEXT_STEPS.tsv").write_text(build_next_steps_tsv(tdm_manifest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
