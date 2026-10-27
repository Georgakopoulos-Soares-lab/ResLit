#!/usr/bin/env python3
"""
Sensitivity of the ResLit "Supported" tier to its minimum-publication threshold.

Literature-only determinants are genes/mutations that ResLit reports but that
are absent from CARD, ResFinder and NCBI RGC. The site (site/lib/actions/browse.ts)
calls such an entry "Supported" when it has >= 3 distinct supporting ResLit
publications, and "Candidate" otherwise. This script recomputes the tiers with
the site's exact logic, then varies the threshold (1, 2, 3, 4, 5, 10).

Read-only: it only reads the release CSVs and writes into this folder.

Usage:
    python sensitivity_supported_threshold.py [--repo /path/to/ResLit/repo]
"""

import argparse
import hashlib
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker
import pandas as pd

HERE = Path(__file__).resolve().parent
DEFAULT_REPO = HERE.parents[1]  # archive root
SEED_DATA = Path("site/scripts/seed-data")
INPUTS = {
    "ResLit genes": SEED_DATA / "Full_list_genes_Reslit_harmonized_antib_bact.csv",
    "Reference genes": SEED_DATA / "Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv",
    "ResLit mutations": SEED_DATA / "Full_list_mutations_Reslit_antib_bact.csv",
    "Reference mutations": SEED_DATA / "Full_list_mutations_otherDatabases_clean.csv",
}

THRESHOLDS = [1, 2, 3, 4, 5, 10]
SITE_THRESHOLD = 3
RESLIT = "Reslit"
TIERS = ["Confirmed", "Established", "Supported", "Candidate"]
DIST_BINS = [("1", 1, 1), ("2", 2, 2), ("3", 3, 3), ("4", 4, 4), ("5–9", 5, 9), ("≥10", 10, None)]

EXPECTED = {
    "genes": {"literature_only": 1496, "Supported": 242,
              "tiers": {"Confirmed": 1221, "Established": 291, "Supported": 242, "Candidate": 1254}, "total": 3008},
    "mutations": {"literature_only": 9408, "Supported": 399,
                  "tiers": {"Confirmed": 1798, "Established": 2231, "Supported": 399, "Candidate": 9009}, "total": 13437},
}

# Site plot colours (validated categorical slots 1-2, light surface)
COLORS = {"genes": "#2a78d6", "mutations": "#eb6834"}
TEXT_PRIMARY, TEXT_SECONDARY, GRID = "#0b0b0b", "#52514e", "#e4e3df"


# ── same rule as normalizeGeneName in site/lib/gene-name.ts ──────────────────
_DOUBLE_PRIMES = ["''", "″", "′′", "’’"]
_DOUBLE_PRIME_PLACEHOLDER = "\x00"
_PRIME_CHARS = "′ʹ‘’`´'\""


def normalize_gene_name(name):
    name = str(name).strip().lower()
    for dp in _DOUBLE_PRIMES:
        name = name.replace(dp, _DOUBLE_PRIME_PLACEHOLDER)
    for ch in _PRIME_CHARS:
        name = name.replace(ch, "")
    return name.replace(_DOUBLE_PRIME_PLACEHOLDER, "''")


def numeric_pmids(cell):
    """Distinct numeric PMIDs in one cell: split on , and ; and drop "-", "Unpublished", etc."""
    return {p.strip() for p in re.split(r"[,;]", str(cell)) if p.strip().isdigit()}


def read_csv(path):
    # The seed parses with trim: true, so every field is whitespace-trimmed
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    return df.apply(lambda col: col.str.strip())


