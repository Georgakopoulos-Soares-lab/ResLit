#!/usr/bin/env python3
"""
Impact of review articles on the released ResLit catalogues.

1. Review PMIDs: papers whose extraction result has full_output.paper_type ==
   "review" in the six extraction_summary_batch*.json files.
2. Rows, genes and mutations that come from review PMIDs in the release
   (pipeline/06_final_output).
3. The site's tier logic (site/lib/actions/browse.ts), recomputed from the
   four seed CSVs, checked against the live numbers. Also reproduces the
   pre-fix Table 1 figures (exact gene names; mutation CSVs before commit
   59a16159), read from git history.
4. The same logic with every ResLit row from a review PMID removed: tier
   transitions, entries that disappear, recovery, and Supported counts at
   thresholds 2, 3 and 5.

Read-only: writes only into this folder (review_pmids.txt, review_impact.csv,
tier_transitions.csv).

Usage:
    python review_impact.py [--repo /path/to/ResLit/repo]
"""

import argparse
import io
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
DEFAULT_REPO = HERE.parents[1]  # archive root
SUMMARIES = HERE.parents[1] / "llm_extractions"  # extraction_summary_batch1..6.json
SEED = Path("website/scripts/seed-data")
FILES = {
    "reslit_genes": "Full_list_genes_Reslit_harmonized_antib_bact.csv",
    "ref_genes": "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv",
    "reslit_muts": "Full_list_mutations_Reslit_antib_bact.csv",
    "ref_muts": "Full_list_mutations_otherDatabases_clean.csv",
}
PRE_FIX_COMMIT = "2f897f82"  # last commit before the mutation-data fix (59a16159)
RESLIT = "Reslit"
TIERS = ["Confirmed", "Established", "Supported", "Candidate"]
SITE_THRESHOLD = 3
THRESHOLDS = [2, 3, 5]

EXPECTED_CURRENT = {"genes": (1221, 291, 242, 1254), "mutations": (1798, 2231, 399, 9009)}
EXPECTED_PRE_FIX = {"genes": (1179, 401, 269, 1271), "mutations": (1738, 2355, 402, 9098),
                    "gene_recovery": (1006, 1580), "mutation_recovery": (1439, 4093)}


# ── same rule as normalizeGeneName in site/lib/gene-name.ts ──────────────────
def normalize_gene_name(name):
    name = name.strip().lower()
    for dp in ["''", "″", "′′", "’’"]:
        name = name.replace(dp, "\x00")
    for ch in "′ʹ‘’`´'\"":
        name = name.replace(ch, "")
    return name.replace("\x00", "''")


def exact_gene_name(name):  # pre-fix site behaviour
    return name.strip()


def numeric_pmids(cell):
    return {p.strip() for p in re.split(r"[,;]", str(cell)) if p.strip().isdigit()}


def read(source):
    df = pd.read_csv(source, dtype=str, keep_default_na=False)
    return df.apply(lambda c: c.str.strip())  # the seed parses with trim: true


def git_csv(repo, commit, rel):
    # the two files as they were at that commit, exported from the git history into data/
    return read(HERE / "data" / f"pre_fix_{commit}" / Path(rel).name)


def tier(dbs, pmids, threshold):
    """browse.ts decision rule. No release row is curator-verified."""
    if len(dbs) >= 2:
        return "Confirmed"
    if dbs and RESLIT not in dbs:
        return "Established"
    if RESLIT in dbs and len(pmids) >= threshold:
        return "Supported"
    return "Candidate"


# ── genes: one entry per gene key (_fetchValidationTiers) ────────────────────
def gene_entries(reslit, ref, key):
    info = defaultdict(lambda: (set(), set()))
    for _, r in reslit.iterrows():
        if r["Gene"]:
            dbs, pmids = info[key(r["Gene"])]
            dbs.add(RESLIT)
            pmids |= numeric_pmids(r["PMID"])
    for _, r in ref.iterrows():
        if r["Gene"]:
            info[key(r["Gene"])][0].add(r["Database"])
    return dict(info)


def gene_tiers(entries, threshold):
    return {k: tier(dbs, pmids, threshold) for k, (dbs, pmids) in entries.items()}


