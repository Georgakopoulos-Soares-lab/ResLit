#!/usr/bin/env python3
"""Download open-access full text for PMIDs via PMC/NCBI services."""

from __future__ import annotations

from pathlib import Path

from pubmed_common import (
    HttpClient,
    RateLimiter,
    RequestContext,
    build_arg_parser,
    choose_best_oa_link,
    ensure_dir,
    extract_metadata,
    fetch_idconv,
    fetch_oa_record,
    fetch_pmc_full_xml,
    fetch_pmcoa_bioc,
    fetch_pubmed_summaries,
    flatten_bioc_to_sections,
    flatten_pmc_xml_to_sections,
    llm_ready_text,
    print_stderr,
    read_pmids,
    result_record,
    safe_filename,
    write_json,
    write_jsonl,
)


def main() -> int:
    parser = build_arg_parser("Download PMC open-access articles for a PMID list.")
    args = parser.parse_args()

    pmids = read_pmids(args.pmid_file, args.limit)
    out_root = ensure_dir(args.out_dir)
    raw_dir = ensure_dir(out_root / "oa" / "raw")
    text_dir = ensure_dir(out_root / "oa" / "txt")
    meta_dir = ensure_dir(out_root / "oa" / "meta")
    run_dir = ensure_dir(out_root / "runs")

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
        metadata["source"] = "PMC_OA_BioC"

        txt_path = text_dir / f"{safe_filename(pmid)}.txt"
        meta_path = meta_dir / f"{safe_filename(pmid)}.json"
        if txt_path.exists() and meta_path.exists() and not args.force:
            results.append(result_record(pmid, "cached", "Existing OA outputs found", metadata=metadata))
            continue

        pmcid = metadata.get("pmcid", "")
        if not pmcid:
            results.append(result_record(pmid, "failed", "No PMCID mapping; not in PMC", metadata=metadata))
            continue

        try:
            oa_record = fetch_oa_record(client, pmcid)
            sections = []
            if oa_record:
                metadata["source"] = "PMC_OA_BioC"
                metadata["license"] = oa_record.get("license", "")
                metadata["oa_citation"] = oa_record.get("citation", "")
                best_link = choose_best_oa_link(oa_record)
                if best_link:
                    metadata["download_link"] = best_link.get("href", "")
                    raw_suffix = ".pdf" if best_link.get("format") == "pdf" else ".tar.gz"
                    raw_path = raw_dir / f"{safe_filename(pmid)}{raw_suffix}"
                    if args.force or not raw_path.exists():
                        client.download_file(best_link["href"], raw_path)
                    metadata["raw_file"] = str(raw_path)
                bioc = fetch_pmcoa_bioc(client, pmid)
                sections = flatten_bioc_to_sections(bioc)
            else:
                metadata["source"] = "PMC_EFetch_XML"
                metadata["license"] = "pmc_free_to_read"
                pmc_xml = fetch_pmc_full_xml(client, pmcid)
                raw_path = raw_dir / f"{safe_filename(pmid)}.xml"
                raw_path.write_text(pmc_xml)
                metadata["raw_file"] = str(raw_path)
                sections = flatten_pmc_xml_to_sections(pmc_xml)

            if not sections:
                results.append(result_record(pmid, "failed", "PMC full text response had no passages", metadata=metadata))
                continue

            text_path = text_dir / f"{safe_filename(pmid)}.txt"
            text_path.write_text(llm_ready_text(metadata, sections))
            metadata["text_file"] = str(text_path)
            metadata["section_count"] = len(sections)
            write_json(meta_path, {"metadata": metadata, "sections": sections, "oa_record": oa_record})
            results.append(result_record(pmid, "success", f"Downloaded PMC full text via {metadata['source']}", metadata=metadata))
        except Exception as exc:  # noqa: BLE001
            results.append(result_record(pmid, "failed", str(exc), metadata=metadata))
            print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} failed: {exc}")
            continue

        print_stderr(f"[OA] {idx}/{len(pmids)} PMID {pmid} done")

    write_jsonl(run_dir / "oa_results.jsonl", results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
