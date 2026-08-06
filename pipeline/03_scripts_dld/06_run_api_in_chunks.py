#!/usr/bin/env python3
"""Run API-backed downloads in sequential PMID chunks.

Splits the input PMID file into chunks, runs 02_download_api_key_articles.py
once per chunk, and stores per-chunk JSONL results plus a manifest.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pmid-file", default="outputs_oa_chunks/failed_pmids_for_api.txt")
    parser.add_argument("--out-dir", default="outputs_api_chunks")
    parser.add_argument("--chunk-size", type=int, default=500)
    parser.add_argument("--start-chunk", type=int, default=1)
    parser.add_argument("--end-chunk", type=int, default=0)
    parser.add_argument("--pause-seconds", type=float, default=10.0)
    parser.add_argument("--sleep", type=float, default=None)
    parser.add_argument("--email", default="urith.xiao@gmail.com")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    pmids = [l.strip() for l in Path(args.pmid_file).read_text().splitlines() if l.strip().isdigit()]
    total_pmids = len(pmids)
    chunk_size = args.chunk_size
    total_chunks = (total_pmids + chunk_size - 1) // chunk_size

    out_root = Path(args.out_dir)
    chunk_input_dir = out_root / "chunk_inputs"
    chunk_log_dir = out_root / "chunk_logs"
    chunk_input_dir.mkdir(parents=True, exist_ok=True)
    chunk_log_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = chunk_log_dir / "chunk_run_manifest.json"
    failed_pmids_path = chunk_log_dir / "failed_pmids.txt"
    bioc_only_path = chunk_log_dir / "bioc_only_pmids.txt"
    needs_api_path = chunk_log_dir / "needs_api_pmids.txt"
    manifest: list[dict] = []
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception:
            manifest = []
    existing_chunks = {e["chunk_index"] for e in manifest}

    end_chunk = args.end_chunk if args.end_chunk > 0 else total_chunks

    for chunk_idx in range(args.start_chunk, end_chunk + 1):
        if chunk_idx > total_chunks:
            break

        start = (chunk_idx - 1) * chunk_size
        end = min(start + chunk_size, total_pmids)
        chunk_pmids = pmids[start:end]
        chunk_name = f"chunk_{chunk_idx:04d}"

        chunk_file = chunk_input_dir / f"{chunk_name}.txt"
        chunk_file.write_text("\n".join(chunk_pmids) + "\n")

        results_file = chunk_log_dir / f"{chunk_name}_api_results.jsonl"

        if chunk_idx in existing_chunks and results_file.exists() and not args.force:
            print(f"[{chunk_idx}/{total_chunks}] Skipping {chunk_name} (already done)")
            continue

        print(f"[{chunk_idx}/{total_chunks}] Running {chunk_name} ({len(chunk_pmids)} PMIDs)", flush=True)

        cmd = [
            sys.executable, "02_download_api_key_articles.py",
            "--pmid-file", str(chunk_file),
            "--out-dir", str(out_root),
            "--email", args.email,
        ]
        if args.sleep is not None:
            cmd += ["--sleep", str(args.sleep)]
        if args.force:
            cmd.append("--force")

        t0 = time.time()
        proc = subprocess.run(cmd, capture_output=False)
        duration = time.time() - t0

        # Count results from the merged api_results.jsonl written by 02_
        api_results_path = out_root / "runs" / "api_results.jsonl"
        status_counts: dict[str, int] = {}
        source_counts: dict[str, int] = {}
        chunk_rows: list[dict] = []
        chunk_failed_pmids: list[str] = []
        chunk_bioc_pmids: list[str] = []

        # The script overwrites api_results.jsonl each run; copy per-chunk results now
        if api_results_path.exists():
            all_rows = []
            for l in api_results_path.read_text().splitlines():
                if l.strip():
                    try:
                        all_rows.append(json.loads(l))
                    except json.JSONDecodeError:
                        pass
            chunk_pmid_set = set(chunk_pmids)
            chunk_rows = [r for r in all_rows if str(r.get("pmid", "")) in chunk_pmid_set]
            for r in chunk_rows:
                s = r.get("status", "unknown")
                status_counts[s] = status_counts.get(s, 0) + 1
                pmid = str(r.get("pmid", "")).strip()
                src = r.get("metadata", {}).get("source", "")
                if s == "success":
                    source_counts[src] = source_counts.get(src, 0) + 1
                    if src == "PubMed_BioC" and pmid:
                        chunk_bioc_pmids.append(pmid)
                elif s == "failed" and pmid:
                    chunk_failed_pmids.append(pmid)

        # Save per-chunk JSONL copy
        results_file.parent.mkdir(parents=True, exist_ok=True)
        results_file.write_text("\n".join(json.dumps(r) for r in chunk_rows) + "\n")

        entry = {
            "chunk_index": chunk_idx,
            "chunk_name": chunk_name,
            "pmid_start_offset": start,
            "pmid_end_offset_exclusive": end,
            "pmid_count": len(chunk_pmids),
            "pmid_file": str(chunk_file),
            "results_file": str(results_file),
            "exit_code": proc.returncode,
            "duration_seconds": round(duration, 1),
            "status_counts": status_counts,
            "source_counts": source_counts,
            "failed_pmids": chunk_failed_pmids,
            "bioc_only_pmids": chunk_bioc_pmids,
        }
        manifest = [e for e in manifest if e["chunk_index"] != chunk_idx]
        manifest.append(entry)
        manifest.sort(key=lambda e: e["chunk_index"])
        manifest_path.write_text(json.dumps(manifest, indent=2))

        # Rebuild aggregate PMID lists from all completed chunks
        all_failed: list[str] = []
        all_bioc: list[str] = []
        for e in manifest:
            all_failed.extend(e.get("failed_pmids", []))
            all_bioc.extend(e.get("bioc_only_pmids", []))
        all_needs = sorted(set(all_failed) | set(all_bioc))
        failed_pmids_path.write_text("".join(f"{p}\n" for p in sorted(set(all_failed))))
        bioc_only_path.write_text("".join(f"{p}\n" for p in sorted(set(all_bioc))))
        needs_api_path.write_text("".join(f"{p}\n" for p in all_needs))

        success = status_counts.get("success", 0)
        failed = status_counts.get("failed", 0)
        bioc = len(chunk_bioc_pmids)
        print(f"[{chunk_idx}/{total_chunks}] exit={proc.returncode} success={success} bioc_only={bioc} failed={failed}", flush=True)

        if chunk_idx < end_chunk:
            print(f"Sleeping {args.pause_seconds}s ...", flush=True)
            time.sleep(args.pause_seconds)

    print("Finished all requested chunks.")
    print(f"Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
