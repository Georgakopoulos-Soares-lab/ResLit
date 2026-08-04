#!/usr/bin/env python3

"""
Extraction Summary JSON to CSV Converter

Reads extraction_summary JSON file, extracts all data for each PMID,
and creates a CSV file with one row per gene.

Usage:
    python3 qwen3_to_csv.py extraction_summary.json [output.csv]

Gene-name normalization
-----------------------
If allele_geneFamily.txt is present in the same directory, gene names
extracted by the LLM are mapped to their RGC gene-family string.

Two-pass normalization:
  Pass 1 – _canonical(): heuristic string transformations
    - Missing "bla" prefix      CTX-M-15   → blaCTX-M-15 → family "blaCTX-M"
    - AME prime-mark variants   aac(6)-    → aac(6')-
    - AME without parentheses   aac6ib     → aac(6')-Ib
    - Mutation suffixes         gyrA_S83L  → gyrA
    - MCR variant spelling      mcr1       → mcr-1
  Pass 2 – mapping lookup: canonical key → original-case family string from file
    The output gene_name is always the family string as written in
    allele_geneFamily.txt, never a heuristically derived string.

Point-mutation filter
---------------------
If pointMutationsGenesUniq.txt is present in the same directory, rows
are excluded if gene_name is in that list but NOT in amrGenesUniq.txt.

Bacterial gene filter
---------------------
If Bacteria_genes_all.txt is present in the same directory, rows are excluded
if the gene_name (after normalization) does not match any name in that file.
Matching is allele-aware: tetA1, blaTEM-1, aac(6')Ib all resolve to their
base gene name before lookup. Rows are KEPT if:
  - exact normalised match found, OR
  - stripping trailing allele suffix matches a base name, OR
  - the gene name starts with a known base name (prefix match, min 4 chars)
Rows where gene_name was successfully resolved via allele_geneFamily.txt
are always kept (they are already validated AMR genes).
"""

import json
import sys
import csv
import re
from pathlib import Path

# Reference lookup files (allele_geneFamily.txt, Bacteria_genes_all.txt, etc.)
# live in reference_data/ at the repo root of this packaged pipeline, not next
# to this script (reslit/genes/ -> reslit/ -> repo root -> reference_data/).
REFERENCE_DATA = Path(__file__).resolve().parent.parent.parent / "reference_data"


# ── Canonical-form helpers ────────────────────────────────────────────────────

_BLA_FAMILIES = (
    "CTX-M", "TEM", "SHV", "OXA", "NDM", "KPC", "VIM", "IMP", "GES",
    "CMY", "DHA", "FOX", "MOX", "ACT", "MIR", "ACC", "ADC", "PDC",
    "PER", "VEB", "BEL", "GIM", "SPM", "AIM", "IMI", "CAR",
    "CFE", "FRI", "ROB", "SCO", "SME", "CEP",
    "LAP", "LEN", "OKP", "OXY", "OCH",
)
_BLA_RE = re.compile(
    r"^(?!bla)(" + "|".join(re.escape(f) for f in _BLA_FAMILIES) + r")(?=[-_\d\s]|$)",
    re.IGNORECASE,
)

# AME with parentheses but mangled/missing prime marks
_AME_PRIME_RE = re.compile(
    r"(aac|aph|ant|aad)\((\d+)(['\u2019\u02bc\u0060\"]*)\)",
    re.IGNORECASE,
)

# AME without parentheses at all: aac6, aac6ib, aac61b, aph3
_AME_NOPAREN_RE = re.compile(
    r"^(aac|aph|ant|aad)(\d+)(['\u2019\u02bc\u0060\"]*)(.*)$",
    re.IGNORECASE,
)

# Point-mutation suffix: GENE_S83L / GENE_A-53del / GENE_W33Ter
_MUTATION_SUFFIX_RE = re.compile(r"^[A-Z][-\d]")

_MCR_RE = re.compile(r"\bmcr[-_\s]?(\d+)", re.IGNORECASE)

# Numbers that conventionally carry a prime in AME nomenclature
_AME_PRIME_NUMS = {2, 3, 6, 9}


def _strip_mutation(s: str) -> str:
    idx = s.rfind("_")
    if idx == -1:
        return s
    return s[:idx] if _MUTATION_SUFFIX_RE.match(s[idx + 1:]) else s


def _fix_ame_primes(s: str) -> str:
    """Normalise prime marks in already-parenthesised AME names."""
    def _replace(m):
        n_primes = len(m.group(3))
        num = int(m.group(2))
        if n_primes >= 2:
            suffix = "''"
        elif n_primes == 1 or num in _AME_PRIME_NUMS:
            suffix = "'"
        else:
            suffix = ""
        return f"{m.group(1)}({m.group(2)}{suffix})"
    return _AME_PRIME_RE.sub(_replace, s)


