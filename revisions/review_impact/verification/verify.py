#!/usr/bin/env python3
"""
Verification of three figures for the ResLit reviewer response:
  1. paper counts (retrieved / extracted / contributing records / site),
  2. how review articles were identified (extraction label vs PubMed type),
  3. the review-impact analysis under both review definitions.

Uses only existing files, with no network access and nothing written outside
this folder. The tier logic is imported unchanged from ../review_impact.py.

Usage:
    python3 verify.py
Outputs (this folder): summary.md, s1_paper_counts.csv, s2_definitions.csv,
s2_crosstab.csv, s2_spotcheck.csv, s3_impact.csv, s3_checks.csv
"""

import csv
import hashlib
import json
import random
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import review_impact as ri  # noqa: E402  (tier logic, unchanged)

SITE = HERE.parents[2]  # archive root
REPO = SITE
SUMMARIES = SITE / "llm_extractions"
PUBMED = SITE / "revisions/paper_type/pubmed_paper_types.csv"
PUBMED_CACHE = SITE / "revisions/paper_type/pubmed_cache.jsonl"
PUBMED_REPO_COPY = REPO / "pipeline/05_harmonised_pipeline/reference_data/pubmed_paper_types.csv"
DB = REPO / "website/data/reslit.db"  # built by website/scripts/seed-sqlite.mjs; not in the archive
RELEASE = REPO / "pipeline/06_final_output"
DLD_REPORT = REPO / "pipeline/03_scripts_dld/reports/REPORT_SUMMARY.md"
PIPELINE_NOTES = REPO / "pipeline/readme_pipeline.txt"
PUBMED_REVIEW_TYPES = {"Review", "Systematic Review"}  # rule in fetch_pubmed_paper_types.py
LIVE = {"genes": (1221, 291, 242, 1254), "mutations": (1798, 2231, 399, 9009)}


def md5(p):
    return hashlib.md5(Path(p).read_bytes()).hexdigest()


def pmids_of(cells):
    return {p.strip() for c in cells for p in re.split(r"[,;]", str(c)) if p.strip().isdigit()}


def rel(p):
    return str(Path(p)).replace(str(SITE) + "/", "")


# ═════════════════════════════════════════════════════════════════════ 1 ═══
def section1():
    rows = []

    def add(label, value, source, field, how):
        rows.append({"metric": label, "value": value, "source": source, "field": field, "how": how})

    # a) retrieval reports in the repo
    rep = DLD_REPORT.read_text()
    grab = lambda pat: re.search(pat, rep).group(1)
    add("1a retrieval run in repo: valid PMIDs", int(grab(r"Valid PMIDs: (\d+)")), rel(DLD_REPORT), "Corpus totals", "read")
    add("1a retrieval run in repo: verified full text", int(grab(r"Verified full-text after body validation: (\d+)")),
        rel(DLD_REPORT), "Validated text totals", "read")
    notes = PIPELINE_NOTES.read_text()
    add("1a 117,112 in pipeline notes", "117,112" if "117,112 papers total across the 6 folders" in notes else "not found",
        rel(PIPELINE_NOTES), "STEP 5 Input / Output (lines ~350-376)", "text search")

    # b) extraction summaries
    keys, status, header = [], Counter(), Counter()
    by_key = {}
    for path in sorted(SUMMARIES.glob("extraction_summary_batch[1-6].json")):
        d = json.loads(path.read_text())
        for k in ("total_papers", "success", "reviews", "irrelevant", "errors"):
            header[k] += d[k]
        for k, v in d["results"].items():
            keys.append(k)
            by_key[k] = v
            status[v.get("status")] += 1
    real = [k for k in keys if k.isdigit()]
    junk = [k for k in keys if not k.isdigit()]
    src = "paper/extraction_summary_batch1..6.json"
    add("1b result entries (all keys)", len(keys), src, "results (keys)", "count keys")
    add("1b distinct numeric PMIDs", len(set(real)), src, "results (keys)", "keys that are all digits")
    for k in junk:
        v = by_key[k]
        add(f'1b non-PMID key "{k}"', v.get("status"), src, "results[key].status, full_output.pmid",
            f"full_output.pmid = {(v.get('full_output') or {}).get('pmid')!r}")
    for s in ("success", "irrelevant", "error"):
        add(f"1b status {s} (all keys)", status.get(s, 0), src, "results[*].status", "count")
        add(f"1b status {s} (numeric PMIDs)", sum(1 for k in real if by_key[k].get("status") == s), src, "results[*].status", "count")
    for k in ("total_papers", "success", "reviews", "irrelevant", "errors"):
        add(f"1b header field {k} (sum of batches)", header[k], src, k, "sum")

    # c) release
    g = pd.read_csv(RELEASE / ri.FILES["reslit_genes"], dtype=str, keep_default_na=False)
    m = pd.read_csv(RELEASE / ri.FILES["reslit_muts"], dtype=str, keep_default_na=False)
    pg, pm_ = pmids_of(g.PMID), pmids_of(m.PMID)
    add("1c distinct PMIDs, gene file", len(pg), rel(RELEASE / ri.FILES["reslit_genes"]), "PMID", "split on , ; numeric only")
    add("1c distinct PMIDs, mutation file", len(pm_), rel(RELEASE / ri.FILES["reslit_muts"]), "PMID", "same")
    add("1c distinct PMIDs, union", len(pg | pm_), "both files", "PMID", "union")
    add("1c union PMIDs not in extraction summaries", len((pg | pm_) - set(real)), "", "", "set difference")

    # d) site database
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    q = lambda sql: con.execute(sql).fetchone()[0]
    add("1d site DB: distinct ResLit PMIDs, amr_genes", q("select count(distinct paper_pmid) from amr_genes where source_database='Reslit'"),
        rel(DB), "amr_genes.paper_pmid", "source_database = 'Reslit'")
    add("1d site DB: distinct ResLit PMIDs, amr_mutations", q("select count(distinct paper_pmid) from amr_mutations where source_database='Reslit'"),
        rel(DB), "amr_mutations.paper_pmid", "source_database = 'Reslit'")
    add("1d site DB: distinct ResLit PMIDs, union", q("""select count(*) from (select paper_pmid from amr_genes where source_database='Reslit'
        union select paper_pmid from amr_mutations where source_database='Reslit')"""), rel(DB), "paper_pmid", "union")
    add("1d site DB: papers table rows (all sources)", q("select count(*) from papers"), rel(DB), "papers.pmid",
        "raw PMID cells, incl. reference-database and multi-PMID cells")
    all_numeric = set()
    for t in ("amr_genes", "amr_mutations"):
        all_numeric |= pmids_of(r[0] for r in con.execute(f"select paper_pmid from {t} where paper_pmid is not null"))
    add("1d site 'Publications' figure (all sources, numeric)", len(all_numeric), rel(DB),
        "paper_pmid (genes + mutations)", "getDistinctPaperCount() rule in lib/actions/browse.ts")
    return pd.DataFrame(rows), set(real), by_key, pg | pm_


