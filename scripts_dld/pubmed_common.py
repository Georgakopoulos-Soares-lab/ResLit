#!/usr/bin/env python3
"""Shared helpers for PubMed/PMC article retrieval workflows."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib import parse, request
from urllib.error import HTTPError, URLError


def load_env_file(env_path: str | Path = "apikey.env") -> None:
    path = Path(env_path)
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("--email "):
            os.environ.setdefault("NCBI_EMAIL", line[len("--email ") :].strip())
            continue
        if line.startswith("--tool "):
            os.environ.setdefault("NCBI_TOOL", line[len("--tool ") :].strip())
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


load_env_file()

ENV_ALIASES = {
    "NCBI_API_KEY": ("NCBI_API_KEY", "NCBI_KEY"),
    "ELSEVIER_API_KEY": ("ELSEVIER_API_KEY", "ELSEVIER_KEY"),
    "SPRINGER_API_KEY": ("SPRINGER_API_KEY", "SPRINGER_KEY"),
    "WILEY_API_KEY": ("WILEY_API_KEY", "WILEY_KEY"),
}


def get_env_value(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


DEFAULT_TOOL = os.environ.get("NCBI_TOOL", "pmid_pipeline")
DEFAULT_EMAIL = os.environ.get("NCBI_EMAIL", "maintainer@example.com")
NCBI_API_KEY = get_env_value(*ENV_ALIASES["NCBI_API_KEY"])
ELSEVIER_API_KEY = get_env_value(*ENV_ALIASES["ELSEVIER_API_KEY"])
SPRINGER_API_KEY = get_env_value(*ENV_ALIASES["SPRINGER_API_KEY"])
WILEY_API_KEY = get_env_value(*ENV_ALIASES["WILEY_API_KEY"])

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
PMC_IDCONV_BASE = "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/"
PMC_OA_BASE = "https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi"
BIOC_PUBMED = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pubmed.cgi"
BIOC_PMCOA = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi"
ELSEVIER_ARTICLE_BASE = "https://api.elsevier.com/content/article/pubmed_id"
SPRINGER_OPENACCESS_BASE = "https://api.springernature.com/openaccess/jats"
SPRINGER_META_BASE = "https://api.springernature.com/meta/v2/json"
CROSSREF_WORKS_BASE = "https://api.crossref.org/works"
UNPAYWALL_BASE = "https://api.unpaywall.org/v2"
OPENALEX_WORKS_BASE = "https://api.openalex.org/works"
EUROPE_PMC_SEARCH_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

USER_AGENT = "pmid_pipeline/0.1 (https://example.org)"


def build_arg_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--pmid-file",
        default="amr_genes_pmids_amrprofiler_uniq.txt",
        help="Path to a file with one PMID per line.",
    )
    parser.add_argument(
        "--out-dir",
        default="outputs",
        help="Directory for downloaded files and run summaries.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional cap on number of PMIDs to process.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=None,
        help="Seconds to sleep between requests. Defaults follow NCBI guidance.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Redownload records even if outputs already exist.",
    )
    parser.add_argument(
        "--tool",
        default=DEFAULT_TOOL,
        help="Tool name sent to NCBI.",
    )
    parser.add_argument(
        "--email",
        default=DEFAULT_EMAIL,
        help="Maintainer email sent to NCBI.",
    )
    return parser


def read_pmids(path: str | Path, limit: int | None = None) -> list[str]:
    pmids: list[str] = []
    seen: set[str] = set()
    with Path(path).open() as handle:
        for raw in handle:
            pmid = raw.strip()
            if not pmid or pmid.startswith("#"):
                continue
            if not pmid.isdigit():
                continue
            if pmid in seen:
                continue
            seen.add(pmid)
            pmids.append(pmid)
            if limit is not None and len(pmids) >= limit:
                break
    return pmids


def ensure_dir(path: str | Path) -> Path:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return target


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[idx : idx + size] for idx in range(0, len(items), size)]


def safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "unknown"


class RateLimiter:
    def __init__(self, sleep_seconds: float | None = None) -> None:
        if sleep_seconds is None:
            sleep_seconds = 0.11 if NCBI_API_KEY else 0.34
        self.sleep_seconds = sleep_seconds
        self.last_request_at = 0.0

    def wait(self) -> None:
        now = time.time()
        remaining = self.sleep_seconds - (now - self.last_request_at)
        if remaining > 0:
            time.sleep(remaining)
        self.last_request_at = time.time()


@dataclass
class RequestContext:
    tool: str
    email: str
    rate_limiter: RateLimiter


class HttpClient:
    def __init__(self, ctx: RequestContext):
        self.ctx = ctx

    def get_text(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 60,
    ) -> str:
        final_url = url
        if params:
            query = parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
            final_url = f"{url}?{query}"
        merged_headers = {"User-Agent": USER_AGENT}
        if headers:
            merged_headers.update(headers)
        req = request.Request(final_url, headers=merged_headers)
        self.ctx.rate_limiter.wait()
        try:
            with request.urlopen(req, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} for {final_url}: {body[:400]}") from exc
        except URLError as exc:
            raise RuntimeError(f"URL error for {final_url}: {exc}") from exc

    def get_response(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 60,
    ) -> dict[str, Any]:
        final_url = url
        if params:
            query = parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
            final_url = f"{url}?{query}"
        merged_headers = {"User-Agent": USER_AGENT}
        if headers:
            merged_headers.update(headers)
        req = request.Request(final_url, headers=merged_headers)
        self.ctx.rate_limiter.wait()
        try:
            with request.urlopen(req, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                body = response.read().decode(charset, errors="replace")
                return {
                    "url": response.geturl(),
                    "body": body,
                    "headers": dict(response.headers.items()),
                    "content_type": response.headers.get_content_type(),
                }
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} for {final_url}: {body[:400]}") from exc
        except URLError as exc:
            raise RuntimeError(f"URL error for {final_url}: {exc}") from exc

    def get_json(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 60,
    ) -> Any:
        return json.loads(self.get_text(url, params=params, headers=headers, timeout=timeout))

    def download_file(
        self,
        url: str,
        destination: str | Path,
        headers: dict[str, str] | None = None,
        timeout: int = 120,
    ) -> Path:
        merged_headers = {"User-Agent": USER_AGENT}
        if headers:
            merged_headers.update(headers)
        req = request.Request(url, headers=merged_headers)
        self.ctx.rate_limiter.wait()
        dest = Path(destination)
        with request.urlopen(req, timeout=timeout) as response:
            data = response.read()
        dest.write_bytes(data)
        return dest

    def get_bytes_response(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: int = 120,
    ) -> dict[str, Any]:
        final_url = url
        if params:
            query = parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
            final_url = f"{url}?{query}"
        merged_headers = {"User-Agent": USER_AGENT}
        if headers:
            merged_headers.update(headers)
        req = request.Request(final_url, headers=merged_headers)
        self.ctx.rate_limiter.wait()
        try:
            with request.urlopen(req, timeout=timeout) as response:
                return {
                    "url": response.geturl(),
                    "body": response.read(),
                    "headers": dict(response.headers.items()),
                    "content_type": response.headers.get_content_type(),
                }
        except HTTPError as exc:
            body = exc.read()
            preview = body[:400].decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} for {final_url}: {preview}") from exc
        except URLError as exc:
            raise RuntimeError(f"URL error for {final_url}: {exc}") from exc


def ncbi_common_params(ctx: RequestContext) -> dict[str, str]:
    params = {"tool": ctx.tool, "email": ctx.email}
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY
    return params


def fetch_pubmed_summaries(client: HttpClient, pmids: list[str]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for group in chunked(pmids, 200):
        params = {"db": "pubmed", "id": ",".join(group), "retmode": "json"}
        params.update(ncbi_common_params(client.ctx))
        payload = client.get_json(f"{EUTILS_BASE}/esummary.fcgi", params=params)
        for uid in payload.get("result", {}).get("uids", []):
            results[uid] = payload["result"][uid]
    return results


def fetch_idconv(client: HttpClient, pmids: list[str]) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for group in chunked(pmids, 200):
        params = {
            "ids": ",".join(group),
            "idtype": "pmid",
            "format": "json",
            "versions": "no",
            "tool": client.ctx.tool,
            "email": client.ctx.email,
        }
        payload = client.get_json(PMC_IDCONV_BASE, params=params)
        for record in payload.get("records", []):
            pmid = str(record.get("pmid", "")).strip()
            if pmid:
                results[pmid] = record
    return results


def fetch_oa_record(client: HttpClient, pmcid: str) -> dict[str, Any] | None:
    params = {"id": pmcid}
    raw_xml = client.get_text(PMC_OA_BASE, params=params)
    import xml.etree.ElementTree as ET

    root = ET.fromstring(raw_xml)
    record = root.find(".//record")
    if record is None:
        return None
    links = []
    for link in record.findall("./link"):
        links.append(
            {
                "format": link.attrib.get("format"),
                "updated": link.attrib.get("updated"),
                "href": link.attrib.get("href"),
            }
        )
    return {
        "id": record.attrib.get("id"),
        "citation": record.attrib.get("citation"),
        "license": record.attrib.get("license"),
        "retracted": record.attrib.get("retracted"),
        "links": links,
        "raw_xml": raw_xml,
    }


def fetch_pubmed_bioc(client: HttpClient, pmid: str) -> dict[str, Any]:
    return client.get_json(f"{BIOC_PUBMED}/BioC_json/{pmid}/unicode")


def fetch_pmcoa_bioc(client: HttpClient, identifier: str) -> dict[str, Any]:
    return client.get_json(f"{BIOC_PMCOA}/BioC_json/{identifier}/unicode")


def fetch_unpaywall_record(client: HttpClient, doi: str) -> dict[str, Any]:
    return client.get_json(
        f"{UNPAYWALL_BASE}/{parse.quote(doi, safe='')}",
        params={"email": client.ctx.email},
        headers={"Accept": "application/json"},
    )


def normalize_title_for_match(title: str) -> str:
    title = title.lower()
    title = re.sub(r"[^a-z0-9]+", " ", title)
    return " ".join(title.split())


def search_openalex_title(client: HttpClient, title: str, doi: str = "") -> dict[str, Any]:
    params = {
        "search": title,
        "per-page": 5,
        "mailto": client.ctx.email,
    }
    payload = client.get_json(OPENALEX_WORKS_BASE, params=params, headers={"Accept": "application/json"})
    target_doi = doi.lower().strip()
    results = payload.get("results", []) or []
    if target_doi:
        for item in results:
            item_doi = str(item.get("doi") or "").lower().removeprefix("https://doi.org/")
            if item_doi == target_doi:
                return item
        return {}
    target_title = normalize_title_for_match(title)
    for item in results:
        display_name = normalize_title_for_match(item.get("display_name") or "")
        if display_name == target_title:
            return item
    return {}


def fetch_europepmc_core(client: HttpClient, pmid: str) -> dict[str, Any]:
    return client.get_json(
        EUROPE_PMC_SEARCH_BASE,
        params={
            "query": f"EXT_ID:{pmid} AND SRC:MED",
            "resultType": "core",
            "format": "json",
            "pageSize": 1,
        },
        headers={"Accept": "application/json"},
    )


def normalize_pmcid_for_efetch(pmcid: str) -> str:
    return pmcid.upper().removeprefix("PMC")


def fetch_pmc_full_xml(client: HttpClient, pmcid: str) -> str:
    params = {
        "db": "pmc",
        "id": normalize_pmcid_for_efetch(pmcid),
        "retmode": "xml",
    }
    params.update(ncbi_common_params(client.ctx))
    return client.get_text(f"{EUTILS_BASE}/efetch.fcgi", params=params, timeout=120)


def choose_best_oa_link(oa_record: dict[str, Any] | None) -> dict[str, Any] | None:
    if not oa_record:
        return None
    links = oa_record.get("links", [])
    for fmt in ("pdf", "tgz"):
        for link in links:
            if link.get("format") == fmt and link.get("href"):
                return link
    return links[0] if links else None


def flatten_bioc_to_sections(payload: Any) -> list[dict[str, str]]:
    if isinstance(payload, list):
        sections: list[dict[str, str]] = []
        for item in payload:
            sections.extend(flatten_bioc_to_sections(item))
        return sections
    if not isinstance(payload, dict):
        return []

    sections: list[dict[str, str]] = []
    for document in payload.get("documents", []):
        for passage in document.get("passages", []):
            text = (passage.get("text") or "").strip()
            if not text:
                continue
            infons = passage.get("infons") or {}
            section_type = infons.get("section_type") or infons.get("type") or "UNKNOWN"
            sections.append({"section": section_type, "text": text})
    return sections


def flatten_pmc_xml_to_sections(xml_text: str) -> list[dict[str, str]]:
    import xml.etree.ElementTree as ET

    root = ET.fromstring(xml_text)
    sections: list[dict[str, str]] = []
    title = " ".join(root.findtext(".//article-title", default="").split())
    abstract_nodes = root.findall(".//abstract")
    if abstract_nodes:
        abstract_parts = [" ".join(" ".join(node.itertext()).split()) for node in abstract_nodes]
        abstract_text = " ".join(part for part in abstract_parts if part).strip()
        if abstract_text:
            sections.append({"section": "ABSTRACT", "text": abstract_text})
    for sec in root.findall(".//body//sec"):
        sec_title = " ".join(sec.findtext("./title", default="").split()) or "BODY"
        sec_text = " ".join(" ".join(sec.itertext()).split())
        if sec_title:
            sec_text = sec_text.replace(sec_title, "", 1).strip()
        if sec_text:
            sections.append({"section": sec_title.upper(), "text": sec_text})
    if not sections:
        body_text = " ".join(" ".join(root.find(".//body").itertext()).split()) if root.find(".//body") is not None else ""
        if body_text:
            if title:
                body_text = body_text.replace(title, "", 1).strip()
            sections.append({"section": "FULL_TEXT", "text": body_text})
    return sections


def llm_ready_text(metadata: dict[str, Any], sections: list[dict[str, str]]) -> str:
    lines = [
        f"PMID: {metadata.get('pmid', '')}",
        f"PMCID: {metadata.get('pmcid', '')}",
        f"DOI: {metadata.get('doi', '')}",
        f"Title: {metadata.get('title', '')}",
        f"Journal: {metadata.get('journal', '')}",
        f"PubDate: {metadata.get('pubdate', '')}",
        f"Authors: {', '.join(metadata.get('authors', []))}",
        f"Source: {metadata.get('source', '')}",
        f"License: {metadata.get('license', '')}",
        "",
    ]
    for section in sections:
        lines.append(f"## {section['section']}")
        lines.append(section["text"])
        lines.append("")
    return "\n".join(lines).strip() + "\n"


class SimpleHTMLTextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "p",
        "div",
        "section",
        "article",
        "main",
        "li",
        "ul",
        "ol",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "title",
    }
    SKIP_TAGS = {"script", "style", "noscript", "svg"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth == 0 and tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS and self.skip_depth > 0:
            self.skip_depth -= 1
            return
        if self.skip_depth == 0 and tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth == 0:
            text = data.strip()
            if text:
                self.parts.append(text)
                self.parts.append(" ")

    def get_text(self) -> str:
        text = html.unescape("".join(self.parts))
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip()


def html_to_text_sections(html_text: str, source_label: str = "HTML_FULL_TEXT") -> list[dict[str, str]]:
    extractor = SimpleHTMLTextExtractor()
    extractor.feed(html_text)
    text = extractor.get_text()
    if not text:
        return []
    return [{"section": source_label, "text": text}]


def extract_metadata(summary: dict[str, Any], idconv: dict[str, Any] | None = None) -> dict[str, Any]:
    article_ids = summary.get("articleids") or []
    doi = ""
    for entry in article_ids:
        if entry.get("idtype") == "doi":
            doi = entry.get("value", "")
            break
    authors = [author.get("name", "") for author in summary.get("authors", []) if author.get("name")]
    return {
        "pmid": str(summary.get("uid", "")),
        "pmcid": (idconv or {}).get("pmcid", ""),
        "doi": doi,
        "title": summary.get("title", ""),
        "journal": summary.get("fulljournalname") or summary.get("source", ""),
        "source_abbrev": summary.get("source", ""),
        "publisher_location": summary.get("publisher_location", ""),
        "pubdate": summary.get("pubdate", ""),
        "sortpubdate": summary.get("sortpubdate", ""),
        "authors": authors,
    }


def result_record(
    pmid: str,
    status: str,
    reason: str,
    metadata: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = {"pmid": pmid, "status": status, "reason": reason}
    if metadata:
        record["metadata"] = metadata
    if extra:
        record.update(extra)
    return record


def write_json(path: str | Path, payload: Any) -> None:
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def write_jsonl(path: str | Path, rows: list[dict[str, Any]]) -> None:
    with Path(path).open("w") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with Path(path).open() as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def infer_failure_category(record: dict[str, Any]) -> str:
    reason = (record.get("reason") or "").lower()
    if "open access" in reason or "oa" in reason:
        return "not_in_oa"
    if "no doi" in reason:
        return "missing_doi"
    if "api key" in reason:
        return "missing_api_key"
    if "publisher" in reason or "entitled" in reason or "403" in reason or "401" in reason:
        return "publisher_access"
    if "404" in reason:
        return "not_found"
    if "network" in reason or "url error" in reason:
        return "network"
    return "other"


def print_stderr(message: str) -> None:
    print(message, file=sys.stderr)