def _fix_ame_noparen(s: str) -> str:
    m = _AME_NOPAREN_RE.match(s)
    if not m:
        return s
    enzyme, num_str, primes, rest = m.group(1), m.group(2), m.group(3), m.group(4)
    num = int(num_str)
    if not rest:
        return f"{enzyme}({num_str})"
    if len(primes) >= 2:
        prime = "''"
    elif len(primes) == 1 or num in _AME_PRIME_NUMS:
        prime = "'"
    else:
        prime = ""
    if rest and not rest.startswith("-"):
        rest = f"-{rest}"
    return f"{enzyme}({num_str}{prime}){rest}"


def _canonical(name: str) -> str:
    s = name.strip()
    s = s.replace('\u2013', '-').replace('\u2014', '-')
    s = s.replace('\u2019', "'").replace('\u2018', "'")
    s = s.replace('\u02bc', "'").replace('\u0060', "'")
    s = s.replace('\u2032', "'").replace('\u2033', "''")
    s = re.sub(r'\s+', '', s)
    if "/" in s:
        s = s.split("/")[0].strip()
    s = _strip_mutation(s)
    if _BLA_RE.match(s):
        s = "bla" + s
    s = _fix_ame_primes(s)
    if "(" not in s:
        s = _fix_ame_noparen(s)
    s = _MCR_RE.sub(lambda m: f"mcr-{m.group(1)}", s)
    return s.lower()


# ── Hand-curated aliases ──────────────────────────────────────────────────────
#
# Fallback mappings that kick in only when both the allele_geneFamily.txt
# lookup AND slug-based family matching fail. Keys are slugged/canonical forms.
#
# rRNA aliases — LLM sometimes writes the full name instead of the short form:
#   16s, 16srna, 16srrna → 16S
#   23s, 23srna, 23srrna → 23S
#
# AME (aminoglycoside-modifying enzyme) aliases — old/ambiguous nomenclature:
#   aac(3)   → aac(3)-I       incomplete name, defaults to subclass I
#   aac(6)   → aac(6')        bare enzyme class, defaults to 6'
#   aac      → aac(6')        bare enzyme class, defaults to 6'
#   aaca     → aacA43         legacy naming
#   aacaaphd → aacA4          bifunctional aacA-aphD → aacA4 family
#   aaca29a  → aac(6')-Iad    old numeric subclass → modern nomenclature
#   aaca29b  → aac(6')-Ian    old numeric subclass → modern nomenclature
#   aaca1b   → aac(6')-Ib     old numeric subclass → modern nomenclature
#   aaca4    → aacA4           explicit slug match
#   aacc1    → aacC1           fix capitalization
#   aadb     → aadB            fix capitalization
#   aph      → aph(3')-Ia     bare enzyme, defaults to most common
#   aada     → aadA1           bare aadA → default allele
#   stra     → aadA2           strA is an old synonym for aadA2
#
# Beta-lactamase / other aliases:
#   cat          → catA1       bare chloramphenicol acetyltransferase → default
#   blatem-1b    → blaTEM      specific allele → family level
#   blaoxa-51-like → blaOXA    "-like" suffix → family level
#
# WARNING — potentially problematic aliases:
#   aac      → aac(6')    RISKY: bare "aac" could be aac(3) or aac(6');
#                          defaults to aac(6') which may be wrong for
#                          papers discussing aac(3) enzymes.
#   aaca     → aacA43     RISKY: "aacA" is ambiguous — could be aacA4,
#                          aacA7, aacA29, etc. Defaults to aacA43.
#   aph      → aph(3')-Ia RISKY: bare "aph" could be aph(2''), aph(3'),
#                          aph(3''), aph(6), etc. Defaults to aph(3')-Ia.
#   aada     → aadA1      RISKY: bare "aadA" could be aadA2, aadA5, etc.
#                          Defaults to aadA1.
#   cat      → catA1      RISKY: bare "cat" could be catB, catS, etc.
#                          Defaults to catA1.
#   aacaaphd → aacA4      QUESTIONABLE: aacA-aphD is the bifunctional gene
#                          encoding AAC(6')-APH(2''). Mapping to "aacA4"
#                          family loses the aphD component. The allele
#                          column preserves the original name.
#   blatem-1b → blaTEM     LOSSY: drops allele specificity (TEM-1B → TEM).
#   blaoxa-51-like → blaOXA LOSSY: drops "-like" qualifier.

