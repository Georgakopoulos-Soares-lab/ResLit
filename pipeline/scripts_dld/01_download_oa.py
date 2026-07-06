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
import os
import re
import tarfile
import tempfile
from pathlib import Path
from urllib import parse
from urllib.parse import urljoin, urlparse

from pubmed_common import (
    CROSSREF_WORKS_BASE,
    HttpClient,
    RateLimiter,
    RequestContext,
    build_arg_parser,
    choose_best_oa_link,
    ensure_dir,
    extract_metadata,
    fetch_europepmc_core,
    fetch_europepmc_fulltext,
    fetch_idconv,
    fetch_oa_record,
    fetch_pmc_full_xml,
    fetch_pmcoa_bioc,
    fetch_pubmed_summaries,
    fetch_unpaywall_record,
    flatten_bioc_to_sections,
    flatten_pmc_xml_to_sections,
    html_to_text_sections,
    is_valid_fulltext_content,
    llm_ready_text,
    OpenAlexBudgetExhausted,
    pmc_xml_has_body,
    print_stderr,
    read_pmids,
    result_record,
    safe_filename,
    search_openalex_title,
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
            timeout=30,
        )
    except Exception as exc:
        return {"error": str(exc), "outcome": "exception", "url": url}
    body = response.get("body", "")
    content_type = response.get("content_type", "")
    if "html" not in content_type and "<html" not in body.lower():
        return {"error": f"non-html content_type={content_type}", "outcome": "not_html", "url": response.get("url", url)}
    sections = html_to_text_sections(body, source_label="OA_HTML")
    is_valid, reason, word_count = is_valid_fulltext_content("OA_HTML", sections, raw_text=body)
    if not sections or not is_valid:
        return {"error": f"validation_failed reason={reason} words={word_count}", "outcome": "validation_failed", "url": response.get("url", url), "validation_reason": reason, "word_count": word_count}
    return {
        "resolved_url": response["url"],
        "html": body,
        "sections": sections,
        "validation_reason": reason,
        "word_count": word_count,
    }


def normalize_doi(doi: str) -> str:
    return doi.strip().removeprefix("https://doi.org/").removeprefix("http://doi.org/")


def fetch_crossref_metadata(client: HttpClient, doi: str) -> dict:
    return client.get_json(
        f"{CROSSREF_WORKS_BASE}/{parse.quote(normalize_doi(doi), safe='')}",
        headers={"Accept": "application/json"},
    )