# ═════════════════════════════════════════════════════════════════════ 2 ═══
def section2(extracted, by_key, contributing):
    pub = pd.read_csv(PUBMED, dtype=str, keep_default_na=False)
    types = {r.pmid: r.publication_types.split("|") if r.publication_types else [] for r in pub.itertuples()}
    found = {r.pmid: r.paper_type != "" for r in pub.itertuples()}
    pubmed_review = {p for p, t in types.items() if PUBMED_REVIEW_TYPES & set(t)}
    model_review = {k for k in extracted if (by_key[k].get("full_output") or {}).get("paper_type") == "review"}

    rows = []

    def add(label, value, note=""):
        rows.append({"item": label, "value": value, "note": note})

    add("PubMed mapping file", rel(PUBMED), f"md5 {md5(PUBMED)}; identical to repo copy: {md5(PUBMED) == md5(PUBMED_REPO_COPY)}")
    add("PubMed rows", len(pub), "all numeric PMIDs in the 4 release CSVs (ResLit + reference)")
    add("PubMed fetched", "2026-10-20, file times 15:04 (+03:00)", f"{rel(PUBMED_CACHE)} / {rel(PUBMED)} mtime")
    add("PubMed PMIDs not found", sum(1 for v in found.values() if not v),
        ", ".join(sorted(p for p, v in found.items() if not v)) + " -> blank Paper_Type, treated as not review")
    add("PubMed PMIDs found with no publication type", sum(1 for p, t in types.items() if found[p] and not t))
    c = contributing
    for t in ("Review", "Systematic Review", "Meta-Analysis", "Scoping Review"):
        add(f"contributing PMIDs with PubMed type '{t}'", sum(1 for p in c if t in types.get(p, [])))
    add("contributing PMIDs: Meta-Analysis or Scoping Review without Review/Systematic Review",
        sum(1 for p in c if {"Meta-Analysis", "Scoping Review"} & set(types.get(p, [])) and not PUBMED_REVIEW_TYPES & set(types.get(p, []))),
        "not counted as review under the rule used")

    # 2c: download / database column equals the mapping under add_paper_type's rule
    def expected(cell):
        ts = [("Review" if PUBMED_REVIEW_TYPES & set(types.get(p, [])) else ("Research Article" if found.get(p) else ""))
              for p in [x.strip() for x in re.split(r"[,;]", cell or "") if x.strip().isdigit()]]
        uniq = [t for i, t in enumerate(ts) if t and t not in ts[:i]]
        return ", ".join(uniq)

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    checked = mismatched = 0
    for table in ("amr_genes", "amr_mutations"):
        for pmid, ptype in con.execute(f"select paper_pmid, paper_type from {table}"):
            checked += 1
            mismatched += (ptype or "") != expected(pmid)
    add("DB rows checked: paper_type vs PubMed mapping (amr_genes + amr_mutations)", checked, f"mismatches: {mismatched}")

    cache = {json.loads(l)["pmid"]: json.loads(l) for l in PUBMED_CACHE.read_text().splitlines()}
    rnd = random.Random(2026)
    sample = sorted(rnd.sample(sorted(pubmed_review & c, key=int), 10), key=int)
    spot = []
    for p in sample:
        db_types = {t for (t,) in con.execute(
            "select paper_type from amr_genes where paper_pmid=? union select paper_type from amr_mutations where paper_pmid=?", (p, p))}
        spot.append({"pmid": p, "pubmed_publication_types": "|".join(cache[p]["publication_types"]),
                     "site_paper_type": "|".join(sorted(t or "" for t in db_types)),
                     "model_paper_type": (by_key[p].get("full_output") or {}).get("paper_type"),
                     "title": cache[p]["title"], "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{p}/"})

    # 2d: cross-tabulation over contributing PMIDs
    cross = Counter(("model review" if p in model_review else "model not review",
                     "PubMed review" if p in pubmed_review else "PubMed not review") for p in c)
    ct = pd.DataFrame([{"": a, "PubMed review": cross[(a, "PubMed review")], "PubMed not review": cross[(a, "PubMed not review")]}
                       for a in ("model review", "model not review")])
    probe = "24281307"
    probe_row = {"pmid": probe, "contributes_records": probe in c,
                 "model_paper_type": (by_key.get(probe, {}).get("full_output") or {}).get("paper_type"),
                 "model_status": by_key.get(probe, {}).get("status"),
                 "pubmed_publication_types": "|".join(types.get(probe, [])),
                 "pubmed_review": probe in pubmed_review, "title": cache.get(probe, {}).get("title")}
    return (pd.DataFrame(rows), ct, pd.DataFrame(spot), probe_row,
            model_review, pubmed_review, cross, mismatched)


