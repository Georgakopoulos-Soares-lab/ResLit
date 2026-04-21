#!/usr/bin/env python3
"""Download open-access full text for PMIDs via PMC/NCBI and Europe PMC services.

Retrieval order for each PMID with a PMCID:
  1. PMC OA subset (oa_record found) → PMC OA BioC full text
  2. Europe PMC full-text XML  (open-access articles not always in NCBI OA subset)
  3. NCBI PMC EFetch XML        (free-to-read, but publisher may block body)

Articles where only abstract/title is retrievable are marked as failed so that
02_download_api_key_articles.py can attempt publisher-API routes for them.
"""

from __future__ import annotations

import csv
import tarfile
from pathlib import Path
from urllib.parse import urljoin

from pubmed_common import (
    HttpClient,
    RateLimiter,
    RequestContext,
    build_arg_parser,
    choose_best_oa_link,
    ensure_dir,
    extract_metadata,
    fetch_europepmc_fulltext,
    fetch_idconv,
    fetch_oa_record,
    fetch_pmc_full_xml,
    fetch_pmcoa_bioc,
    fetch_pubmed_summaries,
    flatten_bioc_to_sections,
    flatten_pmc_xml_to_sections,
    html_to_text_sections,
    is_valid_fulltext_content,
    llm_ready_text,
    pmc_xml_has_body,
    print_stderr,
    read_pmids,
    result_record,
    safe_filename,
    sections_have_body,
    write_json,
    write_jsonl,
)


PMC_OA_FILE_LIST_URLS = (
    "https://ftp.ncbi.nlm.nih.gov/pub/pmc/deprecated/oa_file_list.csv",
    "https://ftp.ncbi.nlm.nih.gov/pub/pmc/deprecated/oa_file_list.txt",
    "https://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_file_list.csv",
    "https://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_file_list.txt",
)
PMC_FTP_BASE = "https://ftp.ncbi.nlm.nih.gov/pub/pmc/"
PMC_DEPRECATED_BASE = "https://ftp.ncbi.nlm.nih.gov/pub/pmc/deprecated/"


def ensure_oa_file_list(client: HttpClient, cache_dir: Path, force: bool = False) -> Path | None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    destination = cache_dir / "oa_file_list.csv"
    if destination.exists() and not force:
        return destination
    for url in PMC_OA_FILE_LIST_URLS:
        try:
            client.download_file(url, destination)
            return destination
        except Exception:
            continue
    return destination if destination.exists() else None


