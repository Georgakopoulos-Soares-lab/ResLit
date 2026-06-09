#!/usr/bin/env python3
"""Download non-OA PubMed content using API-backed fallbacks."""

from __future__ import annotations

import datetime
import json
import re
import time
from http.cookiejar import CookieJar
from pathlib import Path
from urllib import parse, request as urllib_request
from urllib.parse import urlparse

from pubmed_common import (
    CROSSREF_WORKS_BASE,
    ELSEVIER_API_KEY,
    ELSEVIER_ARTICLE_BASE,
    HttpClient,
    NCBI_API_KEY,
    RateLimiter,
    RequestContext,
    SPRINGER_API_KEY,
    SPRINGER_META_BASE,
    SPRINGER_OPENACCESS_BASE,
    WILEY_API_KEY,
    build_arg_parser,
    ensure_dir,
    extract_metadata,
    fetch_europepmc_core,
    fetch_europepmc_fulltext,
    fetch_idconv,
    fetch_pmc_full_xml,
    fetch_pubmed_bioc,
    fetch_pubmed_summaries,
    fetch_unpaywall_record,
    flatten_bioc_to_sections,
    flatten_elsevier_xml_to_sections,
    flatten_pmc_xml_to_sections,
    html_to_text_sections,
    infer_failure_category,
    is_valid_fulltext_content,
    llm_ready_text,
    load_jsonl,
    pmc_xml_has_body,
    print_stderr,
    read_pmids,
    result_record,
    search_openalex_title,
    sections_have_body,
    safe_filename,
    write_json,
    write_jsonl,
)


def normalize_doi(doi: str) -> str:
    return doi.strip().removeprefix("https://doi.org/").removeprefix("http://doi.org/")


def download_elsevier_fulltext(client: HttpClient, pmid: str, destination: Path) -> dict:
    headers = {
        "Accept": "application/json",
        "X-ELS-APIKey": ELSEVIER_API_KEY,
    }
    url = f"{ELSEVIER_ARTICLE_BASE}/{parse.quote(pmid)}"
    text = client.get_text(url, params={"view": "FULL"}, headers=headers, timeout=30)
    destination.write_text(text)
    return json.loads(text)


def fetch_crossref_metadata(client: HttpClient, doi: str) -> dict:
    return client.get_json(
        f"{CROSSREF_WORKS_BASE}/{parse.quote(normalize_doi(doi), safe='')}",
        headers={"Accept": "application/json"},
    )


def _sage_sleep() -> None:
    """SAGE rate limit: 1 req/6s weekday midnight-noon PT, 1 req/2s otherwise."""
    try:
        import zoneinfo
        now_pt = datetime.datetime.now(tz=zoneinfo.ZoneInfo("America/Los_Angeles"))
    except Exception:
        now_pt = datetime.datetime.utcnow()
    is_restricted = now_pt.weekday() < 5 and now_pt.hour < 12
    time.sleep(6.1 if is_restricted else 2.1)


def fetch_sage_html(doi: str, landing_url: str) -> dict | None:
    """Fetch SAGE article HTML using CookieJar session (bypasses subscription redirect)."""
    from pubmed_common import USER_AGENT, html_to_text_sections, is_valid_fulltext_content
    url = landing_url or f"https://journals.sagepub.com/doi/full/{parse.quote(normalize_doi(doi), safe='/')}"
    jar = CookieJar()
    opener = urllib_request.build_opener(urllib_request.HTTPCookieProcessor(jar))
    opener.addheaders = [
        ("User-Agent", USER_AGENT),
        ("Accept", "text/html,application/xhtml+xml"),
        ("Referer", "https://pubmed.ncbi.nlm.nih.gov/"),
    ]
    _sage_sleep()
    try:
        with opener.open(url, timeout=30) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            html_body = resp.read().decode(charset, errors="replace")
            final_url = resp.geturl()
    except Exception:
        return None
    sections = html_to_text_sections(html_body, source_label="PUBLISHER_HTML")
    is_valid, reason, word_count = is_valid_fulltext_content("Publisher_HTML", sections, raw_text=html_body)
    if not sections or not is_valid:
        return None
    return {"html": html_body, "sections": sections, "resolved_url": final_url, "validation_reason": reason, "word_count": word_count}


def fetch_springer_metadata(client: HttpClient, doi: str) -> dict:
    params = {"q": f"doi:{normalize_doi(doi)}", "api_key": SPRINGER_API_KEY}
    return client.get_json(SPRINGER_META_BASE, params=params)


def fetch_springer_openaccess_fulltext(client: HttpClient, doi: str) -> str:
    params = {"q": f"doi:{normalize_doi(doi)}", "api_key": SPRINGER_API_KEY}
    return client.get_text(SPRINGER_OPENACCESS_BASE, params=params, headers={"Accept": "application/xml"})


def derive_oup_article_url(url: str) -> str:
    new_url = re.sub(r"/article-pdf/", "/article/", url)
    new_url = re.sub(r"/[^/]+\.pdf(\?.*)?$", "", new_url)
    return new_url


def is_probable_wiley_doi(doi: str) -> bool:
    doi = normalize_doi(doi).lower()
    return doi.startswith(
        (
            "10.1111/",
            "10.1046/",
            "10.1002/",
            "10.1034/",
        )
    )


def is_probable_asm_doi(doi: str) -> bool:
    return normalize_doi(doi).lower().startswith("10.1128/")