def build_fulltext_candidates(metadata: dict) -> list[dict]:
    doi = metadata.get("doi", "")
    candidates = []
    seen = set()

    if doi:
        doi = normalize_doi(doi)
        candidates.append(
            {
                "source": "doi_primary",
                "type": "landing_page",
                "url": f"https://doi.org/{parse.quote(doi, safe='/')}",
            }
        )

    resource_url = ((metadata.get("crossref_resource") or {}).get("primary") or {}).get("URL")
    if resource_url:
        candidates.append({"source": "crossref_resource", "type": "landing_page", "url": resource_url})

    for link in metadata.get("crossref_link", []) or []:
        url = link.get("URL") or ""
        if not url:
            continue
        lowered = url.lower()
        if lowered.endswith(".pdf") or "/article-pdf/" in lowered or "/doi/pdf/" in lowered:
            candidates.append({"source": "publisher_pdf", "type": "pdf", "url": url})
        else:
            candidates.append({"source": "publisher_link", "type": "landing_page", "url": url})

    deduped = []
    for item in candidates:
        key = (item["type"], item["url"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def merge_candidates(metadata: dict, new_candidates: list[dict]) -> None:
    existing = metadata.get("fulltext_candidates", []) or []
    seen = {(item.get("type"), item.get("url")) for item in existing}
    for item in new_candidates:
        key = (item.get("type"), item.get("url"))
        if not item.get("url") or key in seen:
            continue
        existing.append(item)
        seen.add(key)
    metadata["fulltext_candidates"] = existing


def derive_publisher_html_variants(url: str, doi: str) -> list[str]:
    variants: list[str] = []
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path

    def add(value: str) -> None:
        if value and value not in variants:
            variants.append(value)

    add(url)

    if "tandfonline.com" in host:
        normalized = normalize_doi(doi)
        if normalized:
            encoded = parse.quote(normalized, safe="/")
            add(f"https://www.tandfonline.com/doi/full/{encoded}")
            add(f"https://www.tandfonline.com/doi/{encoded}")
        if "/doi/abs/" in path:
            add(url.replace("/doi/abs/", "/doi/full/"))
        if "/doi/pdf/" in path:
            add(url.replace("/doi/pdf/", "/doi/full/"))

    if "journals.lww.com" in host:
        if "/abstract/" in path:
            add(url.replace("/abstract/", "/fulltext/"))
        if parsed.path.lower().endswith(".aspx") and "/fulltext/" in path:
            add(url)

    return variants


def collect_external_candidates(
    client: HttpClient,
    metadata: dict,
    skip_openalex: bool = False,
    openalex_budget_exhausted: list | None = None,
) -> None:
    external_meta = metadata.setdefault("external_sources", {})
    new_candidates: list[dict] = []
    doi = normalize_doi(metadata.get("doi", "")) if metadata.get("doi") else ""

    if doi and not client.ctx.email.endswith("@example.com"):
        try:
            unpaywall = fetch_unpaywall_record(client, doi)
            external_meta["unpaywall_status"] = "ok"
            external_meta["unpaywall_is_oa"] = unpaywall.get("is_oa")
            external_meta["unpaywall_oa_status"] = unpaywall.get("oa_status")
            locations = []
            if unpaywall.get("best_oa_location"):
                locations.append(unpaywall["best_oa_location"])
            locations.extend(unpaywall.get("oa_locations", []) or [])
            seen = set()
            for loc in locations:
                landing = loc.get("url_for_landing_page") or loc.get("url")
                pdf = loc.get("url_for_pdf")
                if landing and landing not in seen:
                    new_candidates.append({"source": "unpaywall", "type": "landing_page", "url": landing})
                    seen.add(landing)
                if pdf and pdf not in seen:
                    new_candidates.append({"source": "unpaywall", "type": "pdf", "url": pdf})
                    seen.add(pdf)
        except Exception as exc:  # noqa: BLE001
            external_meta["unpaywall_status"] = f"error: {exc}"

    title = (metadata.get("title") or "").strip()
    already_exhausted = openalex_budget_exhausted is not None and openalex_budget_exhausted
    if skip_openalex or already_exhausted:
        external_meta["openalex_status"] = "skipped" if skip_openalex else "skipped_budget_exhausted"
    elif title:
        try:
            openalex = search_openalex_title(client, title, doi=doi)
            if openalex:
                external_meta["openalex_status"] = "ok"
                primary_location = openalex.get("primary_location") or {}
                landing = primary_location.get("landing_page_url") or ""
                pdf = primary_location.get("pdf_url") or ""
                if landing:
                    new_candidates.append({"source": "openalex", "type": "landing_page", "url": landing})
                if pdf:
                    new_candidates.append({"source": "openalex", "type": "pdf", "url": pdf})
                best_oa = openalex.get("best_oa_location") or {}
                if best_oa.get("landing_page_url"):
                    new_candidates.append({"source": "openalex_best_oa", "type": "landing_page", "url": best_oa["landing_page_url"]})
                if best_oa.get("pdf_url"):
                    new_candidates.append({"source": "openalex_best_oa", "type": "pdf", "url": best_oa["pdf_url"]})
            else:
                external_meta["openalex_status"] = "empty"
        except OpenAlexBudgetExhausted as exc:
            external_meta["openalex_status"] = "skipped_budget_exhausted"
            if openalex_budget_exhausted is not None:
                openalex_budget_exhausted.append(True)
        except Exception as exc:  # noqa: BLE001
            external_meta["openalex_status"] = f"error: {exc}"

    try:
        epmc = fetch_europepmc_core(client, metadata["pmid"])
        external_meta["europepmc_status"] = "ok"
        results = (((epmc or {}).get("resultList") or {}).get("result") or [])
        if results:
            result = results[0]
            # Extract PMCID from EuropePMC result — NCBI idconv may have missed it
            epmc_pmcid = (result.get("pmcid") or "").strip().upper()
            if epmc_pmcid and epmc_pmcid.startswith("PMC"):
                external_meta["epmc_pmcid"] = epmc_pmcid
                if not metadata.get("pmcid"):
                    metadata["epmc_pmcid"] = epmc_pmcid
            ft_list = (result.get("fullTextUrlList") or {}).get("fullTextUrl", []) or []
            if isinstance(ft_list, dict):
                ft_list = [ft_list]
            for item in ft_list:
                url = item.get("url") or ""
                doc_style = (item.get("documentStyle") or "").lower()
                if not url:
                    continue
                if "pdf" in doc_style or url.lower().endswith(".pdf"):
                    new_candidates.append({"source": "europepmc", "type": "pdf", "url": url})
                else:
                    new_candidates.append({"source": "europepmc", "type": "landing_page", "url": url})
    except Exception as exc:  # noqa: BLE001
        external_meta["europepmc_status"] = f"error: {exc}"

    merge_candidates(metadata, new_candidates)


def fetch_publisher_html(
    client: HttpClient,
    doi: str,
    crossref_links: list[dict],
    resource_url: str = "",
    fulltext_candidates: list[dict] | None = None,
    debug_log: list | None = None,
) -> dict | None:
    normalized = normalize_doi(doi)
    candidates = [("doi_resolver", f"https://doi.org/{parse.quote(normalized, safe='/')}")]
    if resource_url:
        candidates.append(("crossref_resource", resource_url))

    for link in crossref_links or []:
        url = link.get("URL") or ""
        if not url:
            continue
        host = urlparse(url).netloc.lower()
        source = "pmc_html" if host in {"pmc.ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov"} else "publisher_html"
        for variant in derive_publisher_html_variants(url, normalized):
            candidates.append((source, variant))

    for item in fulltext_candidates or []:
        url = item.get("url") or ""
        if item.get("type") != "landing_page" or not url:
            continue
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.lower()
        source = "pmc_html" if host in {"ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov"} and "/pmc/articles/" in path else "publisher_html"
        for variant in derive_publisher_html_variants(url, normalized):
            candidates.append((source, variant))

    seen = set()
    for source_name, url in candidates:
        if url in seen:
            continue
        seen.add(url)
        attempt: dict = {"source": source_name, "url": url}
        try:
            response = client.get_response(
                url,
                headers={
                    "Accept": "text/html,application/xhtml+xml",
                    "Referer": "https://pubmed.ncbi.nlm.nih.gov/",
                },
                timeout=30,
            )
        except Exception as exc:
            attempt["outcome"] = "exception"
            attempt["error"] = str(exc)
            if debug_log is not None:
                debug_log.append(attempt)
            continue
        final_url = response["url"]
        content_type = response.get("content_type", "")
        body = response.get("body", "")
        attempt["final_url"] = final_url
        attempt["content_type"] = content_type
        attempt["body_length"] = len(body)
        if "html" not in content_type and "<html" not in body.lower():
            attempt["outcome"] = "not_html"
            if debug_log is not None:
                debug_log.append(attempt)
            continue
        source_label = "OA_HTML" if source_name == "pmc_html" else "PUBLISHER_HTML"
        sections = html_to_text_sections(body, source_label=source_label)
        normalized_source = "OA_HTML" if source_label == "OA_HTML" else "Publisher_HTML"
        is_valid, reason, word_count = is_valid_fulltext_content(normalized_source, sections, raw_text=body)
        attempt["section_count"] = len(sections)
        attempt["word_count"] = word_count
        attempt["validation_reason"] = reason
        if sections and is_valid:
            attempt["outcome"] = "success"
            if debug_log is not None:
                debug_log.append(attempt)
            return {
                "source_name": source_name,
                "resolved_url": final_url,
                "html": body,
                "sections": sections,
                "validation_reason": reason,
                "word_count": word_count,
            }
        attempt["outcome"] = "validation_failed"
        if debug_log is not None:
            debug_log.append(attempt)
    return None


def main() -> int:
    parser = build_arg_parser("Download PMC open-access articles for a PMID list.")
    parser.add_argument(
        "--skip-oa-bulk",
        action="store_true",
        help="Skip the PMC OA bulk file-list prefetch and archive route.",
    )
    parser.add_argument(
        "--skip-external",
        action="store_true",
        help="Skip Unpaywall, OpenAlex, and EuropePMC-core calls in DOI fallback route. Faster but slightly lower coverage.",
    )
    parser.add_argument(
        "--skip-raw",
        action="store_true",
        help="Do not save raw HTML/XML/archive files. Saves disk space during bulk downloads.",
    )
    args = parser.parse_args()

    pmids = read_pmids(args.pmid_file, args.limit)
    out_root = ensure_dir(args.out_dir)
    raw_dir = ensure_dir(out_root / "oa" / "raw") if not args.skip_raw else None
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
    if not args.skip_oa_bulk:
        oa_file_list_path = ensure_oa_file_list(client, cache_dir, force=args.force)
        if oa_file_list_path:
            try:
                oa_bulk_matches = build_oa_bulk_subset(oa_file_list_path, wanted_pmcids)
            except Exception:
                oa_bulk_matches = {}

    openalex_budget_exhausted: list = []
    results = []
    for idx, pmid in enumerate(pmids, start=1):
        summary = summaries.get(pmid)
        if not summary:
            results.append(result_record(pmid, "failed", "PubMed summary not found"))
            continue

        metadata = extract_metadata(summary, idconv.get(pmid))
        if metadata.get("doi"):
            metadata["doi"] = normalize_doi(metadata["doi"])

        txt_path = text_dir / f"{safe_filename(pmid)}.txt"
        meta_path = meta_dir / f"{safe_filename(pmid)}.json"
        if txt_path.exists() and meta_path.exists() and not args.force:
            results.append(result_record(pmid, "cached", "Existing OA outputs found", metadata=metadata))
            continue

        pmcid = metadata.get("pmcid", "")
        if pmcid:
            # ------------------------------------------------------------------
            # Route 0: PMC OA bulk archive -> extract XML/NXML
            # ------------------------------------------------------------------
            archive_relpath = oa_bulk_matches.get(pmcid.upper())
            if archive_relpath:
                archive_url = resolve_oa_archive_url(archive_relpath)
                _tmp_archive: Path | None = None
                if raw_dir is not None:
                    archive_path: Path = raw_dir / f"{safe_filename(pmid)}_oa_bulk.tar.gz"
                else:
                    fd, _tmp = tempfile.mkstemp(suffix=".tar.gz")
                    os.close(fd)
                    archive_path = Path(_tmp)
                    _tmp_archive = archive_path
                try:
                    if raw_dir is None or args.force or not archive_path.exists():
                        client.download_file(archive_url, archive_path)
                    extracted = extract_xml_from_oa_archive(archive_path)
                    if extracted:
                        member_name, xml_text = extracted
                        sections = flatten_pmc_xml_to_sections(xml_text)
                        if sections and sections_have_body(sections):
                            if raw_dir is not None:
                                raw_xml_path = raw_dir / f"{safe_filename(pmid)}_oa_bulk.nxml"
                                raw_xml_path.write_text(xml_text)
                                metadata["raw_file"] = str(raw_xml_path)
                                metadata["raw_archive"] = str(archive_path)
                            metadata["source"] = "PMC_OA_Bulk_XML"
                            metadata["license"] = "pmc_oa_bulk"
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
                finally:
                    if _tmp_archive is not None:
                        _tmp_archive.unlink(missing_ok=True)

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
                        if raw_dir is not None:
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
                        if raw_dir is not None:
                            raw_path = raw_dir / f"{safe_filename(pmid)}_epmc.xml"
                            raw_path.write_text(epmc_xml)
                            metadata["raw_file"] = str(raw_path)
                        metadata["source"] = "EuropePMC_FullText_XML"
                        metadata["license"] = "europe_pmc_oa"
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
            # ------------------------------------------------------------------
            try:
                pmc_xml = fetch_pmc_full_xml(client, pmcid)
                if pmc_xml_has_body(pmc_xml):
                    sections = flatten_pmc_xml_to_sections(pmc_xml)
                    if sections and sections_have_body(sections):
                        if raw_dir is not None:
                            raw_path = raw_dir / f"{safe_filename(pmid)}.xml"
                            raw_path.write_text(pmc_xml)
                            metadata["raw_file"] = str(raw_path)
                        metadata["source"] = "PMC_EFetch_XML"
                        metadata["license"] = "pmc_free_to_read"
                        metadata["text_file"] = str(txt_path)
                        metadata["section_count"] = len(sections)
                        txt_path.write_text(llm_ready_text(metadata, sections))
                        write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_pmc_xml": pmc_xml})
                        results.append(result_record(pmid, "success", "Downloaded PMC EFetch full text XML", metadata=metadata))
                        print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via PMC_EFetch_XML")
                        continue
                metadata["pmc_efetch_blocked"] = True
            except Exception as exc:  # noqa: BLE001
                metadata["pmc_efetch_error"] = str(exc)

            # ------------------------------------------------------------------
            # Route 4: PMC article HTML fallback
            # ------------------------------------------------------------------
            pmc_html = fetch_pmc_article_html(client, pmcid)
            if pmc_html and "sections" in pmc_html:
                if raw_dir is not None:
                    raw_path = raw_dir / f"{safe_filename(pmid)}.html"
                    raw_path.write_text(pmc_html["html"])
                    metadata["raw_file"] = str(raw_path)
                metadata["source"] = "OA_HTML"
                metadata["license"] = "pmc_html_oa"
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
            elif pmc_html:
                metadata["pmc_html_error"] = pmc_html.get("error", "")
                metadata["pmc_html_outcome"] = pmc_html.get("outcome", "")
                metadata["pmc_html_validation_reason"] = pmc_html.get("validation_reason", "")
                metadata["pmc_html_word_count"] = pmc_html.get("word_count")

        # ------------------------------------------------------------------
        # Route 5: DOI-based OA discovery for records without usable PMC body
        # ------------------------------------------------------------------
        if metadata.get("doi"):
            try:
                crossref_payload = fetch_crossref_metadata(client, metadata["doi"])
                metadata["crossref_status"] = "ok"
                metadata["crossref_link"] = crossref_payload.get("message", {}).get("link", [])
                metadata["crossref_resource"] = crossref_payload.get("message", {}).get("resource", {})
            except Exception as exc:  # noqa: BLE001
                metadata["crossref_status"] = f"error: {exc}"
                metadata["crossref_link"] = []
                metadata["crossref_resource"] = {}

            metadata["fulltext_candidates"] = build_fulltext_candidates(metadata)
            collect_external_candidates(
                client,
                metadata,
                skip_openalex=args.skip_external,
                openalex_budget_exhausted=openalex_budget_exhausted,
            )

            # ------------------------------------------------------------------
            # Route 5.5: EuropePMC fulltext XML via PMCID found by EuropePMC core
            # Handles articles where NCBI idconv has no PMCID but EuropePMC does.
            # ------------------------------------------------------------------
            epmc_pmcid = metadata.get("epmc_pmcid", "")
            if epmc_pmcid and not pmcid:
                try:
                    epmc_xml = fetch_europepmc_fulltext(client, epmc_pmcid)
                    if pmc_xml_has_body(epmc_xml):
                        sections = flatten_pmc_xml_to_sections(epmc_xml)
                        if sections and sections_have_body(sections):
                            if raw_dir is not None:
                                raw_path = raw_dir / f"{safe_filename(pmid)}_epmc.xml"
                                raw_path.write_text(epmc_xml)
                                metadata["raw_file"] = str(raw_path)
                            metadata["source"] = "EuropePMC_FullText_XML"
                            metadata["license"] = "europe_pmc_oa"
                            metadata["text_file"] = str(txt_path)
                            metadata["section_count"] = len(sections)
                            txt_path.write_text(llm_ready_text(metadata, sections))
                            write_json(meta_path, {"metadata": metadata, "sections": sections})
                            results.append(result_record(pmid, "success", "Downloaded Europe PMC full-text XML via epmc_pmcid", metadata=metadata))
                            print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via EuropePMC_FullText_XML")
                            continue
                except Exception as exc:  # noqa: BLE001
                    metadata["epmc_pmcid_fulltext_error"] = str(exc)

                try:
                    pmc_xml = fetch_pmc_full_xml(client, epmc_pmcid)
                    if pmc_xml_has_body(pmc_xml):
                        sections = flatten_pmc_xml_to_sections(pmc_xml)
                        if sections and sections_have_body(sections):
                            if raw_dir is not None:
                                raw_path = raw_dir / f"{safe_filename(pmid)}.xml"
                                raw_path.write_text(pmc_xml)
                                metadata["raw_file"] = str(raw_path)
                            metadata["source"] = "PMC_EFetch_XML"
                            metadata["license"] = "pmc_free_to_read"
                            metadata["text_file"] = str(txt_path)
                            metadata["section_count"] = len(sections)
                            txt_path.write_text(llm_ready_text(metadata, sections))
                            write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_pmc_xml": pmc_xml})
                            results.append(result_record(pmid, "success", "Downloaded PMC EFetch full text XML via epmc_pmcid", metadata=metadata))
                            print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via PMC_EFetch_XML")
                            continue
                    metadata["epmc_pmcid_efetch_blocked"] = True
                except Exception as exc:  # noqa: BLE001
                    metadata["epmc_pmcid_efetch_error"] = str(exc)

            publisher_html_attempts: list = []
            publisher_html = fetch_publisher_html(
                client,
                metadata["doi"],
                metadata.get("crossref_link", []),
                ((metadata.get("crossref_resource") or {}).get("primary") or {}).get("URL", ""),
                metadata.get("fulltext_candidates", []),
                debug_log=publisher_html_attempts,
            )
            metadata["publisher_html_attempts"] = publisher_html_attempts
            if publisher_html:
                if raw_dir is not None:
                    raw_html_path = raw_dir / f"{safe_filename(pmid)}.html"
                    raw_html_path.write_text(publisher_html["html"])
                    metadata["raw_file"] = str(raw_html_path)
                metadata["source"] = "OA_HTML" if publisher_html["source_name"] == "pmc_html" else "Publisher_HTML"
                metadata["license"] = "pmc_html_oa" if metadata["source"] == "OA_HTML" else "publisher_free_full_text"
                metadata["resolved_url"] = publisher_html["resolved_url"]
                metadata["text_file"] = str(txt_path)
                metadata["section_count"] = len(publisher_html["sections"])
                metadata["body_validation_reason"] = publisher_html.get("validation_reason", "")
                metadata["body_word_count"] = publisher_html.get("word_count", 0)
                txt_path.write_text(llm_ready_text(metadata, publisher_html["sections"]))
                write_json(
                    meta_path,
                    {
                        "metadata": metadata,
                        "sections": publisher_html["sections"],
                        "raw_html": publisher_html["html"],
                    },
                )
                results.append(result_record(pmid, "success", "Downloaded DOI-based OA HTML full text", metadata=metadata))
                print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} via {publisher_html['source_name']}")
                continue

        # All routes failed or returned abstract-only
        if pmcid:
            results.append(result_record(
                pmid, "failed",
                "PMC article has PMCID but no full text retrievable (publisher-blocked or abstract-only)",
                metadata=metadata,
                extra={"failure_category": "pmc_abstract_only"},
            ))
        else:
            results.append(result_record(
                pmid, "failed",
                "No PMCID mapping and no DOI-based OA full text found",
                metadata=metadata,
                extra={"failure_category": "no_pmcid_no_doi_oa"},
            ))
        print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} failed: no body text available")

    write_jsonl(run_dir / "oa_results.jsonl", results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