# ═════════════════════════════════════════════════════════════════════ 3 ═══
def impact(reviews, seed, current, extracted_reviews_n, contributing):
    """Same steps as review_impact.py section 4, for one review set."""
    out, checks = {}, []
    no_rev = dict(seed)
    for k in ("reslit_genes", "reslit_muts"):
        no_rev[k] = seed[k][~seed[k]["PMID"].map(lambda c: bool(ri.numeric_pmids(c) & reviews))]
    without = {kind: ri.build(kind, no_rev) for kind in ri.KINDS}

    rel_files = {k: pd.read_csv(RELEASE / ri.FILES[k], dtype=str, keep_default_na=False) for k in ("reslit_genes", "reslit_muts")}
    rg = rel_files["reslit_genes"][rel_files["reslit_genes"].PMID.map(lambda c: bool(ri.numeric_pmids(c) & reviews))]
    rm = rel_files["reslit_muts"][rel_files["reslit_muts"].PMID.map(lambda c: bool(ri.numeric_pmids(c) & reviews))]
    out["review PMIDs among extracted papers"] = extracted_reviews_n
    out["review PMIDs among papers contributing records"] = f"{len(reviews & contributing):,} of {len(contributing):,}"
    out["gene rows / unique genes from reviews"] = f"{len(rg):,} / {len({ri.normalize_gene_name(x) for x in rg.Gene}):,}"
    out["mutation rows / unique mutations from reviews"] = (
        f"{len(rm):,} / {len({ri.mutation_group_key(r.Gene, r.Protein_Change, r.Nucleotide_Change, i) for i, r in rm.iterrows()}):,}")

    for kind, (tiers_fn, sets_fn) in ri.KINDS.items():
        tw, two = tiers_fn(current[kind], 3), tiers_fn(without[kind], 3)
        moves = Counter((tw[k], two.get(k, "removed")) for k in tw)
        cw, cwo = ri.tier_counts(tw), ri.tier_counts(two)
        rs, fs = sets_fn(current[kind])
        rs2, fs2 = sets_fn(without[kind])
        lost = (rs & fs) - rs2
        to_est = sum(1 for k in lost if two.get(k) == "Established")
        removed = {t: moves[(t, "removed")] for t in ri.TIERS if moves[(t, "removed")]}
        P = f"{kind}: "
        out[P + "tiers C/E/S/Ca WITH reviews"] = f"{'/'.join(f'{x:,}' for x in cw)} ({sum(cw):,})"
        out[P + "tiers C/E/S/Ca WITHOUT reviews"] = f"{'/'.join(f'{x:,}' for x in cwo)} ({sum(cwo):,})"
        out[P + "entries that disappear (tier with reviews)"] = (
            f"{sum(removed.values()):,} (" + ", ".join(f"{t} {n}" for t, n in removed.items()) + ")" if removed else "0")
        out[P + "Supported -> Candidate"] = moves[("Supported", "Candidate")]
        out[P + "Confirmed -> Established"] = moves[("Confirmed", "Established")]
        out[P + "recovered only via reviews (-> Established / stay Confirmed)"] = f"{len(lost)} ({to_est} / {len(lost) - to_est})"
        out[P + "recovery WITH reviews"] = f"{len(rs & fs):,}/{len(fs):,} ({100 * len(rs & fs) / len(fs):.1f}%)"
        out[P + "recovery WITHOUT reviews"] = f"{len(rs2 & fs2):,}/{len(fs2):,} ({100 * len(rs2 & fs2) / len(fs2):.1f}%)"
        for t in ri.THRESHOLDS:
            out[P + f"Supported at >={t} with / without"] = (
                f"{ri.tier_counts(tiers_fn(current[kind], t))[2]:,} / {ri.tier_counts(tiers_fn(without[kind], t))[2]:,}")

        # additivity: each tier without = entries moving into it; total without = total with - removed
        checks.append((kind, "WITH reviews equals live site", cw == LIVE[kind]))
        inflow = Counter(b for (a, b), n in moves.items() for _ in range(n) if b != "removed")
        checks.append((kind, "each WITHOUT tier = sum of entries moving into it", tuple(inflow[t] for t in ri.TIERS) == cwo))
        checks.append((kind, "WITHOUT total = WITH total - disappeared", sum(cwo) == sum(cw) - sum(removed.values())))
        checks.append((kind, "recovery loss = recovered-only-via-reviews entries", len(rs & fs) - len(rs2 & fs2) == len(lost)))
    return out, checks


