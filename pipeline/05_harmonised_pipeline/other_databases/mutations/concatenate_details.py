"""
Python rewrite of concatenate_details.R.

Combines point-mutation tables from ResFinder, AMRFinderPlus and CARD into a
single, uniformly-formatted table (one mutation per row) and tags each row
with which database it came from (Database) and whether the mutation is at
the amino-acid or nucleotide level (TypeGene = AA / NUC), following the same
convention used in resfinder_pointMutations_expanded.xlsx.
"""

import re
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent

RESFINDER_FILE = HERE / "resfinder_pointMutations_expanded.xlsx"
AMRFINDER_FILE = HERE / "ReferenceGeneCatalog_PointMutations.csv"
CARD_FILE = HERE.parent.parent / "reference_data" / "card" / "snps.txt"
# Optional: abbreviation -> full antibiotic name lookup used by CARD's
# "<species>_<gene>_<drugAbbrev>" short names. Skipped silently if missing.
# (Previously pointed at a legacy sibling project directory outside this repo
# entirely -- fixed to use the copy bundled here.)
SHORTNAME_ANTIBIOTICS_FILE = HERE.parent.parent / "reference_data" / "card" / "shortname_antibiotics.tsv"
OUTPUT_FILE = HERE / "full_list_mutations.csv"

# letters - position(can be negative) - letters, e.g. "S81L", "G-42A",
# "Q163Ter", "A47fs", "VAVC60del", "a965g" (nucleotide), "R85RARAR"
MUTATION_RE = re.compile(r"^([A-Za-z]+)(-?\d+)([A-Za-z]+)$")
# fallback for malformed/compound tokens such as "T314AfsTer16"
MUTATION_FALLBACK_RE = re.compile(r"^([A-Za-z]+)(-?\d+)(.*)$")


def _slug(s: str) -> str:
    """Same normalisation as qwen3_mutations_to_csv.py: lowercase, strip
    everything but letters/digits, so e.g. 'gyrA_1', '#embB', '16S-rrsB',
    'GyrA' all collapse to a single comparable key across databases."""
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def parse_mutation(token):
    """Split a mutation token (e.g. 'S81L') into (ref_codon, codon_pos, res_codon)."""
    token = token.strip()
    match = MUTATION_RE.match(token) or MUTATION_FALLBACK_RE.match(token)
    if not match:
        return None, None, token
    ref_codon, codon_pos, res_codon = match.groups()
    return ref_codon, int(codon_pos), res_codon


def is_nucleotide_token(token):
    """CARD encodes nucleotide mutations in lowercase (e.g. 'a965g')."""
    return bool(re.match(r"^[acgt]-?\d+[acgt]$", token.strip()))


def load_resfinder():
    df = pd.read_excel(RESFINDER_FILE)
    gene = df["#Gene_accession"].astype(str).str.split("_").str[0]
    out = pd.DataFrame(
        {
            "Database": "ResFinder",
            "TypeGene": df["TypeGene"],
            "Organism": df["organism"],
            "Gene": gene,
            "Gene_accession": df["#Gene_accession"],
            "Mutation": df["Mutation ID"],
            "Codon_pos": df["Codon_pos"],
            "Ref_codon": df["Ref_codon"],
            "Res_codon": df["Res_codon"],
            "Class": df["Class"],
            "Resistance": df["Phenotype"],
            "PMID": df["PMID"],
            "Mechanism": df["Mechanism of resistance"],
            "Notes": df["Notes"],
        }
    )
    return out


def load_amrfinder():
    df = pd.read_csv(AMRFINDER_FILE)
    gene = df["allele"].str.split("_").str[0]
    mutation = df["allele"].str.split("_", n=1).str[1]

    parsed = mutation.apply(parse_mutation)
    ref_codon = parsed.apply(lambda x: x[0])
    codon_pos = parsed.apply(lambda x: x[1])
    res_codon = parsed.apply(lambda x: x[2])

    is_rrna = df["product_name"].str.contains("ribosomal RNA", case=False, na=False)
    is_promoter_pos = codon_pos.apply(lambda p: p is not None and p < 0)
    type_gene = (is_rrna | is_promoter_pos).map({True: "NUC", False: "AA"})

    accession = df["genbank_nucleotide_accession"].fillna(df["genbank_protein_accession"])

    out = pd.DataFrame(
        {
            "Database": "AMRFinder",
            "TypeGene": type_gene,
            "Organism": pd.NA,
            "Gene": gene,
            "Gene_accession": accession,
            "Mutation": mutation,
            "Codon_pos": codon_pos,
            "Ref_codon": ref_codon,
            "Res_codon": res_codon,
            "Class": df["class"],
            "Resistance": df["subclass"],
            "PMID": df["pubmed_reference"],
            "Mechanism": df["product_name"],
            "Notes": df["gene_family"],
        }
    )
    return out