def fetch_asm_tdm_xml(client: HttpClient, doi: str, crossref_links: list[dict]) -> dict | None:
    """Fetch ASM article full text as JATS XML via Crossref TDM links or direct XML endpoint."""
    normalized = normalize_doi(doi)
    urls: list[str] = []

    # Collect XML TDM links from Crossref metadata first
    for link in crossref_links or []:
        url = link.get("URL", "")
        if not url or "journals.asm.org" not in url:
            continue
        content_type = link.get("content-type", "").lower()
        intended = link.get("intended-application", "").lower()
        if "xml" in content_type or "xml" in url.lower() or "text-mining" in intended:
            if url not in urls:
                urls.append(url)

    # Always also try the canonical TDM XML endpoint
    if normalized:
        xml_url = f"https://journals.asm.org/doi/xml/{parse.quote(normalized, safe='/')}"
        if xml_url not in urls:
            urls.append(xml_url)

    for url in urls:
        try:
            response = client.get_response(
                url,
                headers={
                    "Accept": "application/xml, text/xml, */*",
                    "Referer": "https://pubmed.ncbi.nlm.nih.gov/",
                },
                timeout=30,
            )
        except Exception:
            continue
        body = response.get("body", "")
        if not body or len(body) < 500:
            continue
        content_type = response.get("content_type", "").lower()
        if "html" in content_type and "<article" not in body[:500]:
            continue
        if not pmc_xml_has_body(body):
            continue
        sections = flatten_pmc_xml_to_sections(body)
        if sections and sections_have_body(sections):
            return {
                "xml": body,
                "sections": sections,
                "resolved_url": response.get("url", url),
            }
    return None


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
        if "api.wiley.com/onlinelibrary/tdm/" in lowered:
            candidates.append({"source": "wiley_tdm", "type": "pdf_api", "url": url})
        elif lowered.endswith(".pdf") or "/article-pdf/" in lowered or "/doi/pdf/" in lowered:
            candidates.append({"source": "publisher_pdf", "type": "pdf", "url": url})
        else:
            candidates.append({"source": "publisher_link", "type": "landing_page", "url": url})
        if "academic.oup.com" in lowered and "/article-pdf/" in lowered:
            candidates.append({"source": "oup_article", "type": "landing_page", "url": derive_oup_article_url(url)})

    if doi and is_probable_wiley_doi(doi):
        candidates.append(
            {
                "source": "wiley_full",
                "type": "landing_page",
                "url": f"https://onlinelibrary.wiley.com/doi/full/{parse.quote(doi, safe='/')}",
            }
        )

    deduped = []
    for item in candidates:
        key = (item["type"], item["url"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def classify_abstract_followup(metadata: dict) -> str:
    candidates = metadata.get("fulltext_candidates", []) or []
    if any(item.get("type") in {"pdf", "pdf_api"} for item in candidates):
        return "abstract_only_with_pdf_candidate"
    if any(item.get("type") == "landing_page" for item in candidates):
        return "abstract_only_with_html_candidate"
    return "abstract_only_no_fulltext_candidate"


def extract_http_status(message: str) -> str:
    match = re.search(r"HTTP\s+(\d{3})", message or "")
    return match.group(1) if match else ""


def summarize_backend_errors(metadata: dict) -> list[dict]:
    error_fields = {
        "epmc_fulltext_error": "europepmc_fulltext",
        "crossref_status": "crossref",
        "unpaywall_status": "unpaywall",
        "openalex_status": "openalex",
        "europepmc_status": "europepmc_core",
        "pubmed_bioc_error": "pubmed_bioc",
        "springer_error": "springer_openaccess",
        "springer_meta_error": "springer_meta",
        "elsevier_error": "elsevier_article_api",
    }
    errors = []
    external_sources = metadata.get("external_sources") or {}
    for field_name, backend in error_fields.items():
        if field_name in {"crossref_status", "unpaywall_status", "openalex_status", "europepmc_status"}:
            message = str(external_sources.get(field_name, "")).strip()
            if field_name == "crossref_status":
                message = str(metadata.get(field_name, "")).strip()
            if not message.startswith("error:"):
                continue
        else:
            message = str(metadata.get(field_name, "")).strip()
            if not message:
                continue
        errors.append(
            {
                "backend": backend,
                "message": message,
                "http_status": extract_http_status(message),
            }
        )
    if metadata.get("elsevier_xml_no_body"):
        errors.append(
            {
                "backend": "elsevier_candidate_fulltext",
                "message": "Elsevier candidate XML returned metadata-only response",
                "http_status": "",
            }
        )
    return errors


def infer_abstract_only_reason(metadata: dict) -> str:
    candidates = metadata.get("fulltext_candidates", []) or []
    candidate_types = {item.get("type") for item in candidates}
    errors = summarize_backend_errors(metadata)
    urls = [item.get("url", "") for item in candidates]
    if metadata.get("pdf_fallback_reason") == "wiley_tdm_unavailable_old_article":
        return "wiley_legacy_pdf"
    if any("api.elsevier.com/content/article/PII:" in url for url in urls):
        return "elsevier_candidate_only"
    if any(error["backend"] == "pubmed_bioc" for error in errors):
        return "temporary_network_or_api_error"
    if metadata.get("publisher_family") in {"ASM", "OUP", "SAGE", "ACS"} and "landing_page" in candidate_types:
        return "publisher_gate"
    if candidate_types == {"pdf"} or candidate_types == {"pdf_api"} or candidate_types == {"pdf", "pdf_api"}:
        return "candidate_pdf_only"
    if "landing_page" in candidate_types and not (candidate_types & {"pdf", "pdf_api"}):
        return "candidate_html_only"
    if "landing_page" in candidate_types and candidate_types & {"pdf", "pdf_api"}:
        return "candidate_html_and_pdf"
    if candidates:
        return "candidate_unusable"
    return "no_candidate_found"


def finalize_monitoring(metadata: dict) -> None:
    metadata["backend_errors"] = summarize_backend_errors(metadata)
    metadata["attempted_backend_count"] = len(metadata.get("tried_backends", []))
    if metadata.get("source") == "PubMed_BioC":
        metadata["abstract_only_reason"] = infer_abstract_only_reason(metadata)


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


def infer_publication_year(metadata: dict) -> int | None:
    pubdate = str(metadata.get("pubdate", "")).strip()
    match = re.search(r"(19|20)\d{2}", pubdate)
    if match:
        return int(match.group(0))
    sortpubdate = str(metadata.get("sortpubdate", "")).strip()
    match = re.search(r"(19|20)\d{2}", sortpubdate)
    if match:
        return int(match.group(0))
    return None


def annotate_publisher_context(metadata: dict) -> None:
    candidates = metadata.get("fulltext_candidates", []) or []
    urls = " ".join(item.get("url", "").lower() for item in candidates)
    families = []
    if "api.wiley.com" in urls or "onlinelibrary.wiley.com" in urls or "doi.wiley.com" in urls:
        families.append("Wiley")
    if "academic.oup.com" in urls:
        families.append("OUP")
    if "journals.asm.org" in urls:
        families.append("ASM")
    if "journals.sagepub.com" in urls:
        families.append("SAGE")
    if "pubs.acs.org" in urls:
        families.append("ACS")
    if "link.springer.com" in urls or "nature.com" in urls:
        families.append("Springer Nature")
    metadata["publisher_family"] = families[0] if families else ""
    year = infer_publication_year(metadata)
    if year:
        metadata["publication_year"] = year


def annotate_wiley_pdf_fallback(metadata: dict) -> None:
    if metadata.get("publisher_family") != "Wiley":
        return
    year = metadata.get("publication_year")
    if not isinstance(year, int):
        return
    if year > 2005:
        return
    metadata["pdf_fallback_reason"] = "wiley_tdm_unavailable_old_article"
    metadata["pdf_fallback_bucket"] = (
        "wiley_pre_1996_pdf_candidate" if year <= 1995 else "wiley_1996_2005_pdf_candidate"
    )


def host_matches(host: str, patterns: set[str]) -> bool:
    host = host.lower()
    for pattern in patterns:
        pattern = pattern.lower()
        if host == pattern or host.endswith(f".{pattern}"):
            return True
    return False


def collect_external_candidates(client: HttpClient, metadata: dict) -> None:
    external_meta = metadata.setdefault("external_sources", {})
    new_candidates: list[dict] = []

    doi = normalize_doi(metadata.get("doi", "")) if metadata.get("doi") else ""
    if doi:
        if client.ctx.email.endswith("@example.com"):
            external_meta["unpaywall_status"] = "skipped: configure a real email to use Unpaywall"
        else:
            try:
                unpaywall = fetch_unpaywall_record(client, doi)
                external_meta["unpaywall_status"] = "ok"
                external_meta["unpaywall_is_oa"] = unpaywall.get("is_oa")
                external_meta["unpaywall_oa_status"] = unpaywall.get("oa_status")
                external_meta["unpaywall_best_host_type"] = (unpaywall.get("best_oa_location") or {}).get("host_type", "")
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
    if title:
        try:
            openalex = search_openalex_title(client, title, doi=doi)
            if openalex:
                external_meta["openalex_status"] = "ok"
                external_meta["openalex_id"] = openalex.get("id", "")
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
        except Exception as exc:  # noqa: BLE001
            external_meta["openalex_status"] = f"error: {exc}"

    try:
        epmc = fetch_europepmc_core(client, metadata["pmid"])
        external_meta["europepmc_status"] = "ok"
        results = (((epmc or {}).get("resultList") or {}).get("result") or [])
        if results:
            result = results[0]
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


def fetch_candidate_fulltext(client: HttpClient, metadata: dict, raw_dir: Path, txt_path: Path, meta_path: Path) -> dict | None:
    for candidate in metadata.get("fulltext_candidates", []) or []:
        url = candidate.get("url", "")
        source = candidate.get("source", "")
        candidate_type = candidate.get("type", "")
        if "api.elsevier.com/content/article/PII:" not in url:
            continue
        accept = "text/xml" if "httpAccept=text/xml" in url else "text/plain"
        try:
            response = client.get_response(
                url,
                headers={
                    "Accept": accept,
                    "X-ELS-APIKey": ELSEVIER_API_KEY,
                },
                timeout=30,
            )
        except Exception:
            continue

        body = response.get("body", "")
        if accept == "text/xml" and "<" in body:
            # Only save if the XML actually contains article body content
            # (publisher-blocked responses return metadata-only XML with no <ce:sections>)
            if not re.search(r"<(?:ce:sections|ce:para|body)\b", body):
                metadata["elsevier_xml_no_body"] = True
                continue
            sections = flatten_elsevier_xml_to_sections(body)
            if not sections or not sections_have_body(sections):
                metadata["elsevier_xml_parse_no_body"] = True
                continue
            raw_path = raw_dir / f"{safe_filename(metadata['pmid'])}_elsevier.xml"
            raw_path.write_text(body)
            metadata["source"] = "Elsevier_Candidate_XML"
            metadata["license"] = "publisher_api_candidate"
            metadata["raw_file"] = str(raw_path)
            metadata["resolved_url"] = response.get("url")
            metadata["text_file"] = str(txt_path)
            metadata["tried_backends"] = metadata.get("tried_backends", []) + [f"{source}:{candidate_type}"]
            finalize_monitoring(metadata)
            txt_path.write_text(llm_ready_text(metadata, sections))
            write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_elsevier_xml": body})
            return result_record(metadata["pmid"], "success", "Downloaded candidate Elsevier XML full text", metadata=metadata)

        if accept == "text/plain" and len(body.strip()) > 500:
            raw_path = raw_dir / f"{safe_filename(metadata['pmid'])}_elsevier.txt"
            raw_path.write_text(body)
            sections = [{"section": "ELSEVIER_PLAIN_TEXT", "text": body}]
            metadata["source"] = "Elsevier_Candidate_Text"
            metadata["license"] = "publisher_api_candidate"
            metadata["raw_file"] = str(raw_path)
            metadata["resolved_url"] = response.get("url")
            metadata["text_file"] = str(txt_path)
            metadata["tried_backends"] = metadata.get("tried_backends", []) + [f"{source}:{candidate_type}"]
            finalize_monitoring(metadata)
            txt_path.write_text(llm_ready_text(metadata, sections))
            write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_elsevier_text": body})
            return result_record(metadata["pmid"], "success", "Downloaded candidate Elsevier plain text full text", metadata=metadata)
    return None


def fetch_wiley_tdm_pdf(
    client: HttpClient,
    metadata: dict,
    raw_dir: Path,
    txt_path: Path,
    meta_path: Path,
    abstract_sections: list[dict],
) -> dict | None:
    if not WILEY_API_KEY:
        return None
    doi = normalize_doi(metadata.get("doi", ""))
    url = ""
    for candidate in metadata.get("fulltext_candidates", []) or []:
        if candidate.get("source") == "wiley_tdm" and candidate.get("type") == "pdf_api":
            url = candidate.get("url", "")
            break
    if not url:
        if not doi:
            return None
        if not (is_probable_wiley_doi(doi) or metadata.get("publisher_family") == "Wiley"):
            return None
        url = f"https://api.wiley.com/onlinelibrary/tdm/v1/articles/{parse.quote(doi, safe='')}"
    raw_path = raw_dir / f"{safe_filename(metadata['pmid'])}_wiley.pdf"
    try:
        client.download_file(
            url,
            raw_path,
            headers={"Wiley-TDM-Client-Token": WILEY_API_KEY, "Accept": "application/pdf"},
            timeout=60,
        )
    except Exception:
        return None
    metadata["source"] = "Wiley_TDM_PDF"
    metadata["license"] = "publisher_pdf"
    metadata["raw_file"] = str(raw_path)
    metadata["resolved_url"] = url
    metadata["tried_backends"] = metadata.get("tried_backends", []) + ["wiley_tdm_pdf"]
    metadata["text_file"] = str(txt_path)
    finalize_monitoring(metadata)
    txt_path.write_text(
        llm_ready_text(
            metadata,
            [
                {
                    "section": "RAW_PDF_NOTE",
                    "text": f"Wiley TDM PDF archived at {raw_path}. Abstract metadata retained below for indexing.",
                },
                *abstract_sections,
            ],
        )
    )
    write_json(
        meta_path,
        {
            "metadata": metadata,
            "sections": abstract_sections,
            "raw_pdf_note": "Original Wiley TDM content stored as PDF; companion text contains abstract metadata only.",
        },
    )
    return result_record(metadata["pmid"], "success", "Downloaded Wiley TDM PDF", metadata=metadata)


def fetch_candidate_pdf(
    client: HttpClient,
    metadata: dict,
    raw_dir: Path,
    txt_path: Path,
    meta_path: Path,
    abstract_sections: list[dict],
) -> dict | None:
    allowed_host_patterns = {
        "link.springer.com",
        "www.nature.com",
        "nature.com",
        "journals.asm.org",
        "asm.org",
        "academic.oup.com",
        "oxfordjournals.org",
        "journals.sagepub.com",
        "sagepub.com",
        "pubs.acs.org",
    }
    for candidate in metadata.get("fulltext_candidates", []) or []:
        if candidate.get("type") not in {"pdf", "pdf_api"}:
            continue
        url = candidate.get("url", "")
        host = urlparse(url).netloc.lower()
        if not host_matches(host, allowed_host_patterns):
            continue
        try:
            response = client.get_bytes_response(
                url,
                headers={"Accept": "application/pdf,*/*", "Referer": "https://pubmed.ncbi.nlm.nih.gov/"},
                timeout=30,
            )
        except Exception:
            continue
        body = response.get("body", "")
        if not body.startswith(b"%PDF"):
            continue
        raw_path = raw_dir / f"{safe_filename(metadata['pmid'])}.pdf"
        raw_path.write_bytes(body)
        metadata["source"] = "Publisher_PDF"
        metadata["license"] = "publisher_pdf"
        metadata["raw_file"] = str(raw_path)
        metadata["resolved_url"] = response.get("url")
        metadata["text_file"] = str(txt_path)
        metadata["tried_backends"] = metadata.get("tried_backends", []) + [f"{candidate.get('source')}:{candidate.get('type')}"]
        finalize_monitoring(metadata)
        txt_path.write_text(
            llm_ready_text(
                metadata,
                [
                    {
                        "section": "RAW_PDF_NOTE",
                        "text": f"Publisher PDF archived at {raw_path}. Abstract metadata retained below for indexing.",
                    },
                    *abstract_sections,
                ],
            )
        )
        write_json(
            meta_path,
            {
                "metadata": metadata,
                "sections": abstract_sections,
                "raw_pdf_note": "Original content stored as PDF; companion text contains abstract metadata only.",
            },
        )
        return result_record(metadata["pmid"], "success", "Downloaded publisher PDF", metadata=metadata)
    return None


def fetch_publisher_html(
    client: HttpClient,
    doi: str,
    crossref_links: list[dict],
    resource_url: str = "",
    fulltext_candidates: list[dict] | None = None,
) -> dict | None:
    normalized = normalize_doi(doi)
    candidates = [
        ("doi_resolver", f"https://doi.org/{parse.quote(normalized, safe='/')}"),
        ("wiley_full", f"https://onlinelibrary.wiley.com/doi/full/{parse.quote(normalized, safe='/')}"),
    ]
    if resource_url:
        candidates.append(("crossref_resource", resource_url))
    for link in crossref_links or []:
        url = link.get("URL") or ""
        if not url:
            continue
        if "academic.oup.com" in url and "/article-pdf/" in url:
            candidates.append(("oup_article", derive_oup_article_url(url)))
        elif "academic.oup.com" in url and "/article/" in url:
            candidates.append(("oup_article", url))
        elif "onlinelibrary.wiley.com" in url:
            candidates.append(("wiley_crossref", url))
        elif "journals.asm.org" in url or urlparse(url).netloc.lower().endswith(".asm.org"):
            candidates.append(("asm_html", url))
        elif "journals.sagepub.com" in url or "sagepub.com" in url:
            candidates.append(("sage_html", url))
        elif "pubs.acs.org" in url:
            candidates.append(("acs_html", url))
        elif "microbiologyresearch.org" in url:
            if "crawler=true" not in url:
                joiner = "&" if "?" in url else "?"
                candidates.append(("microbiology_crawler", f"{url}{joiner}crawler=true"))
            candidates.append(("microbiology_html", url))
        elif "joi.jlc.jst.go.jp" in url or "jstage.jst.go.jp" in url:
            candidates.append(("jstage_html", url))
        elif "xlink.rsc.org" in url or "pubs.rsc.org" in url:
            candidates.append(("rsc_html", url))
        elif "jidc.org" in url or "eurosurveillance.org" in url or "cambridge.org" in url:
            candidates.append(("publisher_html", url))
        elif "link.springer.com" in url:
            candidates.append(("springer_html", url))
        elif "nature.com" in url:
            candidates.append(("nature_html", url))
        elif "journals.plos.org" in url or "plosone.org" in url:
            candidates.append(("plos_html", url))
        elif "europepmc.org" in url and "/article/" in url:
            candidates.append(("europepmc_html", url))
    for item in fulltext_candidates or []:
        url = item.get("url") or ""
        if item.get("type") != "landing_page" or not url:
            continue
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.lower()
        if host in {"ncbi.nlm.nih.gov", "www.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov"} and "/pmc/articles/" in path:
            candidates.append(("pmc_html", url))
        elif host == "europepmc.org" and "/articles/pmc" in path:
            candidates.append(("europepmc_html", url))

    seen = set()
    for source_name, url in candidates:
        if url in seen:
            continue
        seen.add(url)
        try:
            response = client.get_response(
                url,
                headers={
                    "Accept": "text/html,application/xhtml+xml",
                    "Referer": "https://pubmed.ncbi.nlm.nih.gov/",
                },
                timeout=30,
            )
        except Exception:
            continue
        final_url = response["url"]
        content_type = response.get("content_type", "")
        body = response.get("body", "")
        if "html" not in content_type and "<html" not in body.lower():
            continue
        if any(
            host in final_url
            for host in (
                "onlinelibrary.wiley.com",
                "academic.oup.com",
                "journals.asm.org",
                "pubs.acs.org",
                "journals.sagepub.com",
                "www.microbiologyresearch.org",
                "www.jstage.jst.go.jp",
                "joi.jlc.jst.go.jp",
                "xlink.rsc.org",
                "pubs.rsc.org",
                "jidc.org",
                "www.eurosurveillance.org",
                "www.cambridge.org",
                "link.springer.com",
                "www.nature.com",
                "nature.com",
                "journals.plos.org",
                "europepmc.org",
                "pmc.ncbi.nlm.nih.gov",
                "ncbi.nlm.nih.gov/pmc",
            )
        ):
            source_label = "OA_HTML" if source_name in {"pmc_html", "europepmc_html"} else "PUBLISHER_HTML"
            sections = html_to_text_sections(body, source_label=source_label)
            normalized_source = "OA_HTML" if source_label == "OA_HTML" else "Publisher_HTML"
            is_valid, reason, word_count = is_valid_fulltext_content(normalized_source, sections, raw_text=body)
            if sections and is_valid:
                return {
                    "source_name": source_name,
                    "resolved_url": final_url,
                    "html": body,
                    "sections": sections,
                    "validation_reason": reason,
                    "word_count": word_count,
                }
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
        "source_name": "pmc_html",
        "resolved_url": response["url"],
        "html": body,
        "sections": sections,
        "validation_reason": reason,
        "word_count": word_count,
    }


def main() -> int:
    parser = build_arg_parser("Download API-backed article content for PMIDs not covered by OA.")
    parser.add_argument(
        "--oa-results",
        default=None,
        help="JSONL output from 01_download_oa.py. Successful PMIDs will be skipped.",
    )
    args = parser.parse_args()

    pmids = read_pmids(args.pmid_file, args.limit)
    out_root = ensure_dir(args.out_dir)
    raw_dir = ensure_dir(out_root / "api" / "raw")
    text_dir = ensure_dir(out_root / "api" / "txt")
    meta_dir = ensure_dir(out_root / "api" / "meta")
    run_dir = ensure_dir(out_root / "runs")

    oa_results_path = Path(args.oa_results) if args.oa_results else run_dir / "oa_results.jsonl"
    oa_success_pmids = set()
    if oa_results_path.exists():
        for row in load_jsonl(oa_results_path):
            if row.get("status") == "success":
                oa_success_pmids.add(str(row.get("pmid", "")).strip())
    pmids = [pmid for pmid in pmids if pmid not in oa_success_pmids]

    ctx = RequestContext(
        tool=args.tool,
        email=args.email,
        rate_limiter=RateLimiter(args.sleep),
    )
    client = HttpClient(ctx)
    summaries = fetch_pubmed_summaries(client, pmids)
    idconv = fetch_idconv(client, pmids)

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
            try:
                cached_payload = json.loads(meta_path.read_text())
                cached_metadata = cached_payload.get("metadata") or {}
            except Exception:  # noqa: BLE001
                cached_metadata = {}
            finalize_monitoring(cached_metadata or metadata)
            results.append(
                result_record(
                    pmid,
                    "success",
                    "Existing API outputs found",
                    metadata=cached_metadata or metadata,
                )
            )
            continue

        try:
            tried_backends = []
            if metadata.get("pmcid"):
                tried_backends.append("pmc_efetch")
                pmc_xml = fetch_pmc_full_xml(client, metadata["pmcid"])
                # Only accept EFetch XML if it has a real body (not publisher-blocked)
                if pmc_xml_has_body(pmc_xml):
                    sections = flatten_pmc_xml_to_sections(pmc_xml)
                    if sections and sections_have_body(sections):
                        raw_xml_path = raw_dir / f"{safe_filename(pmid)}.xml"
                        raw_xml_path.write_text(pmc_xml)
                        metadata["source"] = "PMC_EFetch_XML"
                        metadata["license"] = "pmc_free_to_read"
                        metadata["raw_file"] = str(raw_xml_path)
                        metadata["tried_backends"] = tried_backends
                        metadata["text_file"] = str(txt_path)
                        finalize_monitoring(metadata)
                        txt_path.write_text(llm_ready_text(metadata, sections))
                        write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_pmc_xml": pmc_xml})
                        results.append(result_record(pmid, "success", "Downloaded PMC full text XML", metadata=metadata))
                        print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via PMC EFetch")
                        continue

            # Europe PMC fulltext XML — works for many OA articles not in NCBI OA subset
            if metadata.get("pmcid"):
                try:
                    tried_backends.append("europepmc_fulltext")
                    epmc_xml = fetch_europepmc_fulltext(client, metadata["pmcid"])
                    if pmc_xml_has_body(epmc_xml):
                        sections = flatten_pmc_xml_to_sections(epmc_xml)
                        if sections and sections_have_body(sections):
                            raw_xml_path = raw_dir / f"{safe_filename(pmid)}_epmc.xml"
                            raw_xml_path.write_text(epmc_xml)
                            metadata["source"] = "EuropePMC_FullText_XML"
                            metadata["license"] = "europe_pmc_oa"
                            metadata["raw_file"] = str(raw_xml_path)
                            metadata["tried_backends"] = tried_backends
                            metadata["text_file"] = str(txt_path)
                            finalize_monitoring(metadata)
                            txt_path.write_text(llm_ready_text(metadata, sections))
                            write_json(meta_path, {"metadata": metadata, "sections": sections})
                            results.append(result_record(pmid, "success", "Downloaded Europe PMC full-text XML", metadata=metadata))
                            print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via EuropePMC_FullText_XML")
                            continue
                except Exception as exc:  # noqa: BLE001
                    metadata["epmc_fulltext_error"] = str(exc)

            if metadata.get("pmcid"):
                pmc_html = fetch_pmc_article_html(client, metadata["pmcid"])
                if pmc_html:
                    raw_html_path = raw_dir / f"{safe_filename(pmid)}.html"
                    raw_html_path.parent.mkdir(parents=True, exist_ok=True)
                    raw_html_path.write_text(pmc_html["html"])
                    metadata["source"] = "OA_HTML"
                    metadata["license"] = "pmc_html_oa"
                    metadata["raw_file"] = str(raw_html_path)
                    metadata["resolved_url"] = pmc_html["resolved_url"]
                    metadata["tried_backends"] = tried_backends + [pmc_html["source_name"]]
                    metadata["text_file"] = str(txt_path)
                    metadata["body_validation_reason"] = pmc_html.get("validation_reason", "")
                    metadata["body_word_count"] = pmc_html.get("word_count", 0)
                    finalize_monitoring(metadata)
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
                    print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via pmc_html")
                    continue

            if metadata.get("doi"):
                metadata["doi"] = normalize_doi(metadata["doi"])
                try:
                    crossref_payload = fetch_crossref_metadata(client, metadata["doi"])
                    metadata["crossref_status"] = "ok"
                    metadata["crossref_license"] = crossref_payload.get("message", {}).get("license", [])
                    metadata["crossref_link"] = crossref_payload.get("message", {}).get("link", [])
                    metadata["crossref_resource"] = crossref_payload.get("message", {}).get("resource", {})
                except Exception as exc:  # noqa: BLE001
                    metadata["crossref_status"] = f"error: {exc}"
                    metadata["crossref_license"] = []
                    metadata["crossref_link"] = []
                    metadata["crossref_resource"] = {}

                metadata["fulltext_candidates"] = build_fulltext_candidates(metadata)
                collect_external_candidates(client, metadata)
                annotate_publisher_context(metadata)

                publisher_html = fetch_publisher_html(
                    client,
                    metadata["doi"],
                    metadata.get("crossref_link", []),
                    ((metadata.get("crossref_resource") or {}).get("primary") or {}).get("URL", ""),
                    metadata.get("fulltext_candidates", []),
                )
                # Save all validated publisher HTML (not just SAGE/OA)
                if publisher_html:
                    source_name = publisher_html.get("source_name", "")
                    is_oa = source_name in {"pmc_html", "europepmc_html"}
                    raw_html_path = raw_dir / f"{safe_filename(pmid)}.html"
                    raw_html_path.parent.mkdir(parents=True, exist_ok=True)
                    raw_html_path.write_text(publisher_html["html"])
                    metadata["source"] = "OA_HTML" if is_oa else "Publisher_HTML"
                    metadata["license"] = "pmc_html_oa" if is_oa else "publisher_free_full_text"
                    metadata["raw_file"] = str(raw_html_path)
                    metadata["resolved_url"] = publisher_html["resolved_url"]
                    metadata["tried_backends"] = tried_backends + [publisher_html["source_name"]]
                    metadata["text_file"] = str(txt_path)
                    metadata["body_validation_reason"] = publisher_html.get("validation_reason", "")
                    metadata["body_word_count"] = publisher_html.get("word_count", 0)
                    finalize_monitoring(metadata)
                    txt_path.write_text(llm_ready_text(metadata, publisher_html["sections"]))
                    write_json(
                        meta_path,
                        {
                            "metadata": metadata,
                            "sections": publisher_html["sections"],
                            "raw_html": publisher_html["html"],
                        },
                    )
                    results.append(result_record(pmid, "success", f"Downloaded {metadata['source']} full text", metadata=metadata))
                    print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via {publisher_html['source_name']}")
                    continue

                # SAGE CookieJar HTML for SAGE articles
                if metadata.get("publisher_family") == "SAGE":
                    try:
                        tried_backends.append("sage_cookiejar_html")
                        sage_candidates = [c.get("url", "") for c in metadata.get("fulltext_candidates", []) if "sagepub.com" in c.get("url", "")]
                        sage_landing = sage_candidates[0] if sage_candidates else ""
                        sage_result = fetch_sage_html(metadata["doi"], sage_landing)
                        if sage_result:
                            raw_html_path = raw_dir / f"{safe_filename(pmid)}_sage.html"
                            raw_html_path.parent.mkdir(parents=True, exist_ok=True)
                            raw_html_path.write_text(sage_result["html"])
                            metadata["source"] = "Publisher_HTML"
                            metadata["license"] = "publisher_free_full_text"
                            metadata["raw_file"] = str(raw_html_path)
                            metadata["resolved_url"] = sage_result["resolved_url"]
                            metadata["tried_backends"] = tried_backends
                            metadata["text_file"] = str(txt_path)
                            metadata["body_validation_reason"] = sage_result["validation_reason"]
                            metadata["body_word_count"] = sage_result["word_count"]
                            finalize_monitoring(metadata)
                            txt_path.write_text(llm_ready_text(metadata, sage_result["sections"]))
                            write_json(meta_path, {"metadata": metadata, "sections": sage_result["sections"], "raw_html": sage_result["html"]})
                            results.append(result_record(pmid, "success", "Downloaded SAGE HTML full text", metadata=metadata))
                            print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via sage_cookiejar_html")
                            continue
                    except Exception as exc:
                        metadata["sage_html_error"] = str(exc)

                # Springer OA API for Springer Nature articles
                if SPRINGER_API_KEY and metadata.get("publisher_family") == "Springer Nature":
                    try:
                        tried_backends.append("springer_oa_api")
                        xml = fetch_springer_openaccess_fulltext(client, metadata["doi"])
                        if xml and "<article" in xml and len(xml) > 500:
                            sections = flatten_pmc_xml_to_sections(xml)
                            if sections and sections_have_body(sections):
                                raw_path = raw_dir / f"{safe_filename(pmid)}_springer.xml"
                                raw_path.write_text(xml)
                                metadata["source"] = "Springer_OA_API"
                                metadata["license"] = "springer_oa_api"
                                metadata["raw_file"] = str(raw_path)
                                metadata["text_file"] = str(txt_path)
                                metadata["tried_backends"] = tried_backends
                                finalize_monitoring(metadata)
                                txt_path.write_text(llm_ready_text(metadata, sections))
                                write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_springer_xml": xml})
                                results.append(result_record(pmid, "success", "Downloaded Springer OA API full text", metadata=metadata))
                                print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via Springer_OA_API")
                                continue
                    except Exception as exc:
                        metadata["springer_oa_error"] = str(exc)

                # ASM TDM XML before BioC fallback
                if metadata.get("doi") and (is_probable_asm_doi(metadata["doi"]) or metadata.get("publisher_family") == "ASM"):
                    try:
                        tried_backends.append("asm_tdm_xml")
                        asm_result = fetch_asm_tdm_xml(client, metadata["doi"], metadata.get("crossref_link", []))
                        if asm_result:
                            raw_path = raw_dir / f"{safe_filename(pmid)}_asm.xml"
                            raw_path.write_text(asm_result["xml"])
                            metadata["source"] = "ASM_TDM_XML"
                            metadata["license"] = "asm_tdm"
                            metadata["raw_file"] = str(raw_path)
                            metadata["resolved_url"] = asm_result["resolved_url"]
                            metadata["tried_backends"] = tried_backends
                            metadata["text_file"] = str(txt_path)
                            finalize_monitoring(metadata)
                            txt_path.write_text(llm_ready_text(metadata, asm_result["sections"]))
                            write_json(meta_path, {"metadata": metadata, "sections": asm_result["sections"], "raw_asm_xml": asm_result["xml"]})
                            results.append(result_record(pmid, "success", "Downloaded ASM TDM XML full text", metadata=metadata))
                            print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via ASM_TDM_XML")
                            continue
                    except Exception as exc:
                        metadata["asm_tdm_error"] = str(exc)

                # Wiley TDM before BioC fallback
                if WILEY_API_KEY and metadata.get("doi") and (is_probable_wiley_doi(metadata["doi"]) or metadata.get("publisher_family") == "Wiley"):
                    try:
                        tried_backends.append("wiley_tdm_pre_bioc")
                        doi_enc = parse.quote(normalize_doi(metadata["doi"]), safe="")
                        wiley_url = f"https://api.wiley.com/onlinelibrary/tdm/v1/articles/{doi_enc}"
                        raw_path = raw_dir / f"{safe_filename(pmid)}_wiley.pdf"
                        client.download_file(wiley_url, raw_path, headers={"Wiley-TDM-Client-Token": WILEY_API_KEY, "Accept": "application/pdf"}, timeout=60)
                        metadata["source"] = "Wiley_TDM_PDF"
                        metadata["license"] = "publisher_pdf"
                        metadata["raw_file"] = str(raw_path)
                        metadata["resolved_url"] = wiley_url
                        metadata["text_file"] = str(txt_path)
                        metadata["tried_backends"] = tried_backends
                        finalize_monitoring(metadata)
                        txt_path.write_text(llm_ready_text(metadata, [{"section": "RAW_PDF_NOTE", "text": f"Wiley TDM PDF archived at {raw_path}."}]))
                        write_json(meta_path, {"metadata": metadata, "raw_pdf_note": "Wiley TDM PDF; no text extraction"})
                        results.append(result_record(pmid, "success", "Downloaded Wiley TDM PDF", metadata=metadata))
                        print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via Wiley_TDM_PDF")
                        continue
                    except Exception as exc:
                        metadata["wiley_tdm_error"] = str(exc)

            tried_backends.append("pubmed_bioc")
            bioc = fetch_pubmed_bioc(client, pmid)
            sections = flatten_bioc_to_sections(bioc)
            if sections:
                candidate_fulltext = None
                if metadata.get("fulltext_candidates"):
                    candidate_fulltext = fetch_candidate_fulltext(client, metadata, raw_dir, txt_path, meta_path)
                if candidate_fulltext:
                    results.append(candidate_fulltext)
                    print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via {candidate_fulltext['metadata']['source']}")
                    continue

                wiley_pdf = fetch_wiley_tdm_pdf(client, metadata, raw_dir, txt_path, meta_path, sections)
                if wiley_pdf:
                    results.append(wiley_pdf)
                    print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via Wiley_TDM_PDF")
                    continue

                annotate_wiley_pdf_fallback(metadata)

                candidate_pdf = fetch_candidate_pdf(client, metadata, raw_dir, txt_path, meta_path, sections)
                if candidate_pdf:
                    results.append(candidate_pdf)
                    print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via Publisher_PDF")
                    continue

                metadata["source"] = "PubMed_BioC"
                metadata["license"] = "abstract_only"
                metadata["api_key_used"] = bool(NCBI_API_KEY)
                metadata["tried_backends"] = tried_backends
                metadata["followup_status"] = classify_abstract_followup(metadata)
                metadata["fulltext_candidate_count"] = len(metadata.get("fulltext_candidates", []))
                metadata["text_file"] = str(txt_path)
                finalize_monitoring(metadata)
                txt_path.write_text(llm_ready_text(metadata, sections))
                write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_bioc": bioc})
                results.append(result_record(pmid, "success", "Downloaded PubMed BioC abstract/metadata", metadata=metadata))
                print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via PubMed BioC")
                continue
        except Exception as exc:  # noqa: BLE001
            metadata["pubmed_bioc_error"] = str(exc)

        # PubMed BioC occasionally fails on transient upstream errors.
        # If the article still has a PMCID, retry the PMC HTML OA route
        # before falling through to non-OA publisher APIs or a hard failure.
        if metadata.get("pmcid"):
            pmc_html = fetch_pmc_article_html(client, metadata["pmcid"])
            if pmc_html:
                raw_html_path = raw_dir / f"{safe_filename(pmid)}.html"
                raw_html_path.parent.mkdir(parents=True, exist_ok=True)
                raw_html_path.write_text(pmc_html["html"])
                metadata["source"] = "OA_HTML"
                metadata["license"] = "pmc_html_oa"
                metadata["raw_file"] = str(raw_html_path)
                metadata["resolved_url"] = pmc_html["resolved_url"]
                metadata["tried_backends"] = metadata.get("tried_backends", []) + [pmc_html["source_name"]]
                metadata["text_file"] = str(txt_path)
                finalize_monitoring(metadata)
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
                print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via pmc_html_retry")
                continue

        if not metadata.get("doi"):
            finalize_monitoring(metadata)
            results.append(result_record(pmid, "failed", "No DOI and PubMed BioC unavailable", metadata=metadata))
            continue

        metadata["tried_backends"] = metadata.get("tried_backends", [])
        doi = metadata.get("doi", "")

        # SAGE CookieJar HTML (BioC-failure path)
        if metadata.get("publisher_family") == "SAGE":
            try:
                metadata["tried_backends"].append("sage_cookiejar_html")
                sage_candidates = [c.get("url", "") for c in metadata.get("fulltext_candidates", []) if "sagepub.com" in c.get("url", "")]
                sage_landing = sage_candidates[0] if sage_candidates else ""
                sage_result = fetch_sage_html(doi, sage_landing)
                if sage_result:
                    raw_html_path = raw_dir / f"{safe_filename(pmid)}_sage.html"
                    raw_html_path.parent.mkdir(parents=True, exist_ok=True)
                    raw_html_path.write_text(sage_result["html"])
                    metadata["source"] = "Publisher_HTML"
                    metadata["license"] = "publisher_free_full_text"
                    metadata["raw_file"] = str(raw_html_path)
                    metadata["resolved_url"] = sage_result["resolved_url"]
                    metadata["text_file"] = str(txt_path)
                    metadata["body_word_count"] = sage_result["word_count"]
                    finalize_monitoring(metadata)
                    txt_path.write_text(llm_ready_text(metadata, sage_result["sections"]))
                    write_json(meta_path, {"metadata": metadata, "sections": sage_result["sections"], "raw_html": sage_result["html"]})
                    results.append(result_record(pmid, "success", "Downloaded SAGE HTML full text", metadata=metadata))
                    print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via sage_cookiejar_html")
                    continue
            except Exception as exc:
                metadata["sage_html_error"] = str(exc)

        # Springer OA API (BioC-failure path)
        if SPRINGER_API_KEY and metadata.get("publisher_family") == "Springer Nature":
            try:
                metadata["tried_backends"].append("springer_oa_api")
                xml = fetch_springer_openaccess_fulltext(client, doi)
                if xml and "<article" in xml and len(xml) > 500:
                    sections = flatten_pmc_xml_to_sections(xml)
                    if sections and sections_have_body(sections):
                        raw_path = raw_dir / f"{safe_filename(pmid)}_springer.xml"
                        raw_path.write_text(xml)
                        metadata["source"] = "Springer_OA_API"
                        metadata["license"] = "springer_oa_api"
                        metadata["raw_file"] = str(raw_path)
                        metadata["text_file"] = str(txt_path)
                        finalize_monitoring(metadata)
                        txt_path.write_text(llm_ready_text(metadata, sections))
                        write_json(meta_path, {"metadata": metadata, "sections": sections, "raw_springer_xml": xml})
                        results.append(result_record(pmid, "success", "Downloaded Springer OA API full text", metadata=metadata))
                        print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via Springer_OA_API")
                        continue
            except Exception as exc:
                metadata["springer_oa_error"] = str(exc)

        # ASM TDM XML (BioC-failure path)
        if doi and (is_probable_asm_doi(doi) or metadata.get("publisher_family") == "ASM"):
            try:
                metadata["tried_backends"].append("asm_tdm_xml")
                asm_result = fetch_asm_tdm_xml(client, doi, metadata.get("crossref_link", []))
                if asm_result:
                    raw_path = raw_dir / f"{safe_filename(pmid)}_asm.xml"
                    raw_path.write_text(asm_result["xml"])
                    metadata["source"] = "ASM_TDM_XML"
                    metadata["license"] = "asm_tdm"
                    metadata["raw_file"] = str(raw_path)
                    metadata["resolved_url"] = asm_result["resolved_url"]
                    metadata["text_file"] = str(txt_path)
                    finalize_monitoring(metadata)
                    txt_path.write_text(llm_ready_text(metadata, asm_result["sections"]))
                    write_json(meta_path, {"metadata": metadata, "sections": asm_result["sections"], "raw_asm_xml": asm_result["xml"]})
                    results.append(result_record(pmid, "success", "Downloaded ASM TDM XML full text", metadata=metadata))
                    print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via ASM_TDM_XML")
                    continue
            except Exception as exc:
                metadata["asm_tdm_error"] = str(exc)

        # Wiley TDM (BioC-failure path)
        if WILEY_API_KEY and doi and (is_probable_wiley_doi(doi) or metadata.get("publisher_family") == "Wiley"):
            try:
                metadata["tried_backends"].append("wiley_tdm_api")
                doi_enc = parse.quote(normalize_doi(doi), safe="")
                wiley_url = f"https://api.wiley.com/onlinelibrary/tdm/v1/articles/{doi_enc}"
                raw_path = raw_dir / f"{safe_filename(pmid)}_wiley.pdf"
                client.download_file(wiley_url, raw_path, headers={"Wiley-TDM-Client-Token": WILEY_API_KEY, "Accept": "application/pdf"}, timeout=60)
                metadata["source"] = "Wiley_TDM_PDF"
                metadata["license"] = "publisher_pdf"
                metadata["raw_file"] = str(raw_path)
                metadata["resolved_url"] = wiley_url
                metadata["text_file"] = str(txt_path)
                finalize_monitoring(metadata)
                txt_path.write_text(llm_ready_text(metadata, [{"section": "RAW_PDF_NOTE", "text": f"Wiley TDM PDF archived at {raw_path}."}]))
                write_json(meta_path, {"metadata": metadata, "raw_pdf_note": "Wiley TDM PDF; no text extraction"})
                results.append(result_record(pmid, "success", "Downloaded Wiley TDM PDF", metadata=metadata))
                print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via Wiley_TDM_PDF")
                continue
            except Exception as exc:
                metadata["wiley_tdm_error"] = str(exc)

        # Elsevier Article API
        if not ELSEVIER_API_KEY:
            results.append(result_record(pmid, "failed", "No API key available"))
            continue

        try:
            metadata["tried_backends"].append("elsevier_article_api")
            raw_json_path = raw_dir / f"{safe_filename(pmid)}.json"
            payload = download_elsevier_fulltext(client, pmid, raw_json_path)
            full_text = json.dumps(payload, ensure_ascii=False, indent=2)
            if not re.search(r"<(?:ce:sections|ce:para|body)\b", full_text):
                raise RuntimeError("Elsevier API returned metadata-only response (no body content)")
            metadata["source"] = "Elsevier_Article_API"
            metadata["license"] = "publisher_api"
            metadata["doi"] = doi
            metadata["text_file"] = str(txt_path)
            finalize_monitoring(metadata)
            txt_path.write_text(
                llm_ready_text(metadata, [{"section": "PUBLISHER_FULL_TEXT_JSON", "text": full_text}])
            )
            write_json(meta_path, {"metadata": metadata, "raw_elsevier": payload})
            results.append(result_record(pmid, "success", "Downloaded publisher API payload", metadata=metadata))
            print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} via publisher API")
        except Exception as exc:  # noqa: BLE001
            metadata["elsevier_error"] = str(exc)
            finalize_monitoring(metadata)
            results.append(
                result_record(
                    pmid,
                    "failed",
                    str(exc),
                    metadata=metadata,
                    extra={"failure_category": infer_failure_category({"reason": str(exc)})},
                )
            )
            print_stderr(f"[API] {idx}/{len(pmids)} PMID {pmid} failed: {exc}")

    write_jsonl(run_dir / "api_results.jsonl", results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
