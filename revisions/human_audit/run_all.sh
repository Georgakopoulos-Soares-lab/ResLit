#!/usr/bin/env bash
# Re-run every comparison; all outputs go to results/.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
for L in A B; do
    $PY scripts/gene_allele_compare.py --letter $L
    $PY scripts/mutation_compare.py --letter $L
done
$PY scripts/shared_compare.py
$PY scripts/all_papers_compare.py