def section3(model_review, pubmed_review, extracted_n_model, contributing):
    seed = {k: ri.read(REPO / ri.SEED / f) for k, f in ri.FILES.items()}
    current = {kind: ri.build(kind, seed) for kind in ri.KINDS}
    pm_out, pm_checks = impact(pubmed_review, seed, current, "n/a (PubMed types fetched for release PMIDs only)", contributing)
    md_out, md_checks = impact(model_review, seed, current, f"{extracted_n_model:,}", contributing)
    table = pd.DataFrame({"metric": list(pm_out), "PubMed publication type": list(pm_out.values()),
                          "extraction label (paper_type == review)": [md_out[k] for k in pm_out]})
    with_same = all(pm_out[k] == md_out[k] for k in pm_out if "WITH reviews" in k and "WITHOUT" not in k)
    checks = [("both", '"with reviews" identical in both runs', with_same)]
    checks += [(k, f"PubMed run: {c}", ok) for k, c, ok in pm_checks] + [(k, f"extraction-label run: {c}", ok) for k, c, ok in md_checks]
    return table, pd.DataFrame(checks, columns=["type", "check", "pass"])


def md_table(df):
    cols = list(df.columns)
    lines = ["| " + " | ".join(map(str, cols)) + " |", "|" + "---|" * len(cols)]
    lines += ["| " + " | ".join(str(v).replace("|", "\\|") for v in r) + " |" for r in df.itertuples(index=False)]
    return "\n".join(lines)


def main():
    s1, extracted, by_key, contributing = section1()
    s2, ct, spot, probe, model_review, pubmed_review, cross, mism = section2(extracted, by_key, contributing)
    s3, checks = section3(model_review, pubmed_review, len(model_review), contributing)
    for name, df in [("s1_paper_counts", s1), ("s2_definitions", s2), ("s2_crosstab", ct),
                     ("s2_spotcheck", spot), ("s3_impact", s3), ("s3_checks", checks)]:
        df.to_csv(HERE / f"{name}.csv", index=False, quoting=csv.QUOTE_MINIMAL)
    (HERE / "probe_24281307.json").write_text(json.dumps(probe, indent=1, ensure_ascii=False))
    print(md_table(s1)); print(); print(md_table(s2)); print(); print(md_table(ct)); print(); print(md_table(spot.drop(columns=["pubmed_url"])))
    print(); print(json.dumps(probe, ensure_ascii=False)); print(); print(md_table(s3)); print(); print(md_table(checks))
    if not checks["pass"].all() or mism:
        sys.exit("SOME CHECKS FAILED")


if __name__ == "__main__":
    main()
