#!/usr/bin/env python3
"""
Compare BioMistral-7B abstract screening (biomistral_prediction) with the
manual judgement (my_judgement) on the 200-abstract validation sample.

The sample is stratified: 100 predicted YES and 100 predicted NO drawn
uniformly from the sampling pools in population_counts.txt. So precision (PPV)
and NPV come straight from each stratum, while recall, specificity and
prevalence must be re-weighted by the pool sizes, not read off the 200 rows.

Read-only on validation_200.csv. Writes into this folder:
  validation_metrics.csv, validation_disagreements.csv

Usage:
    python compare_validation.py [--csv validation_200.csv]
"""

import argparse
from math import sqrt
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
# Sampling pools after exclusions (population_counts.txt): the frame the
# 100 + 100 sample was drawn from
POOL_YES = 318_136
POOL_NO = 980_153
N_BOOT = 100_000
SEED = 2026


def wilson(k, n, z=1.96):
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centre - half, centre + half


def population_rates(ppv, npv):
    """Recall, specificity and prevalence over the sampling frame."""
    tp, fp = POOL_YES * ppv, POOL_YES * (1 - ppv)
    tn, fn = POOL_NO * npv, POOL_NO * (1 - npv)
    return tp / (tp + fn), tn / (tn + fp), (tp + fn) / (POOL_YES + POOL_NO)


def analyse(df):
    pred = df["biomistral_prediction"].str.strip().str.upper().map({"YES": True, "NO": False})
    truth = df["my_judgement"].str.strip().str.upper().map({"Y": True, "N": False})
    if pred.isna().any() or truth.isna().any():
        bad = df[pred.isna() | truth.isna()][["pmid", "biomistral_prediction", "my_judgement"]]
        raise SystemExit(f"Unrecognised values:\n{bad.to_string(index=False)}")

    tp = int((pred & truth).sum())
    fp = int((pred & ~truth).sum())
    fn = int((~pred & truth).sum())
    tn = int((~pred & ~truth).sum())
    n_yes, n_no = tp + fp, fn + tn

    ppv, npv = tp / n_yes, tn / n_no
    recall, spec, prev = population_rates(ppv, npv)

    # Parametric bootstrap: resample each stratum's correct count, recompute
    rng = np.random.default_rng(SEED)
    b_ppv = rng.binomial(n_yes, ppv, N_BOOT) / n_yes
    b_npv = rng.binomial(n_no, npv, N_BOOT) / n_no
    b_recall, b_spec, b_prev = population_rates(b_ppv, b_npv)
    ci = lambda a: tuple(np.percentile(a, [2.5, 97.5]))

    # Raw agreement and Cohen's kappa on the 200 rows (stratified sample, not the population)
    agree = (tp + tn) / len(df)
    p_yes = (n_yes / len(df)) * ((tp + fn) / len(df))
    p_no = (n_no / len(df)) * ((fp + tn) / len(df))
    kappa = (agree - (p_yes + p_no)) / (1 - (p_yes + p_no))

    metrics = [
        ("TP (BioMistral YES, judged Y)", tp, None, None),
        ("FP (BioMistral YES, judged N)", fp, None, None),
        ("FN (BioMistral NO, judged Y)", fn, None, None),
        ("TN (BioMistral NO, judged N)", tn, None, None),
        ("Precision / PPV (sample)", ppv, *wilson(tp, n_yes)),
        ("NPV (sample)", npv, *wilson(tn, n_no)),
        ("Recall / sensitivity (population-weighted)", recall, *ci(b_recall)),
        ("Specificity (population-weighted)", spec, *ci(b_spec)),
        ("Prevalence of relevant papers (population-weighted)", prev, *ci(b_prev)),
        ("Raw agreement (200-row sample, stratified)", agree, None, None),
        ("Cohen's kappa (200-row sample, stratified)", kappa, None, None),
    ]
    disagreements = df[pred != truth].assign(
        error=np.where(pred[pred != truth], "FP (BioMistral YES, judged N)", "FN (BioMistral NO, judged Y)"))
    return metrics, disagreements


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[1])
    parser.add_argument("--csv", type=Path, default=HERE / "validation_200.csv")
    args = parser.parse_args()

    df = pd.read_csv(args.csv, dtype=str, keep_default_na=False)
    metrics, disagreements = analyse(df)

    out = pd.DataFrame(metrics, columns=["metric", "value", "ci95_low", "ci95_high"])
    out.to_csv(HERE / "validation_metrics.csv", index=False)
    cols = ["pmid", "error", "biomistral_prediction", "my_judgement", "title", "journal"]
    disagreements[cols].sort_values(["error", "pmid"]).to_csv(HERE / "validation_disagreements.csv", index=False)

    for name, v, lo, hi in metrics:
        if lo is None:
            print(f"{name:55s} {v if isinstance(v, int) else f'{v:.3f}'}")
        else:
            print(f"{name:55s} {v:.3f}  (95% CI {lo:.3f}–{hi:.3f})")


if __name__ == "__main__":
    main()
