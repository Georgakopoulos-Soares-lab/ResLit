#!/usr/bin/env python3
"""Compare an annotator's mutations with ResLit's (type = mutation only).

Within each paper, a mutation is gene + change.

Gene: normalised as in gene_allele_compare.py (trailing _<n> dropped, lower
case, non-alphanumerics removed). Annotator synonyms count: "dhfr (spr1429)"
matches dhfr or spr1429, "gyrA/parC (QRDR)" matches gyrA or parC.

Change: standard tokens are read from the text.
  protein     S83L, Ser83Leu, p.Ser83Leu, Gln35*  -> S83L, Q35*
  nucleotide  C-15T, A1401G, U2500A, c.-15C>T, -15C>T, -15(CtoT) -> C-15T, A1401G, T2500A
A mutation's key is its protein change if it has one, otherwise its
nucleotide change (as for ResLit records). An annotator cell with several
changes ("Asp87Gly/Asp87Asn", "V37A, R267S") gives one mutation per change.
A cell with no standard token ("frameshift", "Asn518 deletion",
"specific change in Data set S8") is kept as one "unparsed" mutation; it can
only match the same text and is reported separately.
Duplicates within a paper (same mutation in several organisms) count once.

TP = ResLit mutation matched by an annotator mutation (same gene, same key)
FP = ResLit mutation not matched
FN = annotator mutation not matched

Usage:
    python3 scripts/mutation_compare.py --letter A
    python3 scripts/mutation_compare.py --letter B
"""

import argparse
import re
from pathlib import Path

import pandas as pd

from gene_allele_compare import DATA, FILLS, RESULTS, TIERS, joined, norm, rate, read_annotator, write_workbook

AA3 = {"Ala": "A", "Arg": "R", "Asn": "N", "Asp": "D", "Cys": "C", "Gln": "Q", "Glu": "E",
       "Gly": "G", "His": "H", "Ile": "I", "Leu": "L", "Lys": "K", "Met": "M", "Phe": "F",
       "Pro": "P", "Ser": "S", "Thr": "T", "Trp": "W", "Tyr": "Y", "Val": "V", "Ter": "*"}
AA1 = "ACDEFGHIKLMNPQRSTVWY"
RE_P3 = re.compile(r"(%s)(\d+)(%s|\*)" % ("|".join(AA3), "|".join(AA3)))
RE_P1 = re.compile(r"(?<![A-Za-z])([%s])(\d+)([%s*])(?![A-Za-z0-9])" % (AA1, AA1))
RE_N1 = re.compile(r"(?<![A-Za-z])([ACGTU])(-?\d+)([ACGTU])(?![A-Za-z0-9])")
RE_NC = re.compile(r"(?<![\w.])(?:[cgn]\.)?(-?\d+)\s*\(?([ACGTU])\s*(?:>|to)\s*([ACGTU])\)?")


def uniq(xs):
    return list(dict.fromkeys(xs))


def protein_tokens(text):
    if pd.isna(text):
        return []
    t = str(text).replace("p.", "")
    out = [AA3[a] + n + AA3.get(b, b) for a, n, b in RE_P3.findall(t)]
    out += [a + n + b for a, n, b in RE_P1.findall(t)]
    return uniq(out)


def nucleotide_tokens(text):
    if pd.isna(text):
        return []
    t = str(text).replace("−", "-")
    out = [(r + n + a) for n, r, a in RE_NC.findall(t)]
    out += [r + n + a for r, n, a in RE_N1.findall(t)]
    return uniq(x.replace("U", "T") for x in out)


def change_keys(nuc, prot):
    """(keys, parsed): protein tokens, else nucleotide tokens, else the raw text."""
    keys = protein_tokens(prot) or nucleotide_tokens(nuc)
    if keys:
        return keys, True
    raw = " ; ".join(str(x) for x in (nuc, prot) if pd.notna(x) and str(x).strip())
    return ["raw:" + norm(raw)], False