def build_oa_bulk_subset(file_list_path: Path, wanted_pmcids: set[str]) -> dict[str, str]:
    matches: dict[str, str] = {}
    if not file_list_path.exists():
        return matches
    with file_list_path.open(newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if not header:
            return matches
        for row in reader:
            if not row:
                continue
            joined = ",".join(row)
            pmcid = ""
            archive_path = ""
            for cell in row:
                cleaned = cell.strip()
                upper = cleaned.upper()
                if upper.startswith("PMC") and upper[3:].isdigit():
                    pmcid = upper
                if cleaned.endswith((".tar.gz", ".tgz")):
                    archive_path = cleaned
            if not pmcid:
                for token in joined.replace('"', " ").split():
                    upper = token.strip(",").upper()
                    if upper.startswith("PMC") and upper[3:].isdigit():
                        pmcid = upper
                        break
            if not archive_path:
                continue
            if pmcid in wanted_pmcids:
                matches[pmcid] = archive_path
                if len(matches) == len(wanted_pmcids):
                    break
    return matches


def resolve_oa_archive_url(archive_path: str) -> str:
    if archive_path.startswith(("http://", "https://")):
        return archive_path
    if archive_path.startswith("oa_package/"):
        return urljoin(PMC_DEPRECATED_BASE, archive_path)
    return urljoin(PMC_FTP_BASE, archive_path.lstrip("/"))


def normalize_legacy_download_link(url: str) -> str:
    if url.startswith("ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/"):
        suffix = url.removeprefix("ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/")
        return urljoin(PMC_DEPRECATED_BASE, suffix)
    if url.startswith("ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/"):
        suffix = url.removeprefix("ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/")
        return urljoin(PMC_FTP_BASE, suffix)
    return url


def extract_xml_from_oa_archive(archive_path: Path) -> tuple[str, str] | None:
    with tarfile.open(archive_path, "r:*") as archive:
        members = archive.getmembers()
        preferred = [
            member for member in members
            if member.isfile() and member.name.lower().endswith((".nxml", ".xml"))
        ]
        preferred.sort(key=lambda member: (not member.name.lower().endswith(".nxml"), len(member.name)))
        for member in preferred:
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            xml_text = extracted.read().decode("utf-8", errors="replace")
            if pmc_xml_has_body(xml_text):
                return member.name, xml_text
    return None


def fetch_pmc_article_html(client: HttpClient, pmcid: str) -> dict | None:
    url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid.upper()}/"
    try:
        response = client.get_response(
            url,
            headers={
                "Accept": "text/html,application/xhtml+xml",
                "Referer": "https://pubmed.ncbi.nlm.nih.gov/",
            },
            timeout=120,
        )
    except Exception:
        return None
    body = response.get("body", "")
    content_type = response.get("content_type", "")
    if "html" not in content_type and "<html" not in body.lower():
        return None
    sections = html_to_text_sections(body, source_label="OA_HTML")
    is_valid, reason, word_count = is_valid_fulltext_content("OA_HTML", sections, raw_text=body)
    if not sections or not is_valid:
        return None
    return {
        "resolved_url": response["url"],
        "html": body,
        "sections": sections,
        "validation_reason": reason,
        "word_count": word_count,
    }


