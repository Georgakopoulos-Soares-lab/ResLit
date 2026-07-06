#!/usr/bin/env python3
"""End-to-end PubMed full-text download pipeline.

Runs OA download → API download (for OA failures) → merge & filter,
all writing into a single base output directory.

Usage:
    python3 run_pipeline.py --pmid-file pmid_mutations.txt --out-dir outputs_mutations
    python3 run_pipeline.py --pmid-file my_pmids.txt --out-dir my_run --chunk-size 1000

Output layout:
    <out-dir>/
        oa/txt/          raw OA downloads
        api/txt/         raw API downloads
        fulltext_txt/    verified full-text (merged & deduplicated)
        abstract_txt/    abstract-only / rejected
        reports/         merge_filter_summary.json, fulltext_manifest.jsonl
        chunk_logs/      per-chunk manifests and PMID lists
        chunk_inputs/    per-chunk PMID files
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], label: str) -> None:
    print(f"\n{'='*60}", flush=True)
    print(f"[pipeline] {label}", flush=True)
    print(f"  $ {' '.join(cmd)}", flush=True)
    print(f"{'='*60}", flush=True)
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"\n[pipeline] ERROR: '{label}' exited with code {result.returncode}.", file=sys.stderr)
        raise SystemExit(result.returncode)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--pmid-file", required=True,
        help="Path to a plain-text file with one PMID per line.",
    )
    parser.add_argument(
        "--out-dir", required=True,
        help="Root output directory (created if absent).",
    )
    parser.add_argument(
        "--chunk-size", type=int, default=500,
        help="PMIDs per chunk for both OA and API phases (default: 500).",
    )
    parser.add_argument(
        "--min-words", type=int, default=500,
        help="Minimum body word count for full-text classification (default: 500).",
    )
    parser.add_argument(
        "--skip-raw", action="store_true",
        help="Do not save raw HTML/XML during OA phase (saves disk space).",
    )
    parser.add_argument(
        "--email", default="",
        help="Email for NCBI API requests (optional; falls back to apikey.env).",
    )
    parser.add_argument(
        "--skip-oa", action="store_true",
        help="Skip OA phase and go straight to API (use if OA was already run).",
    )
    parser.add_argument(
        "--skip-api", action="store_true",
        help="Skip API phase (run only OA + merge).",
    )
    parser.add_argument(
        "--skip-merge", action="store_true",
        help="Skip merge-and-filter step.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out = Path(args.out_dir)
    needs_api_path = out / "chunk_logs" / "needs_api_pmids.txt"

    # ── Step 1: OA phase ──────────────────────────────────────────────────────
    if not args.skip_oa:
        cmd = [
            sys.executable, "05_run_oa_in_chunks.py",
            "--pmid-file", args.pmid_file,
            "--out-dir",   str(out),
            "--chunk-size", str(args.chunk_size),
        ]
        if args.skip_raw:
            cmd.append("--skip-raw")
        if args.email:
            cmd += ["--email", args.email]
        run(cmd, "OA phase")
    else:
        print("[pipeline] Skipping OA phase.", flush=True)

    # ── Step 2: API phase ─────────────────────────────────────────────────────
    if not args.skip_api:
        if not needs_api_path.exists():
            print(
                f"[pipeline] WARNING: {needs_api_path} not found — "
                "running API phase with the original PMID file.",
                file=sys.stderr,
            )
            api_pmid_file = args.pmid_file
        else:
            api_pmid_file = str(needs_api_path)

        cmd = [
            sys.executable, "06_run_api_in_chunks.py",
            "--pmid-file", api_pmid_file,
            "--out-dir",   str(out),
            "--chunk-size", str(args.chunk_size),
        ]
        if args.email:
            cmd += ["--email", args.email]
        run(cmd, "API phase")
    else:
        print("[pipeline] Skipping API phase.", flush=True)

    # ── Step 3: Merge & filter ────────────────────────────────────────────────
    if not args.skip_merge:
        merged_dir = out.parent / (out.name + "_merged")
        cmd = [
            sys.executable, "merge_and_filter.py",
            "--base-dir", str(out),
            "--out-dir",  str(merged_dir),
            "--min-words", str(args.min_words),
        ]
        run(cmd, f"Merge & filter → {merged_dir}")
        print(f"\n[pipeline] Done. Full-text results: {merged_dir}/fulltext_txt/", flush=True)
    else:
        print("[pipeline] Skipping merge.", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