def gene_aliases(name):
    """'dhfr (spr1429)' -> {dhfr, spr1429, dhfrspr1429}; 'gyrA/parC' -> {gyra, parc, gyraparc}."""
    s = str(name).strip()
    parts = [s] + re.split(r"[()/;,]", s)
    # "inhA promoter" -> inhA, "inhA operon" -> inhA
    parts += [re.sub(r"\b(promoter|operon|region|upstream|gene)\b", "", p, flags=re.I) for p in parts]
    return {norm(p) for p in parts if norm(p)}


def first_join(s):
    return " ; ".join(uniq(s.dropna()))


def annotator_mutations(raw):
    """Annotator mutation rows -> one entry per (paper, gene, change key)."""
    ann = raw[raw["type"].str.strip().str.lower().eq("mutation")].copy()
    ann["gene"] = ann["gene"].fillna("(no gene)")
    rows = []
    for r in ann.itertuples():
        keys, parsed = change_keys(r.nucleotide_change, r.protein_change)
        for k in keys:
            rows.append({"PMID": r.PMID, "gene_norm": norm(r.gene), "key": k, "parsed": parsed,
                         "annotator_gene": r.gene, "annotator_nucleotide": r.nucleotide_change,
                         "annotator_protein": r.protein_change, "annotator_organism": r.organism,
                         "annotator_note": r.note})
    cols = ["PMID", "gene_norm", "key", "parsed", "annotator_gene", "annotator_nucleotide",
            "annotator_protein", "annotator_organism", "annotator_note"]
    hum = (pd.DataFrame(rows, columns=cols).groupby(["PMID", "gene_norm", "key"], as_index=False)
             .agg(parsed=("parsed", "first"), annotator_gene=("annotator_gene", first_join),
                  annotator_nucleotide=("annotator_nucleotide", first_join),
                  annotator_protein=("annotator_protein", first_join),
                  annotator_organism=("annotator_organism", first_join),
                  annotator_note=("annotator_note", first_join)))
    hum["gene_aliases"] = hum["annotator_gene"].map(lambda g: set().union(set(), *(gene_aliases(x) for x in g.split(" ; "))))
    return hum


def reslit_mutations(res):
    """ResLit mutation records -> one entry per record, with its gene and change key."""
    rows = []
    for r in res.itertuples():
        keys, parsed = change_keys(r.nucleotide_change, r.protein_change)
        rows.append({"PMID": r.PMID, "record_id": r.record_id, "reslit_tier": r.Tier, "reslit_gene": r.gene,
                     "reslit_nucleotide": r.nucleotide_change, "reslit_protein": r.protein_change,
                     "reslit_organism": r.organism, "gene_norm": norm(r.gene), "key": keys[0]})
    return pd.DataFrame(rows)


def mutation_match(gene_norm, key, h):
    """ResLit mutation (gene_norm, key) vs one annotator entry h."""
    return h.key == key and gene_norm in h.gene_aliases