def md5(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def tier(databases, reslit_pmids, threshold):
    """Site decision rule (browse.ts). No CSV row is curator-verified, so hasCurated is always false."""
    has_reslit = RESLIT in databases
    if len(databases) >= 2:
        return "Confirmed"
    if databases and not has_reslit:
        return "Established"
    if has_reslit and len(reslit_pmids) >= threshold:
        return "Supported"
    return "Candidate"


# ── genes: one entry per normalised gene name (_fetchValidationTiers) ────────
def gene_entries(reslit, reference):
    info = defaultdict(lambda: {"databases": set(), "pmids": set()})
    for df, source in ((reslit, None), (reference, "Database")):
        for _, r in df.iterrows():
            if not r["Gene"]:
                continue
            e = info[normalize_gene_name(r["Gene"])]
            db = r[source] if source else RESLIT
            e["databases"].add(db)
            if db == RESLIT:
                e["pmids"] |= numeric_pmids(r["PMID"])
    # One (databases, pmids) per entry; publications = distinct ResLit PMIDs
    return [(e["databases"], e["pmids"]) for e in info.values()]


def gene_tiers(entries, threshold):
    return [tier(dbs, pmids, threshold) for dbs, pmids in entries]


# ── mutations: two-key bucket merge per row, then best tier per group ────────
def mutation_rows(reslit, reference):
    rows = []
    for df, source in ((reference, "Database"), (reslit, None)):
        for i, r in df.iterrows():
            rows.append({
                "gene": r["Gene"], "protein": r["Protein_Change"], "nuc": r["Nucleotide_Change"],
                "db": r[source] if source else RESLIT, "pmid": r["PMID"],
                "id": f"{'o' if source else 'r'}{i}",
            })
    return rows


def mutation_entries(rows):
    """For each display group, the per-row (databases, reslit_pmids) that decide its best tier.

    Exactly browse.ts: each row feeds both its gene::p::protein and gene::n::nuc
    buckets; a row's tier uses the union of those buckets; groups use the
    protein-priority key (mutationGroupKey) and take the best member tier.
    """
    buckets = defaultdict(lambda: {"databases": set(), "pmids": set()})

    def keys(r):
        k = []
        if r["protein"]:
            k.append(f"{r['gene']}::p::{r['protein']}")
        if r["nuc"]:
            k.append(f"{r['gene']}::n::{r['nuc']}")
        return k or [f"{r['gene']}::id::{r['id']}"]

    for r in rows:
        if not r["gene"]:
            continue
        for k in keys(r):
            b = buckets[k]
            b["databases"].add(r["db"])
            if r["db"] == RESLIT:
                b["pmids"] |= numeric_pmids(r["pmid"])

    groups = defaultdict(list)
    for r in rows:
        dbs, pmids = set(), set()
        for k in keys(r):
            if k in buckets:
                dbs |= buckets[k]["databases"]
                pmids |= buckets[k]["pmids"]
        group_key = (f"{r['gene']}::p::{r['protein']}" if r["protein"]
                     else f"{r['gene']}::n::{r['nuc']}" if r["nuc"] else f"{r['gene']}::id::{r['id']}")
        groups[group_key].append((dbs, pmids))
    return list(groups.values())


def mutation_tiers(groups, threshold):
    rank = {t: i for i, t in enumerate(TIERS)}
    return [min((tier(dbs, pmids, threshold) for dbs, pmids in members), key=rank.get) for members in groups]


def gene_publications(entries):
    """Distinct ResLit publications for each literature-only gene."""
    return [len(pmids) for dbs, pmids in entries if dbs == {RESLIT}]


def mutation_publications(groups):
    """For each literature-only mutation, the largest per-row publication count in its group.

    A group is Supported at threshold t iff some member row has >= t merged
    publications, so this is exactly the number that the threshold is compared with.
    """
    return [max(len(pmids) for _, pmids in members)
            for members in groups if all(dbs == {RESLIT} for dbs, _ in members)]


def count_tiers(tiers):
    return {t: tiers.count(t) for t in TIERS}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[1])
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO, help="ResLit repository root")
    args = parser.parse_args()

    paths = {name: args.repo / rel for name, rel in INPUTS.items()}
    data = {name: read_csv(p) for name, p in paths.items()}

    genes = gene_entries(data["ResLit genes"], data["Reference genes"])
    mutations = mutation_entries(mutation_rows(data["ResLit mutations"], data["Reference mutations"]))
    kinds = {
        "genes": (lambda t: gene_tiers(genes, t), gene_publications(genes)),
        "mutations": (lambda t: mutation_tiers(mutations, t), mutation_publications(mutations)),
    }

    # ── sanity checks against the published site numbers ─────────────────────
    checks, failed = [], False
    for kind, (tiers_at, pubs) in kinds.items():
        site = count_tiers(tiers_at(SITE_THRESHOLD))
        exp = EXPECTED[kind]
        for label, got, want in [
            ("literature-only total", len(pubs), exp["literature_only"]),
            (f"Supported at ≥{SITE_THRESHOLD}", site["Supported"], exp["Supported"]),
            ("all tiers (C/E/S/Ca)", tuple(site[t] for t in TIERS), tuple(exp["tiers"][t] for t in TIERS)),
            ("total entries", sum(site.values()), exp["total"]),
        ]:
            ok = got == want
            failed |= not ok
            checks.append((kind, label, got, want, ok))
    for kind, label, got, want, ok in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] {kind:9s} {label:22s} got {got}  expected {want}")
    if failed:
        sys.exit("Sanity checks failed — no outputs written.")

    # ── threshold table ──────────────────────────────────────────────────────
    rows = []
    for t in THRESHOLDS:
        row = {"threshold": t, "site_threshold": t == SITE_THRESHOLD}
        for kind, (tiers_at, pubs) in kinds.items():
            n = sum(p >= t for p in pubs)
            counts = count_tiers(tiers_at(t))
            assert counts["Supported"] == n and counts["Supported"] + counts["Candidate"] == len(pubs)
            row[f"{kind}_literature_only"] = len(pubs)
            row[f"{kind}_supported_n"] = n
            row[f"{kind}_supported_pct"] = round(100 * n / len(pubs), 1)
            row[f"{kind}_candidate_n"] = counts["Candidate"]
        rows.append(row)
    table = pd.DataFrame(rows)
    table.to_csv(HERE / "supported_threshold_sensitivity.csv", index=False)

    # ── publications per literature-only entry ───────────────────────────────
    dist_rows = []
    for kind, (_, pubs) in kinds.items():
        s = pd.Series(pubs)
        for label, lo, hi in DIST_BINS:
            n = int(((s >= lo) & (s <= hi if hi else True)).sum())
            dist_rows.append({"entry_type": kind, "publications": label, "n": n,
                              "pct": round(100 * n / len(s), 1)})
        dist_rows.append({"entry_type": kind, "publications": "median", "n": float(s.median()), "pct": None})
        dist_rows.append({"entry_type": kind, "publications": "max", "n": int(s.max()), "pct": None})
    # object dtype keeps counts as integers next to the (possibly fractional) median
    dist = pd.DataFrame(dist_rows, dtype=object)
    dist.to_csv(HERE / "publications_per_entry_distribution.csv", index=False)

    write_markdown_table(table, kinds)
    plot(table)
    write_readme(paths, checks, table, dist)
    print(table.to_string(index=False))
    print(dist.to_string(index=False))


