#!/usr/bin/env python3
"""Build consolidated reports from OA/API download runs."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

from pubmed_common import (
    build_arg_parser,
    ensure_dir,
    infer_failure_category,
    load_jsonl,
    write_json,
    write_jsonl,
)


SOURCE_PRIORITY = {
    "Elsevier_Candidate_XML": 6,
    "PMC_OA_BioC": 6,
    "PMC_OA_Bulk_XML": 6,
    "PMC_EFetch_XML": 6,
    "EuropePMC_FullText_XML": 6,
    "Springer_OpenAccess_API": 6,
    "Elsevier_Candidate_Text": 5,
    "OA_HTML": 4,
    "Publisher_HTML": 4,
    "Wiley_TDM_PDF": 3,
    "PubMed_BioC": 2,
}


def row_priority(row: dict) -> tuple[int, int]:
    status = row.get("status")
    metadata = row.get("metadata") or {}
    source = metadata.get("source", "")
    if status == "success":
        return (SOURCE_PRIORITY.get(source, 3), 1)
    return (1, 0)


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
        if row_priority(row) >= row_priority(current):
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
    reason_counts = Counter()

    for row in api_rows:
        metadata = row.get("metadata") or {}
        if row.get("status") != "success" or metadata.get("source") != "PubMed_BioC":
            continue
        followup_status = metadata.get("followup_status", "unknown")
        abstract_only_reason = metadata.get("abstract_only_reason", "unknown")
        status_counts[followup_status] += 1
        reason_counts[abstract_only_reason] += 1
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
                "abstract_only_reason": abstract_only_reason,
                "fulltext_candidate_count": metadata.get("fulltext_candidate_count", 0),
                "fulltext_candidates": metadata.get("fulltext_candidates", []),
                "text_file": metadata.get("text_file", ""),
                "pdf_fallback_bucket": metadata.get("pdf_fallback_bucket", ""),
                "backend_errors": metadata.get("backend_errors", []),
                "tried_backends": metadata.get("tried_backends", []),
            }
        )

    abstract_rows.sort(key=lambda item: (item["abstract_only_reason"], item["followup_status"], item["pmid"]))
    summary = {
        "abstract_only_count": len(abstract_rows),
        "followup_status_counts": dict(status_counts.most_common()),
        "abstract_only_reason_counts": dict(reason_counts.most_common()),
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


def load_validated_text_summary(out_root: Path) -> dict:
    report_dir = out_root / "reports"
    clean_dir = out_root / "clean_fulltext_body"

    body_filter_summary = {}
    clean_export_summary = {}
    if (report_dir / "fulltext_body_filter_summary.json").exists():
        body_filter_summary = json.loads((report_dir / "fulltext_body_filter_summary.json").read_text())
    if (clean_dir / "SUMMARY.json").exists():
        clean_export_summary = json.loads((clean_dir / "SUMMARY.json").read_text())

    validated_count = (
        clean_export_summary.get("retained_count")
        or body_filter_summary.get("retained_after_body_filter")
    )
    filtered_count = body_filter_summary.get("filtered_no_real_body")

    if not validated_count and not filtered_count:
        return {}

    return {
        "validated_fulltext_count": validated_count,
        "filtered_non_body_count": filtered_count,
        "retained_by_source": (
            clean_export_summary.get("by_source")
            or body_filter_summary.get("retained_by_source")
            or {}
        ),
    }


def build_summary(
    final_by_pmid: dict[str, dict],
    tdm_summary: dict,
    failure_report: dict,
    validated_summary: dict | None = None,
) -> str:
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
        f"- Retrieval-level full-text: {fulltext_count}",
        f"- Abstract-only: {abstract_count}",
        f"- Failed: {failed_count}",
        "",
    ]

    if validated_summary:
        validated_count = validated_summary.get("validated_fulltext_count")
        filtered_non_body = validated_summary.get("filtered_non_body_count")
        lines.extend(
            [
                "## Validated text totals",
                (
                    f"- Verified full-text after body validation: {validated_count}"
                    if validated_count is not None
                    else "- Verified full-text after body validation: unavailable"
                ),
                (
                    f"- Retrieval-level full-text excluded as preview/placeholder/non-body: {filtered_non_body}"
                    if filtered_non_body is not None
                    else "- Retrieval-level full-text excluded as preview/placeholder/non-body: unavailable"
                ),
                "",
                "## Usage note",
                "- Use the validated full-text count above as the main LLM/RAG corpus size.",
                "- The retrieval-level full-text count includes records that reached a nominal full-text route but may still be preview pages, PDF placeholders, or metadata-only captures.",
                "",
            ]
        )

    lines.extend(
        [
        "## Full-text source distribution",
        ]
    )
    for source, count in success_sources.most_common():
        if source == "PubMed_BioC":
            continue
        lines.append(f"- {source}: {count}")

    if validated_summary and validated_summary.get("retained_by_source"):
        lines.extend(["", "## Validated full-text by source"])
        for source, count in validated_summary["retained_by_source"].items():
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


def build_api_attempt_manifest(api_rows: list[dict]) -> list[dict]:
    manifest = []
    for row in api_rows:
        metadata = row.get("metadata") or {}
        manifest.append(
            {
                "pmid": row.get("pmid"),
                "status": row.get("status"),
                "reason": row.get("reason", ""),
                "final_source": metadata.get("source", ""),
                "publisher_family": metadata.get("publisher_family", "") or "Unclassified",
                "journal": metadata.get("journal", ""),
                "doi": metadata.get("doi", ""),
                "followup_status": metadata.get("followup_status", ""),
                "abstract_only_reason": metadata.get("abstract_only_reason", ""),
                "tried_backends": metadata.get("tried_backends", []),
                "backend_errors": metadata.get("backend_errors", []),
            }
        )
    return manifest


def summarize_api_monitoring(api_rows: list[dict]) -> tuple[dict, list[dict]]:
    backend_attempt_counts = Counter()
    backend_error_counts = Counter()
    error_type_counts = Counter()
    http_status_counts = Counter()
    abstract_reason_counts = Counter()
    abstract_reason_by_family = Counter()
    error_examples = []

    for row in api_rows:
        metadata = row.get("metadata") or {}
        family = metadata.get("publisher_family", "") or "Unclassified"
        for backend in metadata.get("tried_backends", []):
            backend_attempt_counts[backend] += 1
        if metadata.get("source") == "PubMed_BioC":
            reason = metadata.get("abstract_only_reason", "unknown")
            abstract_reason_counts[reason] += 1
            abstract_reason_by_family[f"{family}::{reason}"] += 1
        for error in metadata.get("backend_errors", []):
            backend = error.get("backend", "unknown")
            message = error.get("message", "")
            http_status = error.get("http_status", "")
            backend_error_counts[backend] += 1
            error_type = "http_error" if http_status else infer_failure_category({"reason": message})
            error_type_counts[error_type] += 1
            if http_status:
                http_status_counts[http_status] += 1
            if len(error_examples) < 200:
                error_examples.append(
                    {
                        "pmid": row.get("pmid"),
                        "backend": backend,
                        "error_type": error_type,
                        "http_status": http_status,
                        "publisher_family": family,
                        "message": message,
                    }
                )

    summary = {
        "backend_attempt_counts": dict(backend_attempt_counts.most_common()),
        "backend_error_counts": dict(backend_error_counts.most_common()),
        "error_type_counts": dict(error_type_counts.most_common()),
        "http_status_counts": dict(http_status_counts.most_common()),
        "abstract_only_reason_counts": dict(abstract_reason_counts.most_common()),
        "abstract_only_reason_by_family": dict(abstract_reason_by_family.most_common()),
    }
    return summary, error_examples


def summarize_candidate_hosts(abstract_rows: list[dict]) -> dict:
    by_reason = Counter()
    by_reason_host = Counter()
    for row in abstract_rows:
        reason = row.get("abstract_only_reason", "unknown")
        hosts_seen = set()
        for candidate in row.get("fulltext_candidates", []):
            url = candidate.get("url", "")
            if not url:
                continue
            host = urlparse(url).netloc.lower()
            if not host or host in hosts_seen:
                continue
            hosts_seen.add(host)
            by_reason[f"{reason}::{host}"] += 1
    return {
        "reason_host_counts": dict(by_reason.most_common(200)),
    }


def build_backend_error_examples_tsv(items: list[dict]) -> str:
    lines = ["pmid\tbackend\terror_type\thttp_status\tpublisher_family\tmessage"]
    for item in items:
        lines.append(
            "\t".join(
                [
                    str(item.get("pmid", "")),
                    str(item.get("backend", "")),
                    str(item.get("error_type", "")),
                    str(item.get("http_status", "")),
                    str(item.get("publisher_family", "")),
                    str(item.get("message", "")).replace("\t", " ").replace("\n", " "),
                ]
            )
        )
    return "\n".join(lines) + "\n"


def resolution_for_abstract_reason(reason: str) -> str:
    mapping = {
        "publisher_gate": "Use institution-authenticated access, licensed TDM, or a manual browser session with entitlement.",
        "candidate_html_only": "Add site-specific HTML extraction rules or manual capture from the landing page.",
        "candidate_html_and_pdf": "Retry publisher HTML/PDF with stronger headers or authenticated access; otherwise archive PDF and extract text separately.",
        "elsevier_candidate_only": "Elsevier candidate endpoints were found but did not yield reusable body text. Retry Elsevier APIs sparingly, then fall back to manual PDF/HTML or institutional access.",
        "wiley_legacy_pdf": "Use Wiley TDM/manual PDF retrieval and then run PDF text extraction.",
        "no_candidate_found": "Manual DOI/source discovery via Crossref, PubMed, journal site, or institutional search.",
        "temporary_network_or_api_error": "Retry the affected backend with backoff; treat as transient rather than structural.",
        "candidate_pdf_only": "Archive the PDF and run a PDF-to-text step.",
        "candidate_unusable": "Review candidate URLs manually and add a site-specific fetch rule if a stable source exists.",
    }
    return mapping.get(reason, "Manual review required.")


def resolution_for_backend_error(backend: str, http_status: str, message: str) -> str:
    if backend == "openalex" and http_status == "429":
        return "OpenAlex budget exhausted. Add credits, wait for reset, or skip OpenAlex because it is only enrichment."
    if backend in {"europepmc_fulltext", "europepmc_core"} and http_status in {"503", "504"}:
        return "Europe PMC transient upstream failure. Retry later with backoff."
    if backend == "europepmc_fulltext" and http_status == "404":
        return "PMCID exists but Europe PMC does not expose fullTextXML. Fall back to PMC EFetch or publisher routes."
    if backend == "elsevier_candidate_fulltext":
        return "Elsevier candidate endpoint returned metadata-only XML. Use other publisher routes or manual PDF."
    if backend == "pubmed_bioc":
        return "Retry PubMed BioC or use PubMed abstract/EFetch fallback."
    if http_status == "403":
        return "Publisher denied anonymous access. Requires institution-authenticated access or licensed TDM."
    if http_status == "404":
        return "Candidate endpoint not present for this article. Use another source or manual review."
    if message:
        return "Review backend-specific response and either retry later or switch to another source."
    return "Manual review required."


def build_resolution_summary(
    abstract_summary: dict,
    api_monitoring_summary: dict,
    failure_report: dict,
) -> dict:
    abstract_resolutions = {
        reason: {
            "count": count,
            "suggested_action": resolution_for_abstract_reason(reason),
        }
        for reason, count in (abstract_summary.get("abstract_only_reason_counts") or {}).items()
    }
    backend_resolutions = {}
    for backend, count in (api_monitoring_summary.get("backend_error_counts") or {}).items():
        backend_resolutions[backend] = {
            "count": count,
            "suggested_action": resolution_for_backend_error(backend, "", ""),
        }
    failure_resolutions = {
        category: {
            "count": count,
            "suggested_action": (
                "Fix the malformed/invalid PMID input and rerun."
                if category in {"missing_doi", "other"}
                else "Retry with another source or manual review."
            ),
        }
        for category, count in (failure_report.get("failure_categories") or {}).items()
    }
    return {
        "abstract_only_reasons": abstract_resolutions,
        "backend_errors": backend_resolutions,
        "remaining_failures": failure_resolutions,
    }


def build_resolution_markdown(summary: dict) -> str:
    lines = ["# Resolution Guide", "", "## Abstract-only reasons"]
    for reason, payload in summary["abstract_only_reasons"].items():
        lines.append(f"- {reason}: {payload['count']} | {payload['suggested_action']}")
    lines.extend(["", "## Backend errors"])
    for backend, payload in summary["backend_errors"].items():
        lines.append(f"- {backend}: {payload['count']} | {payload['suggested_action']}")
    lines.extend(["", "## Remaining failures"])
    for category, payload in summary["remaining_failures"].items():
        lines.append(f"- {category}: {payload['count']} | {payload['suggested_action']}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = build_arg_parser("Build consolidated reports from OA/API download runs.")
    parser.add_argument(
        "--results",
        nargs="+",
        default=None,
        help="One or more JSONL result files from the download scripts.",
    )
    parser.add_argument(
        "--api-results",
        default=None,
        help="JSONL output from 02_download_api_key_articles.py",
    )
    args = parser.parse_args()

    out_root = ensure_dir(args.out_dir)
    report_dir = ensure_dir(out_root / "reports")
    run_dir = out_root / "runs"
    result_paths = args.results or [str(run_dir / "oa_results.jsonl"), str(run_dir / "api_results.jsonl")]
    api_results_path = Path(args.api_results) if args.api_results else run_dir / "api_results.jsonl"

    all_rows = []
    for path in result_paths:
        if Path(path).exists():
            all_rows.extend(load_jsonl(path))
    api_rows = load_jsonl(api_results_path) if api_results_path.exists() else []

    final_by_pmid = build_final_index(all_rows)
    failure_report = summarize_failures(final_by_pmid)
    abstract_rows, abstract_summary = summarize_abstract_followups(api_rows)
    tdm_manifest, tdm_summary = summarize_tdm_candidates(abstract_rows)
    api_attempt_manifest = build_api_attempt_manifest(api_rows)
    api_monitoring_summary, backend_error_examples = summarize_api_monitoring(api_rows)
    candidate_host_summary = summarize_candidate_hosts(abstract_rows)
    resolution_summary = build_resolution_summary(abstract_summary, api_monitoring_summary, failure_report)
    validated_summary = load_validated_text_summary(out_root)

    write_json(report_dir / "failure_report.json", failure_report)
    (report_dir / "failure_report.md").write_text(build_failure_markdown(failure_report))

    write_jsonl(report_dir / "abstract_followups.jsonl", abstract_rows)
    write_json(report_dir / "abstract_followups_summary.json", abstract_summary)
    (report_dir / "abstract_only_pmids.txt").write_text(
        "".join(f"{item['pmid']}\n" for item in abstract_rows)
    )

    write_jsonl(report_dir / "tdm_candidates_manifest.jsonl", tdm_manifest)
    write_json(report_dir / "tdm_candidates_summary.json", tdm_summary)
    write_jsonl(report_dir / "api_attempt_manifest.jsonl", api_attempt_manifest)
    write_json(report_dir / "api_monitoring_summary.json", api_monitoring_summary)
    write_json(report_dir / "candidate_host_summary.json", candidate_host_summary)
    write_json(report_dir / "resolution_summary.json", resolution_summary)
    (report_dir / "backend_error_examples.tsv").write_text(build_backend_error_examples_tsv(backend_error_examples))
    (report_dir / "RESOLUTION_GUIDE.md").write_text(build_resolution_markdown(resolution_summary))

    if validated_summary:
        write_json(report_dir / "validated_text_summary.json", validated_summary)

    (report_dir / "REPORT_SUMMARY.md").write_text(
        build_summary(final_by_pmid, tdm_summary, failure_report, validated_summary)
    )
    (report_dir / "NEXT_STEPS.tsv").write_text(build_next_steps_tsv(tdm_manifest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