def gene_sets(entries):
    reslit = {k for k, (dbs, _) in entries.items() if RESLIT in dbs}
    ref = {k for k, (dbs, _) in entries.items() if dbs - {RESLIT}}
    return reslit, ref


# ── mutations: two-key buckets per row, best tier per display group ──────────
def mutation_group_key(gene, protein, nuc, row_id):
    if protein:
        return f"{gene}::p::{protein}"
    if nuc:
        return f"{gene}::n::{nuc}"
    return f"{gene}::id::{row_id}"


def mutation_entries(reslit, ref):
    rows = []
    for df, fixed in ((ref, None), (reslit, RESLIT)):
        for i, r in df.iterrows():
            rows.append((r["Gene"], r["Protein_Change"], r["Nucleotide_Change"],
                         fixed or r["Database"], r["PMID"], f"{'r' if fixed else 'o'}{i}"))

    def bucket_keys(gene, protein, nuc, row_id):
        keys = ([f"{gene}::p::{protein}"] if protein else []) + ([f"{gene}::n::{nuc}"] if nuc else [])
        return keys or [f"{gene}::id::{row_id}"]

    buckets = defaultdict(lambda: (set(), set()))
    for gene, protein, nuc, db, pmid, row_id in rows:
        if not gene:
            continue
        for k in bucket_keys(gene, protein, nuc, row_id):
            buckets[k][0].add(db)
            if db == RESLIT:
                buckets[k][1].update(numeric_pmids(pmid))

    groups = defaultdict(list)  # group key -> per-row (dbs, pmids)
    group_dbs = defaultdict(set)  # group key -> sources of its own rows (for recovery)
    for gene, protein, nuc, db, pmid, row_id in rows:
        dbs, pmids = set(), set()
        for k in bucket_keys(gene, protein, nuc, row_id):
            if k in buckets:
                dbs |= buckets[k][0]
                pmids |= buckets[k][1]
        g = mutation_group_key(gene, protein, nuc, row_id)
        groups[g].append((dbs, pmids))
        group_dbs[g].add(db)
    return dict(groups), dict(group_dbs)


def mutation_tiers(entries, threshold):
    groups, _ = entries
    rank = {t: i for i, t in enumerate(TIERS)}
    return {g: min((tier(d, p, threshold) for d, p in members), key=rank.get) for g, members in groups.items()}


def mutation_sets(entries):
    _, group_dbs = entries
    reslit = {g for g, dbs in group_dbs.items() if RESLIT in dbs}
    ref = {g for g, dbs in group_dbs.items() if dbs - {RESLIT}}
    return reslit, ref


KINDS = {
    "genes": (gene_tiers, gene_sets),
    "mutations": (mutation_tiers, mutation_sets),
}


def build(kind, data, gene_key=normalize_gene_name):
    if kind == "genes":
        return gene_entries(data["reslit_genes"], data["ref_genes"], gene_key)
    return mutation_entries(data["reslit_muts"], data["ref_muts"])