def fmt(n):
    return f"{n:,}"


def write_markdown_table(table, kinds):
    n_genes, n_muts = (len(kinds[k][1]) for k in ("genes", "mutations"))
    lines = [
        "**Supplementary Table SX. Sensitivity of the Supported tier to the minimum number of supporting publications.**",
        "",
        f"Literature-only determinants are those reported by ResLit but absent from CARD, ResFinder and NCBI RGC "
        f"({fmt(n_genes)} genes, {fmt(n_muts)} mutations). Each is Supported if it is reported in at least the "
        f"threshold number of distinct ResLit publications, and Candidate otherwise; percentages are of all "
        f"literature-only entries. Confirmed and Established counts do not depend on the threshold.",
        "",
        "| Threshold | Genes Supported (n, %) | Genes Candidate | Mutations Supported (n, %) | Mutations Candidate |",
        "|---|---|---|---|---|",
    ]
    for _, r in table.iterrows():
        label = f"≥{r.threshold}" + (" (threshold used)" if r.site_threshold else "")
        cells = [
            f"**{label}**" if r.site_threshold else label,
            f"{fmt(r.genes_supported_n)} ({r.genes_supported_pct:.1f}%)",
            fmt(r.genes_candidate_n),
            f"{fmt(r.mutations_supported_n)} ({r.mutations_supported_pct:.1f}%)",
            fmt(r.mutations_candidate_n),
        ]
        if r.site_threshold:
            cells = [cells[0]] + [f"**{c}**" for c in cells[1:]]
        lines.append("| " + " | ".join(cells) + " |")
    (HERE / "supplementary_table_threshold.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def plot(table):
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": TEXT_SECONDARY,
                         "axes.labelcolor": TEXT_PRIMARY, "xtick.color": TEXT_SECONDARY,
                         "ytick.color": TEXT_SECONDARY})
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.2))
    x = range(len(table))
    labels = [f"≥{t}" for t in table.threshold]
    site_i = int(table.index[table.site_threshold][0])
    for ax, kind, title in zip(axes, ("genes", "mutations"), ("Genes", "Mutations")):
        n = table[f"{kind}_supported_n"]
        total = int(table[f"{kind}_literature_only"].iloc[0])
        bars = ax.bar(x, n, width=0.6, color=COLORS[kind], zorder=2)
        # The threshold used is marked by an outline and a bold tick label, not a
        # line, so nothing crosses the value labels
        bars[site_i].set_edgecolor(TEXT_PRIMARY)
        bars[site_i].set_linewidth(1.2)
        ymax = n.max() * 1.18
        for i, (v, pct) in enumerate(zip(n, table[f"{kind}_supported_pct"])):
            ax.text(i, v + ymax * 0.015, f"{v:,}\n{pct:.1f}%", ha="center", va="bottom", fontsize=7,
                    color=TEXT_PRIMARY, linespacing=1.1, fontweight="bold" if i == site_i else "normal")
        ax.set_ylim(0, ymax)
        ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
        ax.set_xticks(list(x), [f"{l}\n(used)" if i == site_i else l for i, l in enumerate(labels)])
        ax.get_xticklabels()[site_i].set_fontweight("bold")
        ax.get_xticklabels()[site_i].set_color(TEXT_PRIMARY)
        ax.set_xlabel("Minimum distinct ResLit publications")
        ax.set_title(f"{title} (n = {total:,} literature-only)", fontsize=9, color=TEXT_PRIMARY, loc="left")
        ax.yaxis.grid(True, color=GRID, linewidth=0.6, zorder=0)
        ax.spines[["top", "right"]].set_visible(False)
        ax.tick_params(length=0)
    axes[0].set_ylabel("Supported entries")
    fig.tight_layout()
    fig.savefig(HERE / "figure_threshold_sensitivity.png", dpi=300)
    fig.savefig(HERE / "figure_threshold_sensitivity.pdf", metadata={"CreationDate": None})
    plt.close(fig)


