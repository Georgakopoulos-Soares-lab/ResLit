#!/usr/bin/env python3
"""Compare ResLit with the reference databases (CARD, ResFinder, NCBI Reference
Gene Catalog / AMRFinder) on 100 papers that both cite.

1. Take the PMIDs cited by the reference databases that also have ResLit records.
2. Draw 100 of them at random (seed 2026).
3. Within each paper, compare the reference genes/mutations with ResLit's.

Genes:     names lower-cased, non-alphanumerics removed, "bla" added to bare
           beta-lactamase names (CTX-M-15 -> blactxm15), CARD organism prefix
           removed (Saur_FosB -> fosb).
           allele match = same allele; gene match = same gene, other allele;
           missed = gene not in ResLit for that paper.
Mutations: gene + change (protein change if given, else nucleotide change;
           Ser83Leu = S83L, p. prefix ignored).
           match = same gene and change; same gene = ResLit has the gene with
           other changes; missed = gene not in ResLit for that paper.

Tiers: each entry gets its Validation Tier from the site exports
(revisions/human_audit/reslit_*_all_2026-10-14-1.csv), matched on PMID + the
same key. The site assigns tiers per gene name: Confirmed (in >= 2 sources,
which can be two reference databases, or curator-verified), Established (one
reference database only), Supported (ResLit only, >= 3 papers), Candidate
(ResLit only, 1-2 papers).

Papers with no ResLit record: all reference-cited papers are checked against
the raw LLM extraction batches (site/paper/extraction_summary_batch1-6.json,
= the papers with full text) and the ResLit final tables, per database.

Usage: python3 benchmark.py
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

SEED, N = 2026, 100
HERE = Path(__file__).resolve().parent
SITE = HERE.parents[1]
REF_GENES = SITE / "pipeline/05_harmonised_pipeline/other_databases/genes/Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv"
REF_MUTS = SITE / "pipeline/05_harmonised_pipeline/other_databases/mutations/Full_list_mutations_otherDatabases_clean.csv"
RES_GENES = SITE / "pipeline/06_final_output/Full_list_genes_Reslit_harmonized_antib_bact.csv"
RES_MUTS = SITE / "pipeline/06_final_output/Full_list_mutations_Reslit_antib_bact.csv"
# papers with full text = papers in ResLit's raw LLM extraction batches
BATCHES = [SITE / f"llm_extractions/extraction_summary_batch{i}.json" for i in range(1, 7)]
DB = {"Card Database": "CARD", "CARD": "CARD", "ResFinder Database": "ResFinder", "ResFinder": "ResFinder",
      "Reference Gene Catalog": "NCBI RGC", "AMRFinder": "NCBI RGC"}
# validation tiers come from the site exports (the final pipeline tables have none)
EXPORTS = SITE / "revisions/human_audit/selection"
EXPORT_GENES = EXPORTS / "reslit_genes_all_2026-10-14-1.csv"
EXPORT_MUTS = EXPORTS / "reslit_mutations_all_2026-10-14-1.csv"
TIER_ORDER = ["Candidate", "Supported", "Established", "Confirmed"]

BLA = ("CTX-M", "TEM", "SHV", "OXA", "NDM", "KPC", "VIM", "IMP", "GES", "CMY", "DHA", "FOX",
       "MOX", "ACT", "MIR", "ACC", "ADC", "PDC", "PER", "VEB", "BEL", "GIM", "SPM", "AIM",
       "IMI", "SME", "LAP", "LEN", "OKP", "OXY", "PSE", "CARB")
BLA_RE = re.compile(r"^(?!bla)(" + "|".join(re.escape(b) for b in BLA) + r")(?=[-_\d\s]|$)", re.I)
AA3 = {"Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C", "Gln": "Q", "Glu": "E",
       "Gly": "G", "His": "H", "Ile": "I", "Leu": "L", "Lys": "K", "Met": "M", "Phe": "F",
       "Pro": "P", "Ser": "S", "Thr": "T", "Trp": "W", "Tyr": "Y", "Val": "V", "Ter": "*"}


def gnorm(name):
    # CARD organism prefix: Saur_FosB -> FosB, Paer_catB6 -> catB6
    s = re.sub(r"^[A-Z][a-z]{3}_", "", str(name).strip())
    s = "bla" + s if BLA_RE.match(s) else s
    return re.sub(r"[^0-9a-z]", "", s.lower())


def cnorm(change):
    s = str(change).strip().replace("p.", "").replace("c.", "")
    for k, v in AA3.items():
        s = s.replace(k, v)
    return re.sub(r"[^0-9A-Za-z*-]", "", s).upper()


def pmids(s):
    return re.findall(r"\b\d{4,9}\b", str(s))


def load(path, kind, source):
    d = pd.read_csv(path, dtype=str).fillna("")
    d["PMID"] = d.PMID.map(pmids)
    d = d.explode("PMID").dropna(subset=["PMID"])
    out = pd.DataFrame({"PMID": d.PMID, "source": source, "database": d.Database, "type": kind,
                        "gene": d.Gene, "organism": d.Organism, "resistance": d.Resistance})
    if kind == "gene":
        out["allele"] = [a or g for a, g in zip(d.Allele, d.Gene)]
        out["change"] = ""
        out["key"] = out.allele.map(gnorm)
    else:
        out["allele"] = ""
        out["change"] = [p or n for p, n in zip(d.Protein_Change, d.Nucleotide_Change)]
        out["key"] = out.gene.map(gnorm) + "|" + out.change.map(cnorm)
    out["gene_key"] = out.gene.map(gnorm)
    return out


def tiers(papers):
    """Validation tier per (PMID, type, key, side) from the site exports."""
    sys.path.insert(0, str(EXPORTS))
    from reslit_audit_select import read_table   # the human audit's CSV reader (fixes quoting)
    rows = []
    for path, t in ((EXPORT_GENES, "gene"), (EXPORT_MUTS, "mutation")):
        for r in read_table(str(path)).to_dict("records"):
            if t == "gene":
                key = gnorm(r["Allele"] or r["Gene Name"])
            else:
                key = gnorm(r["Gene Name"]) + "|" + cnorm(r["Protein Change"] or r["Nucleotide Change"])
            side = "ResLit" if r["Source Database"] == "Reslit" else "reference"
            rows += [(p, t, key, side, r["Validation Tier"]) for p in pmids(r["PMID"]) if p in papers]
    d = pd.DataFrame(rows, columns=["PMID", "type", "key", "side", "tier"])
    return d.groupby(["PMID", "type", "key", "side"]).tier.agg(
        lambda s: " / ".join(sorted(set(s), key=lambda x: TIER_ORDER.index(x) if x in TIER_ORDER else 9)))


def coverage(ref, res):
    """Per database and type: cited papers, papers with full text, and how many of those
    have / have no ResLit record. A paper cited by several databases counts for each."""
    status = {}
    for path in BATCHES:
        for p, r in json.load(open(path))["results"].items():
            status[p] = r.get("status")
    has = set(res.PMID)
    rows = []
    for db in ["CARD", "ResFinder", "NCBI RGC", "all"]:
        for t in ["gene", "mutation", "any"]:
            d = ref if db == "all" else ref[ref.database.map(DB) == db]
            d = d if t == "any" else d[d.type == t]
            ft = set(d.PMID) & set(status)
            none = ft - has
            rows.append({"database": db, "type": t, "cited papers": d.PMID.nunique(), "with full text": len(ft),
                         "with ResLit record": len(ft & has), "no ResLit record": len(none),
                         "% no record": round(100 * len(none) / len(ft), 1) if ft else None,
                         "no record: LLM extracted, nothing kept": sum(status[p] == "success" for p in none),
                         "no record: LLM judged irrelevant": sum(status[p] == "irrelevant" for p in none)})
    return pd.DataFrame(rows)


def join(s):
    return " | ".join(dict.fromkeys(x for x in s if x))


def main():
    ref = pd.concat([load(REF_GENES, "gene", "reference"), load(REF_MUTS, "mutation", "reference")])
    res = pd.concat([load(RES_GENES, "gene", "ResLit"), load(RES_MUTS, "mutation", "ResLit")])

    n_ref_papers = ref.PMID.nunique()
    cov = coverage(ref, res)
    both = sorted(set(ref.PMID) & set(res.PMID))
    papers = pd.Series(both).sample(N, random_state=SEED).sort_values().tolist()
    ref, res = ref[ref.PMID.isin(papers)], res[res.PMID.isin(papers)]

    # one entry per paper x determinant (databases merged)
    agg = dict(databases=("database", join), gene=("gene", "first"), allele=("allele", "first"),
               change=("change", "first"), gene_key=("gene_key", "first"),
               organism=("organism", join), resistance=("resistance", join))
    R = ref.groupby(["PMID", "type", "key"], as_index=False).agg(**agg)
    L = res.groupby(["PMID", "type", "key"], as_index=False).agg(**agg)

    res_keys = set(zip(L.PMID, L.type, L.key))
    res_genes = set(zip(L.PMID, L.type, L.gene_key))
    ref_genes = set(zip(R.PMID, R.type, R.gene_key))

    def status(r):
        if (r.PMID, r.type, r.key) in res_keys:
            return "match" if r.type == "mutation" else "allele match"
        if (r.PMID, r.type, r.gene_key) in res_genes:
            return "same gene, other change" if r.type == "mutation" else "gene match, other allele"
        return "missed by ResLit"

    R["status"] = R.apply(status, axis=1)
    L["status"] = ["in reference" if (p, t, k) in set(zip(R.PMID, R.type, R.key)) else
                   "same gene in reference" if (p, t, g) in ref_genes else "only ResLit"
                   for p, t, k, g in zip(L.PMID, L.type, L.key, L.gene_key)]
    tier = tiers(set(papers))
    R["tier"] = [tier.get((p, t, k, "reference"), "(not in site export)") for p, t, k in zip(R.PMID, R.type, R.key)]
    L["tier"] = [tier.get((p, t, k, "ResLit"), "(not in site export)") for p, t, k in zip(L.PMID, L.type, L.key)]
    rl = L.groupby(["PMID", "type", "gene_key"]).apply(lambda d: join(d.allele if d.name[1] == "gene" else d.change))
    R["reslit_same_gene"] = [rl.get((p, t, g), "") for p, t, g in zip(R.PMID, R.type, R.gene_key)]

    # summary
    rows = []
    for t in ("gene", "mutation"):
        r, l = R[R.type == t], L[L.type == t]
        full = "allele match" if t == "gene" else "match"
        rows += [
            {"type": t, "measure": "papers with reference entries", "value": r.PMID.nunique()},
            {"type": t, "measure": "reference entries", "value": len(r)},
            {"type": t, "measure": "ResLit entries", "value": len(l)},
            {"type": t, "measure": f"reference entries found by ResLit ({full})", "value": (r.status == full).sum()},
            {"type": t, "measure": "reference entries found at gene level (any allele/change)", "value": (r.status != "missed by ResLit").sum()},
            {"type": t, "measure": f"recall, {full}", "value": round((r.status == full).mean(), 3)},
            {"type": t, "measure": "recall, gene level", "value": round((r.status != "missed by ResLit").mean(), 3)},
            {"type": t, "measure": "papers where ResLit found every reference entry",
             "value": int(r.groupby("PMID").status.apply(lambda s: (s == full).all()).sum())},
            {"type": t, "measure": "ResLit entries not in the reference (same gene or other genes)",
             "value": (l.status != "in reference").sum()},
        ]
    summary = pd.DataFrame(rows)

    # by validation tier: reference entries x match status, ResLit entries x presence in the reference
    found = {"allele match": "found (same allele / change)", "match": "found (same allele / change)",
             "gene match, other allele": "same gene, other allele / change",
             "same gene, other change": "same gene, other allele / change", "missed by ResLit": "missed"}

    def tier_table(X, status, cols, pct):
        c = (pd.crosstab([X.type, X.tier], status).reindex(columns=cols, fill_value=0).reset_index())
        c["total"] = c[cols].sum(axis=1)
        c[pct] = (c[cols[0]] / c.total).round(3)
        return c

    by_tier_ref = tier_table(R, R.status.map(found), list(dict.fromkeys(found.values())), "share found")
    by_tier_res = tier_table(L, L.status, ["in reference", "same gene in reference", "only ResLit"],
                             "share in reference")

    # recall per citing database (an entry cited by several databases counts for each)
    rows = []
    for db in ["CARD", "ResFinder", "NCBI RGC", "all"]:
        for t in ("gene", "mutation"):
            x = R[R.type == t]
            if db != "all":
                x = x[x.databases.map(lambda s: db in {DB[d] for d in s.split(" | ")})]
            exact = int(x.status.isin(["allele match", "match"]).sum())
            gene = int((x.status != "missed by ResLit").sum())
            rows.append({"database": db, "type": t, "papers": x.PMID.nunique(), "entries": len(x),
                         "found exact": exact, "recall exact": round(exact / len(x), 3) if len(x) else None,
                         "found gene level": gene, "recall gene level": round(gene / len(x), 3) if len(x) else None})
    by_db = pd.DataFrame(rows)

    # per paper
    pp = pd.DataFrame({"PMID": papers})
    pp["PubMed"] = "https://pubmed.ncbi.nlm.nih.gov/" + pp.PMID + "/"
    for t in ("gene", "mutation"):
        r, l = R[R.type == t], L[L.type == t]
        lab = (lambda d: d.allele) if t == "gene" else (lambda d: d.gene + " " + d.change)
        pp[f"reference_{t}s"] = pp.PMID.map(r.groupby("PMID").apply(lambda d: join(lab(d)))).fillna("")
        pp[f"reslit_{t}s"] = pp.PMID.map(l.groupby("PMID").apply(lambda d: join(lab(d)))).fillna("")
        pp[f"{t}_ref_n"] = pp.PMID.map(r.groupby("PMID").size()).fillna(0).astype(int)
        pp[f"{t}_found"] = pp.PMID.map(r[r.status.isin(["allele match", "match"])].groupby("PMID").size()).fillna(0).astype(int)
        pp[f"{t}_reslit_n"] = pp.PMID.map(l.groupby("PMID").size()).fillna(0).astype(int)

    side = pd.concat([
        R.assign(side="reference")[["PMID", "type", "side", "status", "tier", "databases", "gene", "allele", "change",
                                    "reslit_same_gene", "organism", "resistance"]],
        L[L.status != "in reference"].assign(side="ResLit")[["PMID", "type", "side", "status", "tier", "databases",
                                                             "gene", "allele", "change", "organism", "resistance"]],
    ]).sort_values(["PMID", "type", "side", "gene"])

    out = HERE / "reference_vs_reslit_100papers.xlsx"
    with pd.ExcelWriter(out) as xw:
        summary.to_excel(xw, "summary", index=False)
        by_db.to_excel(xw, "recall_by_database", index=False)
        cov.to_excel(xw, "no_record_papers", index=False)
        pd.DataFrame({"": ["Reference entries by tier (Confirmed = gene in >= 2 sources or curator-verified; Established = one reference database only)"]}).to_excel(xw, "by_tier", index=False, header=False)
        by_tier_ref.to_excel(xw, "by_tier", index=False, startrow=1)
        pd.DataFrame({"": ["ResLit entries by tier (Confirmed = gene also in a reference database; Supported / Candidate = ResLit only, >= 3 / 1-2 papers)"]}).to_excel(xw, "by_tier", index=False, header=False, startrow=len(by_tier_ref) + 4)
        by_tier_res.to_excel(xw, "by_tier", index=False, startrow=len(by_tier_ref) + 5)
        pp.to_excel(xw, "per_paper", index=False)
        side.to_excel(xw, "side_by_side", index=False)
        pd.DataFrame({"method": __doc__.strip().splitlines()}).to_excel(xw, "method", index=False)
    pd.DataFrame({"PMID": papers}).to_csv(HERE / "selected_papers.txt", index=False, header=False)

    print(f"papers cited by the reference databases: {n_ref_papers}")
    print(f"of which with ResLit records: {len(both)}; drawn: {N}")
    print("\nfull-text papers with / without a ResLit record:")
    print(cov.to_string(index=False))
    print("\nrecall by database (100-paper sample):")
    print(by_db.to_string(index=False))
    print(summary.to_string(index=False))
    print(by_tier_ref.to_string(index=False))
    print(by_tier_res.to_string(index=False))
    print(f"Written: {out}")


if __name__ == "__main__":
    main()