def mutations_alike(h1, h2):
    """Two annotator entries describe the same mutation."""
    return h1.key == h2.key and bool(h1.gene_aliases & h2.gene_aliases)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--annotator", default=None, help="default: data/annotator_<letter>.xlsx")
    ap.add_argument("--letter", default="A", help="annotator letter in assigned_to (A or B)")
    ap.add_argument("--reslit", default=DATA / "reslit_records.tsv")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    args.annotator = args.annotator or DATA / f"annotator_{args.letter}.xlsx"
    out = Path(args.out or RESULTS / f"mutation_results_{args.letter}.xlsx")

    # Annotator: mutation rows, one entry per (paper, gene, change key)
    raw, papers, no_det = read_annotator(args.annotator)
    hum = annotator_mutations(raw)

    # ResLit: mutation records of this annotator's papers
    res = pd.read_csv(args.reslit, sep="\t", dtype=str)
    res = res[res["type"].eq("mutation") & res["assigned_to"].isin([args.letter, "BOTH"]) & res["PMID"].isin(papers)]
    rl = reslit_mutations(res)

    # Matching: same paper, gene among the annotator's gene aliases, same change key
    def hits(r):
        return hum[(hum.PMID == r.PMID) & (hum.key == r.key) & hum.gene_aliases.map(lambda a: r.gene_norm in a)]

    rl["hit_idx"] = [list(hits(r).index) for r in rl.itertuples()]
    rl["TP"] = rl.hit_idx.map(bool)
    matched_idx = set().union(*rl.hit_idx) if len(rl) else set()
    hum["matched"] = hum.index.isin(matched_idx)

    side_rows = []
    for r in rl.itertuples():
        h = hum.loc[r.hit_idx]
        side_rows.append({"PMID": r.PMID, "status": "match" if r.TP else "only ResLit (FP)",
                          "reslit_gene": r.reslit_gene, "reslit_nucleotide": r.reslit_nucleotide,
                          "reslit_protein": r.reslit_protein, "reslit_tier": r.reslit_tier,
                          "annotator_gene": first_join(h.annotator_gene) or None,
                          "annotator_nucleotide": first_join(h.annotator_nucleotide) or None,
                          "annotator_protein": first_join(h.annotator_protein) or None,
                          "change_key": r.key, "annotator_parsed": "",
                          "reslit_organism": r.reslit_organism,
                          "annotator_organism": first_join(h.annotator_organism) or None,
                          "annotator_note": first_join(h.annotator_note) or None})
    for h in hum[~hum.matched].itertuples():
        side_rows.append({"PMID": h.PMID, "status": "only annotator (FN)", "annotator_gene": h.annotator_gene,
                          "annotator_nucleotide": h.annotator_nucleotide, "annotator_protein": h.annotator_protein,
                          "change_key": h.key, "annotator_parsed": "yes" if h.parsed else "no (unparsed)",
                          "annotator_organism": h.annotator_organism, "annotator_note": h.annotator_note or None})
    side = pd.DataFrame(side_rows)
    side["_o"] = side.status.map(list(FILLS).index)
    side = side.sort_values(["PMID", "_o", "reslit_gene", "annotator_gene", "change_key"]).drop(columns="_o")

    # Summary
    tp, n_r = int(rl.TP.sum()), len(rl)
    tp_h, n_h = int(hum.matched.sum()), len(hum)
    parsed = hum[hum.parsed]
    prec, rec = rate("precision", "all", tp, n_r), rate("recall", "all", tp_h, n_h)
    f1 = 2 * prec["value"] * rec["value"] / (prec["value"] + rec["value"]) if tp and tp_h else 0.0
    summary = pd.DataFrame([
        prec,
        *[rate("precision", t, int(rl.loc[rl.reslit_tier == t, "TP"].sum()), int((rl.reslit_tier == t).sum()))
          for t in TIERS if (rl.reslit_tier == t).any()],
        rec,
        rate("recall", "parsed annotator mutations only", int(parsed.matched.sum()), len(parsed)),
        {"metric": "F1", "subset": "all", "value": f1},
        {"metric": "TP", "subset": "all", "value": tp},
        {"metric": "FP", "subset": "all", "value": n_r - tp},
        {"metric": "FN", "subset": "all", "value": n_h - tp_h},
        {"metric": "FN", "subset": "of which unparsed", "value": int((~hum.parsed & ~hum.matched).sum())},
        {"metric": "papers", "subset": f"annotator {args.letter}", "value": len(papers)},
        {"metric": "ResLit mutations", "subset": "all", "value": n_r},
        {"metric": "annotator mutations", "subset": "all", "value": n_h},
    ])

    # Per paper (all of the annotator's papers)
    g = side.groupby("PMID")
    label = lambda d: d.reslit_gene.fillna(d.annotator_gene) + " " + d.change_key.str.replace("raw:", "?", regex=False)
    side["_label"] = label(side)
    per_paper = pd.DataFrame({"PMID": papers}).set_index("PMID")
    per_paper["PubMed"] = "https://pubmed.ncbi.nlm.nih.gov/" + per_paper.index + "/"
    for col, st in (("TP", "match"), ("FP", "only ResLit (FP)"), ("FN", "only annotator (FN)")):
        per_paper[col] = g.apply(lambda d: (d.status == st).sum())
    per_paper[["TP", "FP", "FN"]] = per_paper[["TP", "FP", "FN"]].fillna(0).astype(int)
    per_paper["differs"] = (per_paper.FP + per_paper.FN > 0).map({True: "yes", False: ""})
    per_paper["ResLit_mutations"] = side[side.status != "only annotator (FN)"].groupby("PMID")["_label"].apply(joined)
    per_paper["annotator_mutations"] = (hum.assign(_l=hum.annotator_gene + " " + hum.key.str.replace("raw:", "?", regex=False))
                                           .groupby("PMID")["_l"].apply(joined))
    for col, st in (("matched", "match"), ("only_ResLit", "only ResLit (FP)"), ("only_annotator", "only annotator (FN)")):
        per_paper[col] = side[side.status == st].groupby("PMID")["_label"].apply(joined)
    per_paper["annotator_no_determinant_flag"] = per_paper.index.isin(no_det)
    per_paper["annotator_no_determinant_flag"] = per_paper["annotator_no_determinant_flag"].map({True: "Y", False: ""})
    per_paper = per_paper.fillna("").reset_index()
    side = side.drop(columns="_label")

    method = pd.DataFrame({"method": [
        f"Annotator {args.letter} ({Path(args.annotator).name}) vs ResLit ({Path(args.reslit).name}), type = mutation only.",
        f"Papers: the {len(papers)} papers in the annotator's file (assigned_to {args.letter} or BOTH).",
        "A mutation is gene + change, compared within each paper.",
        "Gene: trailing _<number> removed, lower case, non-alphanumerics removed; annotator synonyms in brackets or split by '/' also match.",
        "Change: protein tokens (S83L = Ser83Leu = p.Ser83Leu) if given, otherwise nucleotide tokens (C-15T = c.-15C>T; U read as T).",
        "An annotator cell with several changes gives one mutation per change; duplicates within a paper count once.",
        "Annotator changes without a standard token (frameshift, deletions, 'not specified') are 'unparsed' and count as FN.",
        "TP = ResLit mutation matched; FP = ResLit mutation not matched; FN = annotator mutation not matched.",
        "Precision = TP / ResLit mutations; recall = matched annotator mutations / annotator mutations; 95% Wilson intervals.",
    ]})

    write_workbook(out, {"summary": summary, "per_paper": per_paper, "side_by_side": side, "method": method})

    # Hand-check file: only papers with a difference. For each unmatched row,
    # the other side's mutations in the same gene are listed as candidates.
    diff = set(per_paper.loc[per_paper.differs == "yes", "PMID"])
    chk = side[side.PMID.isin(diff)].copy()
    rl_lab = rl.assign(_l=rl.reslit_gene + " " + rl.key)
    hum_lab = hum.assign(_l=hum.annotator_gene + " " + hum.key.str.replace("raw:", "?", regex=False))
    cand = []
    for r in chk.itertuples():
        if r.status == "only ResLit (FP)":
            g = norm(r.reslit_gene)
            c = hum_lab[(hum_lab.PMID == r.PMID) & hum_lab.gene_aliases.map(lambda a: g in a)]._l
        elif r.status == "only annotator (FN)":
            al = gene_aliases(r.annotator_gene)
            c = rl_lab[(rl_lab.PMID == r.PMID) & rl_lab.gene_norm.isin(al)]._l
        else:
            c = pd.Series(dtype=str)
        cand.append(" | ".join(uniq(c)))
    chk.insert(2, "other_side_same_gene", cand)
    chk["manual_decision"] = ""
    chk["comment"] = ""
    write_workbook(out.with_name(f"mutation_differences_{args.letter}.xlsx"),
                   {"per_PMID": per_paper[per_paper.PMID.isin(diff)], "side_by_side": chk, "method": method})

    pd.set_option("display.width", 200)
    print(summary.to_string(index=False, float_format=lambda x: f"{x:.3f}"))
    print(f"\n{(per_paper.differs == 'yes').sum()} of {len(papers)} papers differ")
    print(f"Written: {out}")


if __name__ == "__main__":
    main()