def write_readme(paths, checks, table, dist):
    md5_lines = "\n".join(f"| {name} | `{os.path.relpath(p, DEFAULT_REPO)}` | `{md5(p)}` |" for name, p in paths.items())
    check_lines = "\n".join(f"| {k} | {label} | {got} | {want} | {'PASS' if ok else 'FAIL'} |"
                            for k, label, got, want, ok in checks)
    text = f"""# Supported-tier threshold sensitivity

Answers the reviewer comment on the ≥3-publication threshold for the Supported tier.

## What was computed
- **Literature-only determinants**: genes and mutations that ResLit reports but that are absent from CARD,
  ResFinder and NCBI RGC (these are the Supported and Candidate tiers).
- **Tiers** reproduce the site's logic in `site/lib/actions/browse.ts` exactly:
  - *Genes*: one entry per normalised gene name (the `normalizeGeneName` rule in `site/lib/gene-name.ts`).
    Confirmed = in ≥2 sources; Established = reference databases only; Supported = ResLit only with
    ≥ threshold distinct publications; otherwise Candidate.
  - *Mutations*: each row feeds both its `gene::p::protein` and `gene::n::nucleotide` buckets, and a row's tier
    uses the union of those buckets. Entries are grouped by the protein-priority key (`mutationGroupKey`) and take
    the best tier of their rows, as in the mutation comparison notebook.
- **Publications** are distinct numeric PMIDs, with multi-PMID cells split on `,` and `;` and non-numeric values
  ("-", "Unpublished") ignored. Every ResLit PMID cell in the current data is a single numeric PMID, so this
  gives the same counts as the site, which counts raw PMID strings.
- For mutations, an entry's publication count is the largest count among its rows. That is the number the
  threshold is compared with: an entry is Supported if any of its rows reaches the threshold.
- Curator verification also makes an entry Confirmed on the site; no row in these release files is curated,
  so it plays no part here.
- Thresholds 1, 2, 3, 4, 5 and 10 change only the Supported/Candidate split; Confirmed and Established are fixed.

## Inputs (current release, as seeded into production)
| Input | Path | md5 |
|---|---|---|
{md5_lines}

## Sanity checks (all must pass, otherwise no outputs are written)
| Entries | Check | Got | Expected | Result |
|---|---|---|---|---|
{check_lines}

## Outputs
- `supported_threshold_sensitivity.csv`: Supported n and %, and Candidate n, for each threshold.
- `publications_per_entry_distribution.csv`: publications per literature-only entry (1, 2, 3, 4, 5–9, ≥10; median; max).
- `supplementary_table_threshold.md`: ready-to-paste Supplementary table; the ≥3 row is the threshold used.
- `figure_threshold_sensitivity.pdf` / `.png` (300 dpi): Supported counts by threshold, genes and mutations as two panels.

## Rerun
```
python3 sensitivity_supported_threshold.py [--repo /path/to/ResLit/repo]
```
Needs pandas and matplotlib. It reads only the four input CSVs and writes only into this folder.
"""
    (HERE / "README.md").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