_EXTRA_ALIASES: dict = {
    "16s":           "16S",
    "16srna":        "16S",
    "16srrna":       "16S",
    "23s":           "23S",
    "23srna":        "23S",
    "23srrna":       "23S",
    "aac(3)":        "aac(3)-I",
    "aac(6)":        "aac(6')",
    "aac":           "aac(6')",
    "aaca":          "aacA43",
    "aacaaphd":      "aacA4",
    "aaca29a":       "aac(6')-Iad",
    "aaca29b":       "aac(6')-Ian",
    "aaca1b":        "aac(6')-Ib",
    "aadb":          "aadB",
    "aaca4":         "aacA4",
    "aacc1":         "aacC1",
    "aph":           "aph(3')-Ia",
    "aada":          "aadA1",
    "stra":          "aadA2",
    "cat":           "catA1",
    "blatem-1b":     "blaTEM",
    "blaoxa-51-like": "blaOXA",
}

# ── Load allele→family mapping ────────────────────────────────────────────────

def _slug(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', s.lower())


def load_allele_gene_family(filepath: str):
    mapping       = {}
    families      = {}
    slug_families = {}
    families_list = []
    stripped_map  = {}

    with open(filepath, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 2:
                allele_raw = parts[0].strip('"')
                family_raw = parts[1].strip('"')
            elif len(parts) == 1:
                allele_raw = parts[0].strip('"')
                family_raw = allele_raw
            else:
                continue
            if allele_raw.lower() in ("allele", "gene_family"):
                continue

            allele_key = _canonical(allele_raw)
            family_key = _canonical(family_raw)

            mapping[allele_key] = family_key
            if family_key not in families:
                families[family_key] = family_raw
                families_list.append(family_raw)
                mapping.setdefault(family_key, family_key)
                fslug = _slug(family_raw)
                if fslug not in slug_families:
                    slug_families[fslug] = family_raw
                last_dash = family_raw.rfind('-')
                base = family_raw[:last_dash] if last_dash != -1 else family_raw
                skey = _slug(base)
                if skey and skey not in stripped_map:
                    stripped_map[skey] = family_raw
                if fslug not in stripped_map:
                    stripped_map[fslug] = family_raw

            if allele_key.startswith("bla"):
                no_bla = allele_key[3:]
                if no_bla not in mapping:
                    mapping[no_bla] = family_key

    return mapping, families, slug_families, families_list, stripped_map


_DIGIT_TO_ROMAN: dict = {
    '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v',
    '6': 'vi', '7': 'vii', '8': 'viii', '9': 'ix',
}


def _slug_roman_variants(raw: str):
    base = _slug(raw)
    m = re.match(r'^(aac|aph|ant|aad)(\d)(.*)', base)
    if not m or not m.group(3):
        return []
    prefix = m.group(1) + m.group(2)
    rest   = m.group(3)
    rm = re.match(r'^(\d+)(.*)', rest)
    if not rm:
        return []
    digits, suffix = rm.group(1), rm.group(2)
    roman = ''.join(_DIGIT_TO_ROMAN.get(d, d) for d in digits)
    return [prefix + roman + suffix]


def normalize_gene_name(raw_name, mapping, families, slug_families, families_list, stripped_map):
    key = _canonical(raw_name)
    fam_key = mapping.get(key)
    if fam_key is not None:
        return families.get(fam_key, fam_key)

    raw_slug = _slug(raw_name)
    family_hit = slug_families.get(raw_slug)
    if family_hit is not None:
        return family_hit

    for variant_slug in _slug_roman_variants(raw_name):
        family_hit = slug_families.get(variant_slug)
        if family_hit is not None:
            return family_hit

    alias_hit = _EXTRA_ALIASES.get(raw_slug) or _EXTRA_ALIASES.get(key)
    if alias_hit is not None:
        return alias_hit

    # WARNING: prefix-match logic below is aggressive — it maps any gene name
    # to the shortest family whose slug starts with the input slug. This causes
    # INCORRECT mappings when the input is already a valid complete gene name
    # that happens to be a prefix of a longer family name.
    #
    # 3,205 rows / 516 unique mappings were affected. Known problematic cases:
    #
    #   WRONG — input is a real gene, gets expanded to a different gene:
    #     aacA3 -> aacA32           (6x)   aacA3 is a valid gene
    #     aacA1 -> aacA10           (5x)   aacA1 is a valid gene
    #     aacA5 -> aacA57-2         (5x)   aacA5 is a valid gene
    #     aphA1 -> aphA16           (96x)  aphA1 is a valid gene
    #     aphA -> aphA16            (49x)  aphA is a valid gene
    #     aphA-1 -> aphA16          (7x)   aphA-1 is a valid gene
    #     dfrA2 -> dfrA20           (3x)   dfrA2 is a valid gene
    #     fosA1 -> fosA11           (2x)   fosA1 is a valid gene
    #     blaOXA-1 -> blaOXA-143    (9x)   blaOXA-1 is a valid gene
    #     bla(OXA-1) -> blaOXA-143  (6x)   blaOXA-1 is a valid gene
    #     blaOXA1 -> blaOXA-143     (4x)   blaOXA-1 is a valid gene
    #     bla_OXA-1 -> blaOXA-143   (3x)   blaOXA-1 is a valid gene
    #     bla_oxa-1 -> blaOXA-143   (1x)   blaOXA-1 is a valid gene
    #     bla_OXA-14 -> blaOXA-143  (1x)   blaOXA-14 is a valid gene
    #     blaOXA-6 -> blaOXA-61     (2x)   blaOXA-6 is a valid gene
    #     cat8 -> cat86             (1x)   cat8 is a valid gene
    #     tetA5 -> tetA(58)         (1x)   tetA5 is a valid allele
    #     tet3 -> tet(30)           (1x)   tet(3) is a valid gene
    #     tet4 -> tet(40)           (1x)   tet(4) is a valid gene
    #     aadA1b -> aadA1bt         (3x)   aadA1b is a valid allele
    #     aac(6')-Ib-c -> aac(6')-Ib-cr (2x) likely meant aac(6')-Ib-cr, but input is truncated
    #     aac(6')-Ib_1 -> aac(6')-Ib11 (1x) aac(6')-Ib1 is a valid allele
    #     blaB1 -> blaB1PEDO        (4x)   blaB1 is a valid gene
    #     blaB3 -> blaB3SU1         (5x)   blaB3 is a valid gene
    #     blaD -> blaDES            (11x)  ambiguous
    #     blaG -> blaGES            (2x)   ambiguous
    #     blaH -> blaHBL            (2x)   ambiguous
    #     blaJ -> blaJOHN           (2x)   ambiguous
    #     blaK -> blaKBL            (2x)   ambiguous
    #     blaN -> blaNDM            (2x)   ambiguous
    #     blaO -> blaOCH            (2x)   ambiguous
    #     blaT -> blaTEL            (2x)   ambiguous
    #     blaV -> blaVAM            (1x)   ambiguous
    #     blaW -> blaWUS            (1x)   ambiguous
    #     blaY -> blaYEM            (1x)   ambiguous
    #     blaSH -> blaSHW           (1x)   blaSHV would be more likely
    #     blaOX -> blaOXA           (1x)   likely correct but via prefix
    #     FosA1 -> fosA11           (2x)   fosA1 is a valid gene
    #     aacA[3] -> aacA32         (1x)   aacA3 is a valid gene
    #     OmpK -> ompK35            (1x)   ambiguous (could be ompK36/37)
    #     PBP1 -> pbp1a             (3x)   ambiguous (could be pbp1b)
    #     PBP-1 -> pbp1a            (1x)   ambiguous
    #     pbp1 -> pbp1a             (10x)  ambiguous (could be pbp1b)
    #     pbp -> pbp2               (3x)   ambiguous
    #
    #   LIKELY CORRECT — input is genuinely incomplete / shorthand:
    #     tet -> tet(A)             (162x)
    #     erm -> erm(A)             (146x)
    #     aph(3')-III -> aph(3')-IIIa (125x)
    #     aac(3)-IV -> aac(3)-IVa   (115x)
    #     tetX -> tet(X1)           (114x)
    #     qnr -> qnrA              (110x)
    #     sul -> sul1               (106x)
    #     tet(X) -> tet(X1)         (83x)
    #     mcr -> mcr-1              (74x)
    #     aadD -> aadD1             (70x)
    #     blaCTX -> blaCTX-M        (63x)
    #     mef -> mef(A)             (59x)
    #     vanY -> vanY-A            (48x)
    #     mef(E) -> mef(En2)        (48x)
    #     vanX -> vanX-A            (47x)
    #     mefE -> mef(En2)          (45x)
    #     dfr -> dfrA               (44x)
    #     vanR -> vanR-A            (43x)
    #     vanS -> vanS-A            (39x)
    #     aph(3')-I -> aph(3'')-Ia  (35x)
    #     mph -> mph(A)             (34x)
    #     macA -> macAB             (31x)
    #     vat -> vat(A)             (28x)
    #     vanZ -> vanZ1             (27x)
    #     aph(3') -> aph(3'')-Ia    (27x)
    #     mer -> merA               (26x)
    #     vanW -> vanW-B            (25x)
    #     vanT -> vanTc             (24x)
    #     aad -> aad9               (24x)
    #     aac(3) -> aac(3)-I        (23x)
    #     porB -> porB1b            (20x)
    #     hlyA -> hlyA-alpha        (19x)
    #     blaR -> blaR1             (19x)
    #     bcr -> bcrA               (16x)
    #     ant -> ant(3'')-Ia        (15x)
    #     mrx -> mrx(A)             (15x)
    #     ant(6) -> ant(6)-Ia       (14x)
    #     lnu -> lnu(A)             (14x)
    #     lsa -> lsa(A)             (13x)
    #     esp -> espA               (13x)
    #     msr -> msr(A)             (13x)
    #     aph(6)-I -> aph(6)-Ia     (12x)
    #     vga -> vga(A)             (12x)
    #     sec -> sec1               (12x)
    #     aac(3)-III -> aac(3)-IIIa (11x)
    #     vgb -> vgb(A)             (10x)
    #     cmr -> cmrA               (10x)
    #     ars -> arsA               (10x)
    #     aac(2') -> aac(2')-Ia     (10x)
    #     flo -> floR               (9x)
    #     van -> vanA               (9x)
    #     sil -> silA               (9x)
    #     aac(3)-VI -> aac(3)-VIa   (9x)
    #     amp -> ampC               (9x)
    #     ter -> terA               (8x)
    #     ant(3")-I -> ant(3'')-Ia  (7x)
    #     nim -> nimA               (7x)
    #     mtr -> mtrA               (7x)
    #     pco -> pcoA               (7x)
    #     ant(9) -> ant(9)-Ia       (6x)
    #     ant9 -> ant(9)-Ia         (6x)
    #     ant(9")-I -> ant(9)-Ia    (1x)
    #     ant(6)-I -> ant(6)-Ia     (5x)
    #     ant(3'')-I -> ant(3'')-Ia (5x)
    #     ant(4') -> ant(4')-Ic     (3x)
    #     ant(4')-I -> ant(4')-Ic   (3x)
    #     ant(2")-I -> ant(2'')-Ia  (4x)
    #     ant(3")-II -> ant(3'')-IIa (3x)
    #     ant(2") -> ant(2'')-Ia    (4x)
    #     aph(3')-IV -> aph(3')-IVa (4x)
    #     aph(4) -> aph(4)-Ia       (2x)
    #     aph(3')-VII -> aph(3')-VIIa (3x)
    #     mec -> mecA               (4x)
    #     cfx -> cfxA               (4x)
    #     blaOKP -> blaOKP-A        (11x)
    #     aph(2'')-I -> aph(2'')-Ie (2x)
    #     oqx -> oqxA               (3x)
    #     arm -> armA               (3x)
    #     sodC -> sodC1             (5x)
    #     ere -> ere(A)             (2x)
    #     pen -> penA               (2x)
    #     mecR -> mecR1             (1x)
    #     vanK -> vanK-I            (2x)
    #     vanU -> vanU-G            (3x)
    #
    # If rerunning: consider disabling this block and using _EXTRA_ALIASES
    # for the "likely correct" cases above, to avoid the wrong expansions.
    hits = [
        f for f in families_list
        if _slug(f).startswith(raw_slug) and _slug(f) != raw_slug
    ]
    if hits:
        return min(hits, key=lambda f: len(_slug(f)))

    stripped_hit = stripped_map.get(raw_slug)
    if stripped_hit is not None:
        return stripped_hit

    last_dash = key.rfind('-')
    if last_dash != -1:
        input_stripped_slug = _slug(key[:last_dash])
        stripped_hit = stripped_map.get(input_stripped_slug)
        if stripped_hit is not None:
            return stripped_hit

    return raw_name


# ── Load gene lists ───────────────────────────────────────────────────────────

def load_gene_list(filepath: str) -> set:
    genes = set()
    with open(filepath, encoding="utf-8") as fh:
        for line in fh:
            name = line.strip()
            if name and not name.startswith("#"):
                genes.add(name.lower())
    return genes


# ── Load Bacteria_genes_all.txt ───────────────────────────────────────────────────

def load_bacteria_genes(filepath: str):
    """
    Load Bacteria_genes_all.txt and return (names_set, None).

    names_set: slugged names for O(1) membership lookup.
    Storing only the slug (all non-alphanumeric chars stripped, lowercased)
    is sufficient — _get_allele_candidates also slugs before lookup.
    Precompiling the slug regex avoids per-line compile overhead at 7M+ lines.
    """
    _slug_re = re.compile(r'[^a-z0-9]')
    names_set = set()
    with open(filepath, encoding="utf-8") as fh:
        for line in fh:
            name = line.strip()
            if not name or name.startswith("#"):
                continue
            names_set.add(_slug_re.sub('', name.lower()))
    return names_set, None


def _get_allele_candidates(name: str):
    """
    Generate base-name candidates from an allele name, in priority order.
    Used to check whether an extracted name resolves to a known bacterial gene.

    tetA1    → [teta1, teta]
    blaTEM-1 → [blatem1, blatem]
    aac(6)ib → [aac6ib, aac6i, aac6, aac]
    aadA27   → [aada27, aada]
    mcr-1    → [mcr1, mcr]
    """
    n = _slug(name)          # slug: lowercase, non-alphanumeric stripped
    candidates = [n]
    seen = {n}

    def add(c):
        c = c.strip()
        if c and len(c) >= 3 and c not in seen:
            candidates.append(c)
            seen.add(c)

    # Strip trailing digits ± letter:  aada27→aada, teta1a→teta
    add(re.sub(r'\d+[a-z]?$', '', n))
    add(re.sub(r'\d+[a-z]+$', '', n))

    # Strip trailing single letter (only for names >4 chars to avoid over-stripping)
    if len(n) > 4:
        add(re.sub(r'[a-z]$', '', n))

    # Parenthetical enzyme class: aac(6')ib → slug aac6ib
    # After slugging, try stripping suffix digits+letters: aac6ib → aac6i → aac6 → aac
    m = re.match(r'^((?:aac|aph|ant|aad)\d+)(.*)', n)
    if m:
        base_part = m.group(1)   # e.g. aac6
        add(base_part)
        # Also try the enzyme family without number: aac
        add(re.sub(r'\d+$', '', base_part))

    # Plain trailing digit strip: blatem1 → blatem
    add(re.sub(r'\d+$', '', n))

    return candidates


def is_confirmed_bacterial_gene(gene_name: str, bacteria_names: set, bacteria_prefixes: set, was_normalised: bool) -> bool:
    """
    Return True if gene_name should be kept based on Bacteria_genes_all.txt.

    Logic:
      1. was_normalised=True → already resolved by allele_geneFamily.txt, always keep.
      2. Exact/candidate check: slug and all allele-stripped variants against
         bacteria_names (O(1) per candidate). This handles alleles correctly:
         tetA1→teta, blaTEM-1→blatem, aadA27→aada, aac(6)ib→aac6→aac.
    """
    if was_normalised:
        return True

    candidates = _get_allele_candidates(gene_name)
    for c in candidates:
        if c in bacteria_names:
            return True

    return False


# ── Core extraction ───────────────────────────────────────────────────────────

def array_to_string(value):
    if isinstance(value, list):
        return '|'.join(str(v) for v in value if v is not None)
    return str(value) if value is not None else ''


def extract_genes_from_result(result, mapping=None, families=None, slug_families=None, families_list=None, stripped_map=None):
    if mapping is None:
        mapping = {}
    if families is None:
        families = {}
    if slug_families is None:
        slug_families = {}
    if families_list is None:
        families_list = []
    if stripped_map is None:
        stripped_map = {}

    pmid        = result.get('pmid', '')
    full_output = result.get('full_output', {})

    paper_title         = full_output.get('paper_title', '')
    publication_year    = full_output.get('publication_year', '')
    paper_type          = full_output.get('paper_type', '')
    key_findings        = full_output.get('key_findings', '')
    geographic_location = array_to_string(full_output.get('geographic_location', []))
    methodology         = full_output.get('methodology', '')
    sample_size         = full_output.get('sample_size', '')
    sequence_accessions = array_to_string(full_output.get('sequence_accessions', []))

    genes_dict = full_output.get('genes', {})
    rows = []

    for raw_gene_name, gene_data in genes_dict.items():
        gc = gene_data.get('genetic_context') or {}
        if not isinstance(gc, dict):
            gc = {}

        allele    = raw_gene_name
        gene_name = normalize_gene_name(raw_gene_name, mapping, families, slug_families, families_list, stripped_map)

        row = {
            'paper_pmid':                pmid,
            'paper_title':               paper_title,
            'publication_year':          publication_year,
            'paper_type':                paper_type,
            'key_findings':              key_findings,
            'geographic_location':       geographic_location,
            'methodology':               methodology,
            'sample_size':               sample_size,
            'sequence_accessions':       sequence_accessions,
            'gene_name':                 gene_name,
            'allele':                    allele,
            'encodes':                   gene_data.get('encodes', ''),
            'mechanism':                 gene_data.get('mechanism', ''),
            'confers_resistance_to':     array_to_string(gene_data.get('confers_resistance_to', [])),
            'resistance_mechanism_class': gene_data.get('resistance_mechanism_class', ''),
            'organisms_tested_in':       array_to_string(gene_data.get('organisms_tested_in', [])),
            'role_in_paper':             gene_data.get('role_in_paper', ''),
            'validation_method':         gene_data.get('validation_method', ''),
            'evidence_level':            gene_data.get('evidence_level', ''),
            'key_substitutions':         gene_data.get('key_substitutions', ''),
            'genetic_context_location':  gc.get('location', ''),
            'genetic_context_notes':     gc.get('genetic_context_notes', ''),
        }
        rows.append(row)

    return rows


FIELDNAMES = [
    'paper_pmid', 'paper_title', 'publication_year', 'paper_type',
    'key_findings', 'geographic_location', 'methodology', 'sample_size',
    'sequence_accessions', 'gene_name', 'allele', 'encodes', 'mechanism',
    'confers_resistance_to', 'resistance_mechanism_class', 'organisms_tested_in',
    'role_in_paper', 'validation_method', 'evidence_level', 'key_substitutions',
    'genetic_context_location', 'genetic_context_notes',
]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 qwen3_to_csv.py <input_file> <output_file>")
        print("\nArguments:")
        print("  input_file   Path to extraction_summary.json file")
        print("  output_file  Path to output CSV file")
        print("\nExample:")
        print("  python3 qwen3_to_csv.py extraction_summary.json genes.csv")
        sys.exit(1)

    input_file  = sys.argv[1]
    output_file = sys.argv[2]

    # Load normalisation mapping
    mapping, families, slug_families, families_list, stripped_map = {}, {}, {}, [], {}
    allele_map_path = REFERENCE_DATA / 'allele_geneFamily.txt'
    if allele_map_path.exists():
        mapping, families, slug_families, families_list, stripped_map = load_allele_gene_family(str(allele_map_path))
        print(f'✓ Loaded {len(mapping):,} allele keys / '
              f'{len(families):,} unique families / '
              f'{len(slug_families):,} family slugs from {allele_map_path.name}')
    else:
        print(f'⚠  allele_geneFamily.txt not found — gene_name will equal allele')

    # Load chromosomal mutation genes (replace old pointMutationsGenesUniq logic)
    chromosomal_genes = set()
    chrom_path = REFERENCE_DATA / 'chromosomalMutationGenes.txt'
    if chrom_path.exists():
        chromosomal_genes = load_gene_list(str(chrom_path))
        print(f'✓ Loaded {len(chromosomal_genes):,} chromosomal mutation genes from {chrom_path.name}')
    else:
        print(f'⚠  chromosomalMutationGenes.txt not found — chromosomal gene filter disabled')
    # Also accept the old pointMutationsGenesUniq.txt as fallback
    if not chromosomal_genes:
        pm_path = REFERENCE_DATA / 'pointMutationsGenesUniq.txt'
        amr_path = REFERENCE_DATA / 'amrGenesUniq.txt'
        if pm_path.exists() and amr_path.exists():
            pm_genes = load_gene_list(str(pm_path))
            amr_genes = load_gene_list(str(amr_path))
            chromosomal_genes = pm_genes - amr_genes
            print(f'  (fallback) → {len(chromosomal_genes):,} genes from pointMutationsGenesUniq - amrGenesUniq')

    # Load Bacteria_genes_all.txt filter
    bacteria_names, bacteria_prefixes = None, None
    bacteria_path = REFERENCE_DATA / 'Bacteria_genes_all.txt'
    if bacteria_path.exists():
        bacteria_names, bacteria_prefixes = load_bacteria_genes(str(bacteria_path))
        print(f'✓ Loaded {len(bacteria_names) // 2:,} bacterial gene names from {bacteria_path.name}')
        print(f'  → Rows with unrecognised gene names will be removed')
    else:
        print(f'⚠  Bacteria_genes_all.txt not found — bacterial gene filter disabled')

    print(f'\n📖 Reading: {input_file}')
    try:
        with open(input_file, encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f'❌ File not found: {input_file}')
        sys.exit(1)

    results = data.get('results', {})
    print(f'✓ Loaded {len(results)} papers '
          f'(success={data.get("success")}, '
          f'irrelevant={data.get("irrelevant")}, '
          f'errors={data.get("errors")})')

    print('📊 Processing genes...')
    all_rows              = []
    skipped               = 0
    normalised_count      = 0
    chrom_filtered        = 0   # chromosomal gene, no mutation reported
    locus_tag_filtered    = 0   # locus tag (e.g. bb28_rs06750)
    fused_mut_filtered    = 0   # fused chromosomal+mutation (e.g. gyra83l, rpob531)
    hallucination_filtered = 0  # repeated chars / garbage (e.g. cya6mannnnnn)
    bacteria_filtered     = 0
    unmatched             = {}
    total_papers          = len(results)

    for paper_n, (pmid, result) in enumerate(results.items(), start=1):
        if paper_n % 1000 == 0 or paper_n == 1:
            print(f'  paper {paper_n:,}/{total_papers:,}  |  rows kept: {len(all_rows):,}  |  '
                  f'chrom_filtered: {chrom_filtered:,}  locus: {locus_tag_filtered:,}  fused: {fused_mut_filtered:,}  bacteria: {bacteria_filtered:,}',
                  flush=True)
        if result.get('status') != 'success':
            skipped += 1
            continue
        rows = extract_genes_from_result(result, mapping, families, slug_families, families_list, stripped_map)
        for r in rows:
            was_normalised = r['gene_name'] != r['allele']
            normalised_count += was_normalised
            if not was_normalised and _canonical(r['allele']) not in mapping:
                unmatched[r['allele']] = unmatched.get(r['allele'], 0) + 1

            gene_raw  = r['gene_name']
            gene_low  = gene_raw.lower()
            gene_sl   = _slug(gene_raw)

            # Filter 1: locus tags — bb28_rs06750, mbovpg45_rs01415
            # Pattern: alphanumeric prefix + _rs + digits, or prefix + _digits
            if re.search(r'_rs\d{4,}', gene_low) or re.match(r'^[a-z0-9]{2,8}_\d{5,}$', gene_sl):
                locus_tag_filtered += 1
                continue

            # Filter 2: hallucinations — repeated chars (nnnn, aaaa) or non-alpha garbage
            if re.search(r'(.){3,}', gene_low):   # 4+ repeated chars
                hallucination_filtered += 1
                continue

            # Filter 3: fused chromosomal+mutation notation
            # e.g. gyra83l, gyra83, rpob531, rpob_531, rpsl43, rpsj1
            # Rule: slug starts with a chromosomal gene name AND suffix contains
            # a digit AND at least one letter (position+AA, e.g. 83l, 531s).
            # OR suffix is purely digits (position only, e.g. gyra83, rpob531).
            # EXCLUDE: gyrA_S83L style (underscore separator = explicit notation,
            # already handled upstream by _strip_mutation in _canonical).
            # EXCLUDE: letter-only suffix like rpobc (no digit = not a position).
            _chrom_hit = None
            for cg in chromosomal_genes:
                cg_sl = _slug(cg)
                if gene_sl.startswith(cg_sl) and len(gene_sl) > len(cg_sl):
                    suffix = gene_sl[len(cg_sl):]
                    has_digit  = bool(re.search(r'\d', suffix))
                    has_letter = bool(re.search(r'[a-z]', suffix))
                    # Skip letter-only suffixes (rpobc → suffix=c, not a mutation position)
                    if not has_digit:
                        continue
                    # Skip if original name has underscore before the suffix
                    # (gyrA_S83L is proper notation, not a fused artifact)
                    if '_' in gene_raw and re.search(r'_[A-Za-z]\d', gene_raw):
                        continue
                    _chrom_hit = cg
                    break
            if _chrom_hit:
                fused_mut_filtered += 1
                continue

            # Filter 4: bare chromosomal gene — always remove
            if gene_low in chromosomal_genes:
                chrom_filtered += 1
                continue

            # Filter 5: bacterial gene name filter
            if bacteria_names is not None:
                if not is_confirmed_bacterial_gene(gene_raw, bacteria_names, bacteria_prefixes, was_normalised):
                    bacteria_filtered += 1
                    continue

            all_rows.append(r)

    total_filtered = chrom_filtered + locus_tag_filtered + fused_mut_filtered + hallucination_filtered + bacteria_filtered
    print(f'✓ Extracted {len(all_rows) + total_filtered:,} gene rows from '
          f'{len(results) - skipped} papers ({skipped} skipped)')
    print(f'  {normalised_count:,} gene names resolved to a reference family')
    print(f'  {locus_tag_filtered:,} rows removed (locus tags)')
    print(f'  {hallucination_filtered:,} rows removed (hallucinations / repeated chars)')
    print(f'  {fused_mut_filtered:,} rows removed (fused chromosomal+mutation notation)')
    print(f'  {chrom_filtered:,} rows removed (chromosomal gene, no mutation reported)')
    if bacteria_names is not None:
        print(f'  {bacteria_filtered:,} rows removed (not a recognised bacterial gene)')
    print(f'  {len(all_rows):,} rows retained')

    if unmatched:
        top = sorted(unmatched.items(), key=lambda x: -x[1])[:20]
        print(f'\n⚠  Top {len(top)} unmatched gene names (not in allele_geneFamily.txt):')
        for name, cnt in top:
            print(f'    {cnt:4d}×  {name}')

    print(f'\n💾 Writing to: {output_file}')
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f'✅ Complete! Wrote {len(all_rows):,} rows to {output_file}')


if __name__ == '__main__':
    main()