def explode_card_mutations(mutations):
    """'G82T,G86T' -> ['G82T', 'G86T']; co-dependent entries use '+' between
    loci and numeric locus ids mixed in with commas, e.g.
    '45612,D91N+45613,R484K' -> ['D91N', 'R484K'] (locus ids are dropped)."""
    tokens = []
    for part in str(mutations).split("+"):
        for token in part.split(","):
            token = token.strip()
            if token and not token.isdigit():
                tokens.append(token)
    return tokens


def load_card():
    df = pd.read_csv(CARD_FILE, sep="\t")

    short_names = pd.DataFrame()
    if SHORTNAME_ANTIBIOTICS_FILE.exists():
        short_names = pd.read_csv(SHORTNAME_ANTIBIOTICS_FILE, sep="\t")
        short_names = short_names.set_index("AAC Abbreviation")["Molecule"]

    def species_from_name(name):
        words = str(name).split(" ")[:2]
        if len(words) < 2 or any("na" == w.lower() for w in words):
            return None
        return " ".join(words)

    def gene_and_drug(short_name):
        parts = str(short_name).split("_")
        if len(parts) == 3:
            return parts[1], parts[2]
        if len(parts) == 2:
            return parts[1], None
        return parts[0], None

    rows = []
    for _, row in df.iterrows():
        for token in explode_card_mutations(row["Mutations"]):
            ref_codon, codon_pos, res_codon = parse_mutation(token)
            type_gene = "NUC" if row["Model Type"] == "rRNA gene variant model" else "AA"
            gene, drug_abbrev = gene_and_drug(row["CARD Short Name"])
            resistance = drug_abbrev
            if drug_abbrev is not None and drug_abbrev in short_names.index:
                resistance = short_names.loc[drug_abbrev]

            rows.append(
                {
                    "Database": "CARD",
                    "TypeGene": type_gene,
                    "Organism": species_from_name(row["Name"]),
                    "Gene": gene,
                    "Gene_accession": f"CARD:{row['Accession']}",
                    "Mutation": token,
                    "Codon_pos": codon_pos,
                    "Ref_codon": ref_codon,
                    "Res_codon": res_codon,
                    "Class": None,
                    "Resistance": resistance,
                    "PMID": row["citation"],
                    "Mechanism": row["Parameter Type"],
                    "Notes": row["Name"],
                }
            )
    return pd.DataFrame(rows)


# Some source PMID cells were corrupted by Excel auto-numifying a
# comma-separated pair, e.g. "24366731,2436673" -> "24366731.2436673".
MERGED_PMID_RE = re.compile(r"^(\d{5,})\.(\d{5,})$")


def split_pmids(value):
    """Break a (possibly multi-PMID) cell into one PMID per row.
    Handles comma- and semicolon-separated lists, e.g.
    '11266291,Unpublished,8384814,16713726' or '23561273;22479378',
    and recovers Excel-mangled pairs like '24366731.2436673'."""
    if pd.isna(value):
        return value
    raw = str(value).strip()
    if not raw:
        return float("nan")
    tokens = []
    for part in re.split(r"[;,]", raw):
        part = part.strip()
        if not part:
            continue
        merged = MERGED_PMID_RE.match(part)
        tokens.extend(merged.groups() if merged else [part])
    return tokens if tokens else float("nan")


def make_change(row):
    """Compact 'A70T'-style notation built from Ref_codon/Codon_pos/Res_codon."""
    ref, pos, res = row["Ref_codon"], row["Codon_pos"], row["Res_codon"]
    if pd.isna(ref) or pd.isna(pos) or pd.isna(res):
        return pd.NA
    pos = int(pos) if float(pos).is_integer() else pos
    return f"{ref}{pos}{res}"


def main():
    resfinder = load_resfinder()
    amrfinder = load_amrfinder()
    card = load_card()

    full = pd.concat([resfinder, card, amrfinder], ignore_index=True)
    full["Gene_normalized"] = full["Gene"].apply(_slug)
    full["Change"] = full.apply(make_change, axis=1)

    # One PMID per row, so each row matches a single reference.
    full["PMID"] = full["PMID"].apply(split_pmids)
    full = full.explode("PMID", ignore_index=True)
    full = full.rename(columns={"PMID": "paper_pmid"})
    full["paper_pmid"] = full["paper_pmid"].apply(
        lambda v: str(v).strip() if pd.notna(v) else v
    )
    # Placeholders filled in by enrich_database_metadata.py
    full["paper_title"] = ""
    full["publication_year"] = ""

    full.to_csv(OUTPUT_FILE, index=False)

    print(f"ResFinder rows:        {len(resfinder)}")
    print(f"CARD rows:             {len(card)}")
    print(f"AMRFinder rows:        {len(amrfinder)}")
    print(f"Total rows (exploded): {len(full)}")
    print(full["TypeGene"].value_counts())
    print(f"Saved to {OUTPUT_FILE}")
    print(
        "\nNext: enrich with paper titles/years, e.g.\n"
        f"  python3 ../../shared_scripts/enrich_database_metadata.py {OUTPUT_FILE.name} "
        f"{OUTPUT_FILE.stem}_enriched.csv --email you@example.com"
    )


if __name__ == "__main__":
    main()
