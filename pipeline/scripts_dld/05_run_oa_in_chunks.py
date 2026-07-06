#!/usr/bin/env python3
"""Run open-access downloads in sequential PMID chunks and archive per-chunk logs.

This wrapper is intended for large PMID lists where hitting external OA services
in one giant run is undesirable. It splits the input PMID file into chunk files,
runs `01_download_oa.py` once per chunk, and stores a permanent copy of each
chunk's result JSONL plus a compact summary manifest.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pmid-file",
        default="positive_first_run_pmids.txt",
        help="Path to a file with one PMID per line.",
    )
    parser.add_argument(
        "--out-dir",
        default="outputs_oa_chunks",
        help="Output root shared by all chunked OA runs.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=200,
        help="Number of PMIDs per chunk.",
    )
    parser.add_argument(
        "--start-chunk",
        type=int,
        default=1,
        help="1-based chunk index to start from.",
    )
    parser.add_argument(
        "--end-chunk",
        type=int,
        default=0,
        help="Optional 1-based chunk index to stop at (0 = all chunks).",
    )
    parser.add_argument(
        "--pause-seconds",
        type=float,
        default=15.0,
        help="Sleep between chunks to avoid bursty traffic.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=None,
        help="Per-request delay passed through to 01_download_oa.py.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Pass --force to 01_download_oa.py.",
    )
    parser.add_argument(
        "--skip-oa-bulk",
        action="store_true",
        help="Pass --skip-oa-bulk to 01_download_oa.py to avoid fetching the large PMC OA file list.",
    )
    parser.add_argument(
        "--skip-external",
        action="store_true",
        help="Pass --skip-external to 01_download_oa.py to skip Unpaywall/OpenAlex/EuropePMC-core calls.",
    )
    parser.add_argument(
        "--skip-raw",
        action="store_true",
        help="Pass --skip-raw to 01_download_oa.py to skip saving raw HTML/XML files (saves disk space).",
    )
    parser.add_argument(
        "--tool",
        default="",
        help="Optional tool name passed to 01_download_oa.py. Defaults to apikey.env or script default.",
    )
    parser.add_argument(
        "--email",
        default="",
        help="Optional email passed to 01_download_oa.py. Defaults to apikey.env or script default.",
    )
    return parser.parse_args()


def read_pmids(path: Path) -> list[str]:
    pmids: list[str] = []
    seen: set[str] = set()
    for raw_line in path.read_text().splitlines():
        pmid = raw_line.strip()
        if not pmid or not pmid.isdigit():
            continue
        if len(pmid) > 8 or pmid in seen:
            continue
        seen.add(pmid)
        pmids.append(pmid)
    return pmids


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def load_json(path: Path) -> Any:
    if not path.exists():
        return None
    return json.loads(path.read_text())


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    status_counts: dict[str, int] = {}
    success_pmids: list[str] = []
    failed_pmids: list[str] = []
    bioc_only_pmids: list[str] = []
    source_counts: dict[str, int] = {}

    for row in rows:
        status = str(row.get("status", "unknown"))
        status_counts[status] = status_counts.get(status, 0) + 1

        metadata = row.get("metadata") or {}
        source = str(metadata.get("source", "")).strip()
        if source:
            source_counts[source] = source_counts.get(source, 0) + 1

        pmid = str(row.get("pmid", "")).strip()
        if status == "success" and pmid:
            if source == "PubMed_BioC":
                # Abstract-only fallback: OA did not find full text; needs API retry
                bioc_only_pmids.append(pmid)
            else:
                success_pmids.append(pmid)
        elif status == "failed" and pmid:
            failed_pmids.append(pmid)

    return {
        "row_count": len(rows),
        "status_counts": status_counts,
        "source_counts": dict(sorted(source_counts.items())),
        "success_pmids": success_pmids,
        "failed_pmids": failed_pmids,
        "bioc_only_pmids": bioc_only_pmids,
    }


def main() -> int:
    args = parse_args()
    pmid_path = Path(args.pmid_file)
    if not pmid_path.exists():
        raise SystemExit(f"Missing PMID file: {pmid_path}")
    if args.chunk_size <= 0:
        raise SystemExit("--chunk-size must be > 0")
    if args.start_chunk <= 0:
        raise SystemExit("--start-chunk must be >= 1")

    pmids = read_pmids(pmid_path)
    if not pmids:
        raise SystemExit(f"No valid PMIDs found in {pmid_path}")

    out_root = ensure_dir(Path(args.out_dir))
    chunk_dir = ensure_dir(out_root / "chunk_inputs")
    log_dir = ensure_dir(out_root / "chunk_logs")
    run_dir = ensure_dir(out_root / "runs")
    aggregate_summary_path = log_dir / "chunk_run_manifest.json"
    aggregate_success_path = log_dir / "successful_pmids.txt"
    aggregate_failed_path = log_dir / "failed_pmids.txt"
    aggregate_bioc_path = log_dir / "bioc_only_pmids.txt"
    aggregate_needs_api_path = log_dir / "needs_api_pmids.txt"

    total_chunks = (len(pmids) + args.chunk_size - 1) // args.chunk_size
    end_chunk = args.end_chunk or total_chunks
    if end_chunk > total_chunks:
        end_chunk = total_chunks
    if args.start_chunk > end_chunk:
        raise SystemExit("start-chunk is greater than end-chunk")

    print(f"Valid PMIDs: {len(pmids)}")
    print(f"Chunk size : {args.chunk_size}")
    print(f"Total chunks: {total_chunks}")
    print(f"Running chunks {args.start_chunk}..{end_chunk}")

    existing_manifest = load_json(aggregate_summary_path)
    manifest_by_chunk: dict[int, dict[str, Any]] = {}
    if isinstance(existing_manifest, list):
        for item in existing_manifest:
            if isinstance(item, dict) and isinstance(item.get("chunk_index"), int):
                manifest_by_chunk[item["chunk_index"]] = item

    for chunk_index in range(args.start_chunk, end_chunk + 1):
        start = (chunk_index - 1) * args.chunk_size
        end = min(start + args.chunk_size, len(pmids))
        chunk_pmids = pmids[start:end]
        chunk_name = f"chunk_{chunk_index:04d}"
        chunk_file = chunk_dir / f"{chunk_name}.txt"
        chunk_file.write_text("".join(f"{pmid}\n" for pmid in chunk_pmids))

        cmd = [
            sys.executable,
            "01_download_oa.py",
            "--pmid-file",
            str(chunk_file),
            "--out-dir",
            str(out_root),
        ]
        if args.tool:
            cmd.extend(["--tool", args.tool])
        if args.email:
            cmd.extend(["--email", args.email])
        if args.sleep is not None:
            cmd.extend(["--sleep", str(args.sleep)])
        if args.force:
            cmd.append("--force")
        if args.skip_oa_bulk:
            cmd.append("--skip-oa-bulk")
        if args.skip_external:
            cmd.append("--skip-external")
        if args.skip_raw:
            cmd.append("--skip-raw")

        print(f"\n[{chunk_index}/{total_chunks}] Running {chunk_name} ({len(chunk_pmids)} PMIDs)")
        started_at = time.time()
        completed = subprocess.run(cmd, check=False)
        duration_seconds = round(time.time() - started_at, 2)

        chunk_jsonl = log_dir / f"{chunk_name}_oa_results.jsonl"
        current_results = run_dir / "oa_results.jsonl"
        if current_results.exists():
            shutil.copy2(current_results, chunk_jsonl)
        rows = load_jsonl(chunk_jsonl)
        summary = summarize_rows(rows)
        chunk_summary = {
            "chunk_index": chunk_index,
            "chunk_name": chunk_name,
            "pmid_start_offset": start,
            "pmid_end_offset_exclusive": end,
            "pmid_count": len(chunk_pmids),
            "pmid_file": str(chunk_file),
            "results_file": str(chunk_jsonl),
            "exit_code": completed.returncode,
            "duration_seconds": duration_seconds,
            **summary,
        }
        write_json(log_dir / f"{chunk_name}_summary.json", chunk_summary)
        manifest_by_chunk[chunk_index] = chunk_summary
        manifest = [manifest_by_chunk[idx] for idx in sorted(manifest_by_chunk)]
        write_json(aggregate_summary_path, manifest)

        all_success_pmids: list[str] = []
        all_failed_pmids: list[str] = []
        all_bioc_only_pmids: list[str] = []
        for item in manifest:
            all_success_pmids.extend(item.get("success_pmids", []))
            all_failed_pmids.extend(item.get("failed_pmids", []))
            all_bioc_only_pmids.extend(item.get("bioc_only_pmids", []))
        all_needs_api = sorted(set(all_failed_pmids) | set(all_bioc_only_pmids))
        aggregate_success_path.write_text("".join(f"{pmid}\n" for pmid in sorted(set(all_success_pmids))))
        aggregate_failed_path.write_text("".join(f"{pmid}\n" for pmid in sorted(set(all_failed_pmids))))
        aggregate_bioc_path.write_text("".join(f"{pmid}\n" for pmid in sorted(set(all_bioc_only_pmids))))
        aggregate_needs_api_path.write_text("".join(f"{pmid}\n" for pmid in all_needs_api))

        print(
            f"[{chunk_index}/{total_chunks}] "
            f"exit={completed.returncode} "
            f"success={len(summary['success_pmids'])} "
            f"bioc_only={len(summary['bioc_only_pmids'])} "
            f"failed={len(summary['failed_pmids'])} "
            f"rows={summary['row_count']}"
        )

        if completed.returncode != 0:
            print(f"Stopping after {chunk_name} due to non-zero exit code.")
            return completed.returncode

        if chunk_index < end_chunk and args.pause_seconds > 0:
            print(f"Sleeping {args.pause_seconds} seconds before next chunk...")
            time.sleep(args.pause_seconds)

    print("\nFinished all requested chunks.")
    print(f"Manifest: {aggregate_summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