def main() -> int:
    parser = build_arg_parser("Download PMC open-access articles for a PMID list.")
    args = parser.parse_args()

    pmids = read_pmids(args.pmid_file, args.limit)
    out_root = ensure_dir(args.out_dir)
    raw_dir = ensure_dir(out_root / "oa" / "raw")
    text_dir = ensure_dir(out_root / "oa" / "txt")
    meta_dir = ensure_dir(out_root / "oa" / "meta")
    run_dir = ensure_dir(out_root / "runs")
    cache_dir = ensure_dir(out_root / "oa" / "cache")

    ctx = RequestContext(
        tool=args.tool,
        email=args.email,
        rate_limiter=RateLimiter(args.sleep),
    )
    client = HttpClient(ctx)
    summaries = fetch_pubmed_summaries(client, pmids)
    idconv = fetch_idconv(client, pmids)
    wanted_pmcids = {
        str(record.get("pmcid", "")).upper()
        for record in idconv.values()
        if str(record.get("pmcid", "")).upper().startswith("PMC")
    }
    oa_bulk_matches: dict[str, str] = {}
    oa_file_list_path = ensure_oa_file_list(client, cache_dir, force=args.force)
    if oa_file_list_path:
        try:
            oa_bulk_matches = build_oa_bulk_subset(oa_file_list_path, wanted_pmcids)
        except Exception:
            oa_bulk_matches = {}

    results = []
    for idx, pmid in enumerate(pmids, start=1):
        summary = summaries.get(pmid)
        if not summary:
            results.append(result_record(pmid, "failed", "PubMed summary not found"))
            continue

        metadata = extract_metadata(summary, idconv.get(pmid))

        txt_path = text_dir / f"{safe_filename(pmid)}.txt"
        meta_path = meta_dir / f"{safe_filename(pmid)}.json"
        if txt_path.exists() and meta_path.exists() and not args.force:
            results.append(result_record(pmid, "cached", "Existing OA outputs found", metadata=metadata))
            continue

        pmcid = metadata.get("pmcid", "")
        if not pmcid:
            results.append(result_record(pmid, "failed", "No PMCID mapping; not in PMC", metadata=metadata))
            continue

        # ------------------------------------------------------------------
        # Route 0: PMC OA bulk archive -> extract XML/NXML
        # ------------------------------------------------------------------
        archive_relpath = oa_bulk_matches.get(pmcid.upper())
        if archive_relpath:
            archive_url = resolve_oa_archive_url(archive_relpath)
            archive_path = raw_dir / f"{safe_filename(pmid)}_oa_bulk.tar.gz"
            try:
                if args.force or not archive_path.exists():
                    client.download_file(archive_url, archive_path)
                extracted = extract_xml_from_oa_archive(archive_path)
                if extracted:
                    member_name, xml_text = extracted
                    sections = flatten_pmc_xml_to_sections(xml_text)
                    if sections and sections_have_body(sections):
                        raw_xml_path = raw_dir / f"{safe_filename(pmid)}_oa_bulk.nxml"
                        raw_xml_path.write_text(xml_text)
                        metadata["source"] = "PMC_OA_Bulk_XML"
                        metadata["license"] = "pmc_oa_bulk"
                        metadata["raw_file"] = str(raw_xml_path)
                        metadata["raw_archive"] = str(archive_path)
                        metadata["oa_bulk_member"] = member_name
                        metadata["oa_bulk_archive_url"] = archive_url
                        metadata["text_file"] = str(txt_path)
                        metadata["section_count"] = len(sections)
                        txt_path.write_text(llm_ready_text(metadata, sections))
                        write_json(
                            meta_path,
                            {
                                "metadata": metadata,
                                "sections": sections,
                                "raw_pmc_xml": xml_text,
                            },
                        )
                        results.append(result_record(pmid, "success", "Downloaded PMC OA bulk XML", metadata=metadata))
                        print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via PMC_OA_Bulk_XML")
                        continue
                metadata["oa_bulk_no_body"] = True
            except Exception as exc:  # noqa: BLE001
                metadata["oa_bulk_error"] = str(exc)

        # ------------------------------------------------------------------
        # Route 1: PMC OA subset → BioC full text
        # ------------------------------------------------------------------
        try:
            oa_record = fetch_oa_record(client, pmcid)
            if oa_record:
                metadata["source"] = "PMC_OA_BioC"
                metadata["license"] = oa_record.get("license", "")
                metadata["oa_citation"] = oa_record.get("citation", "")
                best_link = choose_best_oa_link(oa_record)
                if best_link:
                    download_link = normalize_legacy_download_link(best_link.get("href", ""))
                    metadata["download_link"] = download_link
                    raw_suffix = ".pdf" if best_link.get("format") == "pdf" else ".tar.gz"
                    raw_path = raw_dir / f"{safe_filename(pmid)}{raw_suffix}"
                    if args.force or not raw_path.exists():
                        client.download_file(download_link, raw_path)
                    metadata["raw_file"] = str(raw_path)
                bioc = fetch_pmcoa_bioc(client, pmid)
                sections = flatten_bioc_to_sections(bioc)
                if sections and sections_have_body(sections):
                    txt_path.write_text(llm_ready_text(metadata, sections))
                    metadata["text_file"] = str(txt_path)
                    metadata["section_count"] = len(sections)
                    write_json(meta_path, {"metadata": metadata, "sections": sections, "oa_record": oa_record})
                    results.append(result_record(pmid, "success", "Downloaded PMC OA BioC full text", metadata=metadata))
                    print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via PMC_OA_BioC")
                    continue
                # BioC returned abstract-only for this OA record → fall through
                metadata["oa_bioc_abstract_only"] = True
        except Exception as exc:  # noqa: BLE001
            metadata["oa_record_error"] = str(exc)

        # ------------------------------------------------------------------
        # Route 2: Europe PMC full-text XML
        # ------------------------------------------------------------------
        try:
            epmc_xml = fetch_europepmc_fulltext(client, pmcid)
            if pmc_xml_has_body(epmc_xml):
                sections = flatten_pmc_xml_to_sections(epmc_xml)
                if sections and sections_have_body(sections):
                    raw_path = raw_dir / f"{safe_filename(pmid)}_epmc.xml"
                    raw_path.write_text(epmc_xml)
                    metadata["source"] = "EuropePMC_FullText_XML"
                    metadata["license"] = "europe_pmc_oa"
                    metadata["raw_file"] = str(raw_path)
                    metadata["text_file"] = str(txt_path)
                    metadata["section_count"] = len(sections)
                    txt_path.write_text(llm_ready_text(metadata, sections))
                    write_json(meta_path, {"metadata": metadata, "sections": sections})
                    results.append(result_record(pmid, "success", "Downloaded Europe PMC full-text XML", metadata=metadata))
                    print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via EuropePMC_FullText_XML")
                    continue
        except Exception as exc:  # noqa: BLE001
            metadata["epmc_fulltext_error"] = str(exc)

        # ------------------------------------------------------------------
        # Route 3: NCBI PMC EFetch XML
        # Only save if the XML actually contains a body (not publisher-blocked)
        # ------------------------------------------------------------------
        try:
            pmc_xml = fetch_pmc_full_xml(client, pmcid)
            if pmc_xml_has_body(pmc_xml):
                sections = flatten_pmc_xml_to_sections(pmc_xml)
                if sections and sections_have_body(sections):
                    raw_path = raw_dir / f"{safe_filename(pmid)}.xml"
                    raw_path.write_text(pmc_xml)
                    metadata["source"] = "PMC_EFetch_XML"
                    metadata["license"] = "pmc_free_to_read"
                    metadata["raw_file"] = str(raw_path)
                    metadata["text_file"] = str(txt_path)
                    metadata["section_count"] = len(sections)
                    txt_path.write_text(llm_ready_text(metadata, sections))
                    write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_pmc_xml": pmc_xml})
                    results.append(result_record(pmid, "success", "Downloaded PMC EFetch full text XML", metadata=metadata))
                    print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via PMC_EFetch_XML")
                    continue
            # Publisher-blocked or body-less XML: mark failed so stage 2 can try
            metadata["pmc_efetch_blocked"] = True
        except Exception as exc:  # noqa: BLE001
            metadata["pmc_efetch_error"] = str(exc)

        # ------------------------------------------------------------------
        # Route 4: PMC article HTML fallback
        # For older scanned PMC records where XML endpoints lack a body,
        # the PMC article page can still expose the full OA text.
        # ------------------------------------------------------------------
        pmc_html = fetch_pmc_article_html(client, pmcid)
        if pmc_html:
            raw_path = raw_dir / f"{safe_filename(pmid)}.html"
            raw_path.write_text(pmc_html["html"])
            metadata["source"] = "OA_HTML"
            metadata["license"] = "pmc_html_oa"
            metadata["raw_file"] = str(raw_path)
            metadata["resolved_url"] = pmc_html["resolved_url"]
            metadata["text_file"] = str(txt_path)
            metadata["section_count"] = len(pmc_html["sections"])
            metadata["body_validation_reason"] = pmc_html.get("validation_reason", "")
            metadata["body_word_count"] = pmc_html.get("word_count", 0)
            txt_path.write_text(llm_ready_text(metadata, pmc_html["sections"]))
            write_json(
                meta_path,
                {
                    "metadata": metadata,
                    "sections": pmc_html["sections"],
                    "raw_html": pmc_html["html"],
                },
            )
            results.append(result_record(pmid, "success", "Downloaded PMC article HTML full text", metadata=metadata))
            print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via OA_HTML")
            continue

        # All routes failed or returned abstract-only
        results.append(result_record(
            pmid, "failed",
            "PMC article has PMCID but no full text retrievable (publisher-blocked or abstract-only)",
            metadata=metadata,
            extra={"failure_category": "pmc_abstract_only"},
        ))
        print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} failed: no body text available")

    write_jsonl(run_dir / "oa_results.jsonl", results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