def tier_counts(tiers):
    c = Counter(tiers.values())
    return tuple(c[t] for t in TIERS)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    args = parser.parse_args()
    repo = args.repo

    # ── 1. review PMIDs ──────────────────────────────────────────────────────
    total, reviews, other_review_labels = 0, set(), Counter()
    for path in sorted(SUMMARIES.glob("extraction_summary_batch[1-6].json")):
        for pmid, res in json.loads(path.read_text())["results"].items():
            total += 1
            paper_type = (res.get("full_output") or {}).get("paper_type")
            if paper_type == "review":
                reviews.add(pmid)
            elif paper_type and "review" in str(paper_type).lower():
                other_review_labels[paper_type] += 1
    (HERE / "review_pmids.txt").write_text("".join(f"{p}\n" for p in sorted(reviews, key=int)))

    rows = []  # (section, metric, with reviews, without reviews)

    def add(section, metric, with_r, without_r=""):
        rows.append((section, metric, with_r, without_r))

    add("1 Review PMIDs", "papers in extraction summaries (batch 1-6)", total)
    add("1 Review PMIDs", 'review PMIDs (paper_type == "review")', len(reviews))
    for label, n in other_review_labels.items():
        add("1 Review PMIDs", f'not counted: paper_type "{label}"', n)

    # ── 2. review contribution to the release ────────────────────────────────
    rel = {k: read(repo / "pipeline/06_final_output" / FILES[k]) for k in ("reslit_genes", "reslit_muts")}
    is_rev = {k: df["PMID"].map(lambda c: bool(numeric_pmids(c) & reviews)) for k, df in rel.items()}
    g, m = rel["reslit_genes"], rel["reslit_muts"]
    gr, mr = g[is_rev["reslit_genes"]], m[is_rev["reslit_muts"]]
    mut_key = lambda df: {mutation_group_key(r.Gene, r.Protein_Change, r.Nucleotide_Change, i) for i, r in df.iterrows()}
    rev_gene_pmids = set().union(*map(numeric_pmids, gr["PMID"])) & reviews
    rev_mut_pmids = set().union(*map(numeric_pmids, mr["PMID"])) & reviews
    add("2 Release rows from reviews", "gene rows (of all)", f"{len(gr):,} of {len(g):,}")
    add("2 Release rows from reviews", "unique genes in those rows (normalised name)",
        f"{len({normalize_gene_name(x) for x in gr.Gene}):,} of {len({normalize_gene_name(x) for x in g.Gene}):,}")
    add("2 Release rows from reviews", "mutation rows (of all)", f"{len(mr):,} of {len(m):,}")
    add("2 Release rows from reviews", "unique mutations in those rows (gene + change)", f"{len(mut_key(mr)):,} of {len(mut_key(m)):,}")
    add("2 Release rows from reviews", "review PMIDs with >=1 gene / mutation / any row",
        f"{len(rev_gene_pmids):,} / {len(rev_mut_pmids):,} / {len(rev_gene_pmids | rev_mut_pmids):,}")

    # ── 3. tier logic checks ─────────────────────────────────────────────────
    seed = {k: read(repo / SEED / f) for k, f in FILES.items()}
    current = {kind: build(kind, seed) for kind in KINDS}
    checks_ok = True
    for kind, (tiers_fn, _) in KINDS.items():
        got = tier_counts(tiers_fn(current[kind], SITE_THRESHOLD))
        ok = got == EXPECTED_CURRENT[kind]
        checks_ok &= ok
        add("3 Tier logic check", f"{kind}: current release, C/E/S/Ca (live site)",
            f"{'/'.join(map(str, got))} ({sum(got):,}) {'PASS' if ok else 'FAIL, expected ' + str(EXPECTED_CURRENT[kind])}")

    pre = dict(seed)
    pre["reslit_muts"] = git_csv(repo, PRE_FIX_COMMIT, f"{SEED}/{FILES['reslit_muts']}")
    pre["ref_muts"] = git_csv(repo, PRE_FIX_COMMIT, f"{SEED}/{FILES['ref_muts']}")
    pre_genes = build("genes", pre, gene_key=exact_gene_name)
    pre_muts = build("mutations", pre)
    for label, kind, entries, exp_tiers, exp_rec in [
        ("genes", "genes", pre_genes, EXPECTED_PRE_FIX["genes"], EXPECTED_PRE_FIX["gene_recovery"]),
        ("mutations", "mutations", pre_muts, EXPECTED_PRE_FIX["mutations"], EXPECTED_PRE_FIX["mutation_recovery"]),
    ]:
        tiers_fn, sets_fn = KINDS[kind]
        got = tier_counts(tiers_fn(entries, SITE_THRESHOLD))
        rs, fs = sets_fn(entries)
        rec = (len(rs & fs), len(fs))
        ok = got == exp_tiers and rec == exp_rec
        checks_ok &= ok
        add("3 Tier logic check", f"{label}: pre-fix figures (old Table 1), C/E/S/Ca; recovery",
            f"{'/'.join(map(str, got))}; {rec[0]:,}/{rec[1]:,} {'PASS' if ok else 'FAIL'}")
    if not checks_ok:
        print(pd.DataFrame(rows, columns=["section", "metric", "with reviews", "without reviews"]).to_string(index=False))
        sys.exit("Tier logic does not reproduce the expected numbers; stopping.")

    # ── 4. remove ResLit rows from review PMIDs ──────────────────────────────
    no_rev = dict(seed)
    for k in ("reslit_genes", "reslit_muts"):
        keep = ~seed[k]["PMID"].map(lambda c: bool(numeric_pmids(c) & reviews))
        no_rev[k] = seed[k][keep]
    without = {kind: build(kind, no_rev) for kind in KINDS}

    transitions = []
    for kind, (tiers_fn, sets_fn) in KINDS.items():
        t_with = tiers_fn(current[kind], SITE_THRESHOLD)
        t_without = tiers_fn(without[kind], SITE_THRESHOLD)
        moves = Counter((t_with[k], t_without.get(k, "removed")) for k in t_with)
        for (a, b), n in sorted(moves.items(), key=lambda kv: (TIERS.index(kv[0][0]), kv[0][1])):
            transitions.append({"type": kind, "tier_with_reviews": a, "tier_without_reviews": b, "n": n})

        cw, cwo = tier_counts(t_with), tier_counts(t_without)
        sec = f"4 Without reviews: {kind}"
        add(sec, "tiers C/E/S/Ca (total)", f"{'/'.join(f'{x:,}' for x in cw)} ({sum(cw):,})",
            f"{'/'.join(f'{x:,}' for x in cwo)} ({sum(cwo):,})")
        add(sec, "a) Supported -> Candidate", "", moves[("Supported", "Candidate")])
        lit_only = sum(1 for k in t_with if t_with[k] in ("Supported", "Candidate"))
        gone = moves[("Supported", "removed")] + moves[("Candidate", "removed")]
        add(sec, "b) ResLit-only entries supported only by reviews (disappear)", "",
            f"{gone:,} of {lit_only:,} ({moves[('Supported', 'removed')]} Supported, {moves[('Candidate', 'removed')]} Candidate)")
        rs, fs = sets_fn(current[kind])
        rs2, fs2 = sets_fn(without[kind])
        # Recovered (ResLit + >=1 reference) entries whose ResLit support is only reviews.
        # Those in one reference database drop to Established; those in >=2 stay
        # Confirmed (cross-database) but are no longer recovered by ResLit.
        lost = (rs & fs) - rs2
        to_est = sum(1 for k in lost if t_without.get(k) == "Established")
        add(sec, "c) Confirmed entries recovered by ResLit only via reviews", "",
            f"{len(lost):,} ({to_est} -> Established; {len(lost) - to_est} stay Confirmed via >=2 reference DBs)")
        other_conf = {b: n for (a, b), n in moves.items() if a == "Confirmed" and b not in ("Confirmed", "Established")}
        if other_conf:
            add(sec, "   other Confirmed changes", "", ", ".join(f"-> {b}: {n}" for b, n in other_conf.items()))
        add(sec, "c) recovered by ResLit / in >=1 reference",
            f"{len(rs & fs):,}/{len(fs):,} ({100 * len(rs & fs) / len(fs):.1f}%)",
            f"{len(rs2 & fs2):,}/{len(fs2):,} ({100 * len(rs2 & fs2) / len(fs2):.1f}%)")
        for t in THRESHOLDS:
            s_with = tier_counts(tiers_fn(current[kind], t))[2]
            s_without = tier_counts(tiers_fn(without[kind], t))[2]
            add(sec, f"d) Supported at >={t}{' (threshold used)' if t == SITE_THRESHOLD else ''}", f"{s_with:,}", f"{s_without:,}")

    table = pd.DataFrame(rows, columns=["section", "metric", "with reviews", "without reviews"])
    table.to_csv(HERE / "review_impact.csv", index=False)
    pd.DataFrame(transitions).to_csv(HERE / "tier_transitions.csv", index=False)
    pd.set_option("display.max_colwidth", 80, "display.width", 250)
    print(table.to_string(index=False))
    print()
    print(pd.DataFrame(transitions).to_string(index=False))


if __name__ == "__main__":
    main()
