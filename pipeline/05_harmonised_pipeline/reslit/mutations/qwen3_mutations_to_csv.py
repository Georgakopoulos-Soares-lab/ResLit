#!/usr/bin/env python3
"""
qwen3_mutations_to_csv.py
==========================
Reads extraction_summary JSON file, extracts all mutation data for each PMID,
and creates a CSV file with one row per mutation.

Applies the same chromosomal gene filter as qwen3_to_csv.py:
  - Mutations on chromosomal genes (gyrA, rpoB, etc.) are KEPT here —
    this is the correct table for them.
  - Locus tags, hallucinations, and fused mutation notations are cleaned.

Usage:
    python3 qwen3_mutations_to_csv.py extraction_summary.json mutations.csv
"""

import json
import sys
import csv
import re
from pathlib import Path

# Reference lookup files live in reference_data/ at the repo root of this
# packaged pipeline, not next to this script (reslit/mutations/ -> reslit/ ->
# repo root -> reference_data/).
REFERENCE_DATA = Path(__file__).resolve().parent.parent.parent / "reference_data"


# ── Helpers (same as qwen3_to_csv.py) ────────────────────────────────────────

def _slug(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', s.lower())


def array_to_string(value):
    if isinstance(value, list):
        return '|'.join(str(v) for v in value if v is not None)
    return str(value) if value is not None else ''


# ── Load chromosomal gene list ────────────────────────────────────────────────

def load_gene_list(filepath: str) -> set:
    genes = set()
    with open(filepath, encoding='utf-8') as fh:
        for line in fh:
            name = line.strip()
            if name and not name.startswith('#'):
                genes.add(name.lower())
                genes.add(_slug(name))
    return genes


# ── Load antibiotic names ────────────────────────────────────────────────────

def load_antibiotics(filepath: str) -> set:
    """
    Load antibiotics_names_abreviations.txt and return a set of
    normalised names for O(1) lookup.
    Normalisation: lowercase + strip whitespace.
    Lines starting with # are comments.
    """
    names = set()
    with open(filepath, encoding='utf-8') as fh:
        for line in fh:
            name = line.strip()
            if name and not name.startswith('#'):
                names.add(name.lower())
    return names


# Drug class names the LLM uses instead of (or alongside) specific drug names.
# Papers often write "macrolides", "fluoroquinolones", etc. rather than listing
# individual drugs, especially in review papers or broad-resistance studies.
# These are kept here rather than in the antibiotics file because the file
# contains specific drug names and abbreviations, not class terms.
_DRUG_CLASS_NAMES = {
    'macrolides', 'macrolide',
    'fluoroquinolones', 'fluoroquinolone', 'quinolones', 'quinolone',
    'aminoglycosides', 'aminoglycoside',
    'beta-lactams', 'beta-lactam', 'betalactams', 'betalactam',
    'carbapenems', 'carbapenem',
    'cephalosporins', 'cephalosporin',
    'penicillins', 'penicillin',
    'tetracyclines', 'tetracycline',
    'glycopeptides', 'glycopeptide',
    'oxazolidinones', 'oxazolidinone',
    'polymyxins', 'polymyxin',
    'sulfonamides', 'sulfonamide',
    'rifamycins', 'rifamycin',
    'lincosamides', 'lincosamide',
    'streptogramins', 'streptogramin',
    'trimethoprim-sulfamethoxazole',
    'chloramphenicols', 'chloramphenicol',
    'fosfomycins', 'fosfomycin',
    'nitrofurans', 'nitrofuran',
}


def has_known_antibiotic(confers_resistance_to: str, antibiotic_set: set) -> bool:
    """
    Returns True if at least one token in the pipe-separated
    confers_resistance_to field matches a known antibiotic name or
    a recognised drug class name.
    Matching is case-insensitive exact match on each token.
    Drug class names (macrolides, fluoroquinolones, etc.) are accepted
    in addition to the specific names in the antibiotic file because
    papers — especially reviews — often report resistance by class
    rather than naming individual drugs.
    """
    if not confers_resistance_to or not confers_resistance_to.strip():
        return False
    for token in confers_resistance_to.split('|'):
        token = token.strip().lower()
        if token and (token in antibiotic_set or token in _DRUG_CLASS_NAMES):
            return True
    return False


# ── Position consistency helpers ─────────────────────────────────────────────

def _extract_pos_from_pc(pc):
    """Extract numeric position from a protein_change string."""
    if not pc:
        return None
    m = re.search(r'[A-Za-z*](\-?\d+)[A-Za-z*]', pc)
    if m:
        return int(m.group(1))
    m = re.match(r'^(\-?\d+)[A-Za-z]', pc)
    if m:
        return int(m.group(1))
    m = re.search(r'\([−\-]?(\d+)\)', pc)
    if m:
        sign = -1 if re.search(r'\([−\-]', pc) else 1
        return sign * int(m.group(1))
    return None


def _extract_pos_from_ntc(ntc):
    """Extract position embedded in nucleotide_change e.g. G(−10)A."""
    if not ntc:
        return None
    m = re.search(r'\([−\-]?(\d+)\)', ntc)
    if m:
        sign = -1 if re.search(r'\([−\-]', ntc) else 1
        return sign * int(m.group(1))
    return None


def _parse_num(s):
    """Parse leading integer from a position string, handling unicode minus."""
    if not s:
        return None
    t = str(s).strip().replace('−', '-')
    m = re.match(r'^(\-?\d+)', t)
    return int(m.group(1)) if m else None


def _extract_embedded_position(ntc):
    """
    Fallback: pull a position out of free-text descriptions when no
    dedicated position field (nucleotide_position / amino_acid_position)
    was populated by the extraction model, e.g.:
        "C-to-T transition at -11"
        "G-to-A substitution at position 35"
    Only used when both ntp and aap are empty — if a real position field
    exists, it always takes priority over text-mined positions.
    """
    if not ntc:
        return None
    m = re.search(r'\bat\s+(?:position\s+)?([+\-]?\d+)\b', ntc, re.I)
    return m.group(1).lstrip('+') if m else None


def _is_standard_aa(pc):
    """True for standard three-letter AA notation: Leu466Ser, Ser80Phe."""
    return bool(re.match(r'^[A-Z][a-z]{2}\-?\d+[A-Z*]', pc.strip())) if pc else False


# Non-coding RNA genes: positions in these genes are nucleotide positions,
# not amino acid positions. Any protein_change extracted for them is a
# hallucination (the LLM maps the nucleotide notation onto an AA template).
# The notation field, when populated, is the reliable NT-level source.
_NON_CODING_RNA_SLUGS = {
    '16srrna', '16srna', '16s', 'rrs',
    '23srrna', '23srna', '23s', 'rrl',
    '5srrna', '5srna', '5s', 'rrf',
}


def is_noncoding_rna_gene(gene_name: str) -> bool:
    """
    Returns True if the gene is a non-coding RNA (rRNA).
    For these genes, protein_change is always a hallucination and should
    be discarded; nucleotide positions and changes are the only valid fields.
    Gene names may use spaces, underscores or mixed case:
        "23S rRNA", "23S_rRNA", "16S", "rrs", "rrl"
    """
    return _slug(gene_name) in _NON_CODING_RNA_SLUGS


# ── Codon table & normalisation helpers ──────────────────────────────────────

CODON_TABLE = {
    'TTT': 'F', 'TTC': 'F', 'TTA': 'L', 'TTG': 'L',
    'CTT': 'L', 'CTC': 'L', 'CTA': 'L', 'CTG': 'L',
    'ATT': 'I', 'ATC': 'I', 'ATA': 'I', 'ATG': 'M',
    'GTT': 'V', 'GTC': 'V', 'GTA': 'V', 'GTG': 'V',
    'TCT': 'S', 'TCC': 'S', 'TCA': 'S', 'TCG': 'S',
    'CCT': 'P', 'CCC': 'P', 'CCA': 'P', 'CCG': 'P',
    'ACT': 'T', 'ACC': 'T', 'ACA': 'T', 'ACG': 'T',
    'GCT': 'A', 'GCC': 'A', 'GCA': 'A', 'GCG': 'A',
    'TAT': 'Y', 'TAC': 'Y', 'TAA': '*', 'TAG': '*',
    'CAT': 'H', 'CAC': 'H', 'CAA': 'Q', 'CAG': 'Q',
    'AAT': 'N', 'AAC': 'N', 'AAA': 'K', 'AAG': 'K',
    'GAT': 'D', 'GAC': 'D', 'GAA': 'E', 'GAG': 'E',
    'TGT': 'C', 'TGC': 'C', 'TGA': '*', 'TGG': 'W',
    'CGT': 'R', 'CGC': 'R', 'CGA': 'R', 'CGG': 'R',
    'AGT': 'S', 'AGC': 'S', 'AGA': 'R', 'AGG': 'R',
    'GGT': 'G', 'GGC': 'G', 'GGA': 'G', 'GGG': 'G',
}

THREE_TO_ONE = {
    'Ala': 'A', 'Arg': 'R', 'Asn': 'N', 'Asp': 'D',
    'Cys': 'C', 'Gln': 'Q', 'Glu': 'E', 'Gly': 'G',
    'His': 'H', 'Ile': 'I', 'Leu': 'L', 'Lys': 'K',
    'Met': 'M', 'Phe': 'F', 'Pro': 'P', 'Ser': 'S',
    'Thr': 'T', 'Trp': 'W', 'Tyr': 'Y', 'Val': 'V',
    'Ter': '*', 'Stop': '*',
}


FULL_TO_ONE = {
    'Alanine': 'A', 'Arginine': 'R', 'Asparagine': 'N', 'Aspartate': 'D',
    'Aspartic acid': 'D', 'Cysteine': 'C', 'Glutamine': 'Q', 'Glutamate': 'E',
    'Glutamic acid': 'E', 'Glycine': 'G', 'Histidine': 'H', 'Isoleucine': 'I',
    'Leucine': 'L', 'Lysine': 'K', 'Methionine': 'M', 'Phenylalanine': 'F',
    'Proline': 'P', 'Serine': 'S', 'Threonine': 'T', 'Tryptophan': 'W',
    'Tyrosine': 'Y', 'Valine': 'V', 'Stop': '*', 'Termination': '*',
}


def _three_to_one(aa3):
    if not aa3: return ''
    aa3 = aa3.strip()
    if aa3 in THREE_TO_ONE: return THREE_TO_ONE[aa3]
    if aa3.lower() in ('fs', 'frameshift'): return 'fs'
    if aa3.lower() in ('del', 'ins', 'dup'): return aa3.lower()
    if aa3.lower() in ('stop', 'ter', 'term'): return '*'
    return '?'


def make_normalised_nt_mutation(aap, ntp, ntc, pc):
    """
    Build normalised nucleotide mutation string in A539T format.

    Sources in priority:
      1. Single nt change (G>A) + position from ntp or aap
      2. Codon change (GCA->GTG) with exactly 1 nt diff + ntp position
         (ntp points to first base of codon; offset by diff index)
      3. Multiple nt diffs in codon — return empty (can't give single nt notation)
    """
    ntc = str(ntc or '').strip()
    ntp = str(ntp or '').strip()
    aap = str(aap or '').strip()


    # Pattern 0: position already embedded in ntc (already normalised)
    # e.g. C-15T, G196A, G-10A — single base + integer + single base
    m = re.match(r'^([ACGT])(-?\d+)([ACGT])$', ntc, re.I)
    if m:
        return f"{m.group(1).upper()}{m.group(2)}{m.group(3).upper()}"

    # Pattern 0a: word-based / descriptive single nucleotide change.
    # Catches two phrasings seen from the LLM extraction:
    #   "A to G"                                  (bare word form)
    #   "C-to-T transition at -11"                (hyphenated + trailing position)
    #   "G to A transition at position -42"       (spaced + trailing position)
    # If a trailing "at [position] N" clause is present, that position wins;
    # otherwise fall back to whatever numeric position field was supplied.
    m = re.match(
        r'^([ACGT])[\s-]*to[\s-]*([ACGT])\b(?:.*?\bat\s+(?:position\s+)?([+\-]?\d+))?',
        ntc, re.I)
    if m:
        embedded_pos = m.group(3)
        pos = embedded_pos.lstrip('+') if embedded_pos else (_parse_num(ntp) or _parse_num(aap))
        if pos is not None:
            return f"{m.group(1).upper()}{pos}{m.group(2).upper()}"
        return f"{m.group(1).upper()}?{m.group(2).upper()}"

    # Pattern 0j: deletion with dash as alt: G->- (base deleted at ntp position)
    m = re.match(r'^([ACGT])\s*-?>\s*-$', ntc, re.I)
    if m:
        pos = ntp.strip() or aap.strip() or '?'
        return f"{m.group(1).upper()}{pos}del"

    # Pattern 0k: base+position+dash: C194- (single nt deletion, position embedded)
    m = re.match(r'^([ACGT])(-?\d+)-$', ntc, re.I)
    if m:
        return f"{m.group(1).upper()}{m.group(2)}del"

    # Pattern 0i: base+position+space+alt: T-35 C, T-40 A
    m = re.match(r'^([ACGT])(-?\d+)\s+([ACGT])$', ntc, re.I)
    if m:
        return f"{m.group(1).upper()}{m.group(2)}{m.group(3).upper()}"

    # Pattern 0h: bare deletion/insertion with position from ntp
    # 'deletion' + ntp='240-247' → '240-247del'
    # 'insertion' + ntp='240'    → '240ins'
    if re.match(r'^(deletion|del|insertion|ins|frameshift|fs)$', ntc, re.I):
        pos = ntp.strip() or aap.strip() or '?'
        change = 'del' if 'del' in ntc.lower() else ('ins' if 'ins' in ntc.lower() else 'fs')
        return f"{pos}{change}"

    # Pattern 0p: "Ins/Del bases pos" or "Ins/Del bases pos1-pos2"
    # Handles the LLM writing insertions/deletions in the form:
    #   "Ins A 38-39"  → "38-39insA"
    #   "Del C 100"    → "C100del"
    #   "Ins AG 50"    → "50insAG"
    # Insertion: position first, then bases (HGVS-like)
    # Deletion:  bases first, then position (mirrors compact nt form)
    m = re.match(r'^(ins(?:ertion)?|del(?:etion)?)\s+([ACGT]+)\s+(\d+(?:-\d+)?)$', ntc, re.I)
    if m:
        change_type = 'ins' if m.group(1).lower().startswith('ins') else 'del'
        bases = m.group(2).upper()
        pos = m.group(3)
        if change_type == 'del':
            return f"{bases}{pos}del"
        else:
            return f"{pos}ins{bases}"

    # Pattern 0g: phrase-style: 'G->A at position 212', 'C->T at -42', 'C->T at +58'
    m = re.match(
        r'^([ACGT])\s*-?\s*[>\u2192]\s*([ACGT])\s+at\s+(?:position\s+)?([+\-]?\d+)$',
        ntc, re.I)
    if m:
        pos = m.group(3).lstrip('+')
        return f"{m.group(1).upper()}{pos}{m.group(2).upper()}"

    # Pattern 0e: position-prefixed ntc: 1484G>T, 1401A>R, 492C>T
    # Format: digits + base + > + base  (position embedded at start)
    m = re.match(r'^(-?\d+)([ACGTRYWSMKHBVDN])\s*[>\u2192]\s*([ACGTRYWSMKHBVDN])$', ntc, re.I)
    if m:
        return f"{m.group(2).upper()}{m.group(1)}{m.group(3).upper()}"

    # Pattern 0f: ref+position+ref>alt: A514A>C, A1401A>R
    # Format: base + digits + base + > + base (redundant ref at start)
    m = re.match(r'^([ACGTRYWSMKHBVDN])(\d+)([ACGTRYWSMKHBVDN])\s*[>\u2192]\s*([ACGTRYWSMKHBVDN])$', ntc, re.I)
    if m:
        return f"{m.group(3).upper()}{m.group(2)}{m.group(4).upper()}"

    # Pattern 0b: dinucleotide change: AT>GC, GC>TA with position from ntp
    # Format: ref_bases > alt_bases where len(ref)==len(alt)==2
    m = re.match(r'^([ACGT]{2})\s*-?\s*[>\u2192]\s*([ACGT]{2})$', ntc, re.I)
    if m:
        ref, alt = m.group(1).upper(), m.group(2).upper()
        if len(ref) == len(alt):  # only if same length
            pos = _parse_num(ntp) or _parse_num(aap)
            if pos is not None:
                return f"{ref}{pos}{alt}"
            return f"{ref}?{alt}"

    # Pattern 0c: parenthetical position notation: C(-15)T, T(-8)A, G(-13)T
    # Format: base(position)base — extract and reformat to C-15T
    m = re.match(r'^([ACGT])\(([\-]?\d+)\)([ACGT])$', ntc, re.I)
    if m:
        return f"{m.group(1).upper()}{m.group(2)}{m.group(3).upper()}"

    # Pattern 0d: deletion notation: CT > deletion, AT > del
    # Format: bases > deletion with position from ntp
    m = re.match(r'^([ACGT]+)\s*[>\u2192]\s*(deletion|del|ins|insertion)$', ntc, re.I)
    if m:
        pos = ntp.strip() if ntp.strip() else (aap.strip() if aap.strip() else '?')
        bases = m.group(1).upper()
        change_type = 'del' if 'del' in m.group(2).lower() else 'ins'
        return f"{bases}{pos}{change_type}"

    # Single nt change: G>A
    m = re.match(r'^([ACGT])\s*-?\s*[>\u2192]\s*([ACGT])$', ntc, re.I)
    if m:
        pos = _parse_num(ntp) or _parse_num(aap)
        if pos is not None:
            return f"{m.group(1).upper()}{pos}{m.group(2).upper()}"
        return f"{m.group(1).upper()}?{m.group(2).upper()}"

    # Codon change: GCA->GTG
    m = re.match(r'^([ACGT]{3})\s*[-\u2013>]+\s*([ACGT]{3})$', ntc, re.I)
    if m:
        ref_codon = m.group(1).upper()
        alt_codon = m.group(2).upper()
        diffs = [(i, ref_codon[i], alt_codon[i])
                 for i in range(3) if ref_codon[i] != alt_codon[i]]
        if len(diffs) == 1 and ntp:
            nt_pos = _parse_num(ntp)
            if nt_pos is not None:
                idx, ref_nt, alt_nt = diffs[0]
                return f"{ref_nt}{nt_pos + idx}{alt_nt}"
        # Multiple diffs or no nt position — return raw nucleotide_change as-is
        return ntc

    return ''


def make_normalised_protein_change(aap, pc):
    """
    Build normalised protein change in one-letter AA format (e.g. S83L, D94A).

    Handles:
      - One-letter: D94A, S83L, H526Y, S315T1 (trailing variant digit stripped)
      - Three-letter both: Ser83Leu -> S83L
      - Mixed three+one: His437Y -> H437Y, Gln424K -> Q424K
      - Arrow notation: S->T with position from aap -> S315T
      - Three-letter arrow: Ser->Thr with position from aap -> S315T
    """
    pc  = str(pc  or '').strip()
    aap = str(aap or '').strip()
    if not pc:
        return ''

    # Strip slash variants: S315T1/T2 -> S315T1, H526Y/D -> H526Y
    # Take only the first variant before the slash
    if '/' in pc:
        pc = pc.split('/')[0].strip()

    # Strip trailing parenthetical annotations: M306I (ATA) → M306I
    # D94A (GAT->GCC) → D94A, H526Y (CAC->TAC) → H526Y
    pc = re.sub(r'\s*\(.*\)\s*$', '', pc).strip()



    # 1. One-letter with optional trailing variant digit: D94A, S315T1
    m = re.match(r'^([A-Z*])\s*(-?\d+)\s*([A-Z*]|fs|del|ins|dup|stop|ter)\d*$', pc, re.I)
    if m:
        alt = m.group(3)
        alt = alt.lower() if alt.lower() in ('fs', 'del', 'ins', 'dup') else ('*' if alt.lower() in ('stop','ter','term') else alt.upper())
        return f"{m.group(1).upper()}{m.group(2)}{alt}"

    # 2. Three-letter both: Ser83Leu, Asn526Lys, Tyr214fs
    m = re.match(r'^([A-Z][a-z]{2})\s*(-?\d+)\s*([A-Z][a-z]{2,}|\*|fs|del|ins|dup|stop|ter)\d*$', pc, re.I)
    if m:
        ref = _three_to_one(m.group(1))
        alt_raw = m.group(3)
        alt = _three_to_one(alt_raw) if len(alt_raw) >= 3 else alt_raw.lower()
        return f"{ref}{m.group(2)}{alt}"

    # 3. Mixed three-letter ref + one-letter alt: His437Y, Gln424K
    m = re.match(r'^([A-Z][a-z]{2})\s*(-?\d+)\s*([A-Z*]|fs|del|ins|dup|stop|ter)\d*$', pc, re.I)
    if m:
        ref = _three_to_one(m.group(1))
        alt = m.group(3)
        alt = alt.lower() if alt.lower() in ('fs', 'del', 'ins', 'dup') else ('*' if alt.lower() in ('stop','ter','term') else alt.upper())
        return f"{ref}{m.group(2)}{alt}"

    # 4. One-letter arrow: S->T, R->L (position from aap)
    m = re.match(r'^([A-Z*])\s*-?\s*[\u2192>]\s*([A-Z*]|fs|del|ins|dup|stop|ter)$', pc, re.I)
    if m:
        pos = aap if aap else '?'
        ref = m.group(1).upper()
        alt = m.group(2)
        alt = alt.lower() if alt.lower() in ('fs', 'del', 'ins', 'dup') else ('*' if alt.lower() in ('stop','ter','term') else alt.upper())
        return f"{ref}{pos}{alt}"

    # 5. Three-letter arrow: Ser->Thr, Arg->Leu (position from aap)
    m = re.match(r'^([A-Z][a-z]{2})\s*-?\s*[\u2192>]\s*([A-Z][a-z]{2}|\*|fs)$', pc, re.I)
    if m:
        pos = aap if aap else '?'
        ref = _three_to_one(m.group(1))
        alt = _three_to_one(m.group(2))
        return f"{ref}{pos}{alt}"

    # 6. Full amino acid name arrow: Serine -> Isoleucine (position from aap)
    m = re.match(r'^([A-Z][a-z]+)\s*-?\s*[>\u2192]\s*([A-Z][a-z]+)$', pc, re.I)
    if m:
        pos = aap if aap else '?'
        ref = FULL_TO_ONE.get(m.group(1).capitalize(), _three_to_one(m.group(1)[:3].capitalize()))
        alt = FULL_TO_ONE.get(m.group(2).capitalize(), _three_to_one(m.group(2)[:3].capitalize()))
        if ref and alt and ref != '?' and alt != '?':
            return f"{ref}{pos}{alt}"

    # 7b. One-letter+hyphen+position->one-letter: S-83 → I, D-87 → Y
    m = re.match(r'^([A-Z*])\s*-\s*(-?\d+)\s*-?\s*[>\u2192]\s*([A-Z*]|fs|del|ins|dup|stop|ter)\d*$', pc, re.I)
    if m:
        ref = m.group(1).upper()
        pos = m.group(2)
        alt = m.group(3)
        alt = ('*' if alt.lower() in ('stop','ter','term') else
               alt.lower() if alt.lower() in ('fs','del','ins','dup') else
               alt.upper())
        return f"{ref}{pos}{alt}"

    # 7a. Three-letter+position->any: Ser83->Ile, Ser85->Leu
    # Pattern: ThreeLetter + Position + arrow + (ThreeLetter or FullName or OneLetter)
    m = re.match(
        r'^([A-Z][a-z]{2})\s*-?\s*(-?\d+)\s*-?\s*[>\u2192]\s*([A-Z][a-z]{2,}|[A-Z])$',
        pc, re.I)
    if m:
        ref = _three_to_one(m.group(1).capitalize())
        pos = m.group(2)
        alt_raw = m.group(3)
        if len(alt_raw) == 1:
            alt = alt_raw.upper()
        elif len(alt_raw) == 3:
            alt = _three_to_one(alt_raw.capitalize())
        else:
            alt = FULL_TO_ONE.get(alt_raw.capitalize(), '?')
        if ref != '?' and alt != '?':
            return f"{ref}{pos}{alt}"

    # 7. Position-embedded three-letter: 481His->481Tyr, 526His->526Tyr
    m = re.match(r'^\d+([A-Z][a-z]{2})\s*[\u2192>]\s*\d*([A-Z][a-z]{2}|[A-Z*]|fs)$', pc, re.I)
    if m:
        pos = aap if aap else '?'
        ref = _three_to_one(m.group(1))
        alt_raw = m.group(2)
        alt = _three_to_one(alt_raw) if len(alt_raw) == 3 else alt_raw.upper()
        return f"{ref}{pos}{alt}"

    # 8. Standalone indel / frameshift keyword with position from aap.
    # "frameshift" + aap="38" → "38fs"
    # "deletion"   + aap="100" → "100del"
    # "insertion"  + aap="50"  → "50ins"
    _INDEL_NORM = {
        'frameshift': 'fs', 'fs': 'fs',
        'deletion': 'del', 'del': 'del',
        'insertion': 'ins', 'ins': 'ins',
        'duplication': 'dup', 'dup': 'dup',
    }
    if re.match(r'^(frameshift|fs|deletion|del|insertion|ins|duplication|dup)$', pc, re.I):
        pos = aap if aap else '?'
        alt = _INDEL_NORM.get(pc.lower(), 'fs')
        return f"{pos}{alt}"

    return ''


def is_codon_change(ntc):
    """Codon change: 3-letter codons separated by -> e.g. GCA->GTG, GAT->AAT/TAT"""
    if not ntc: return False
    return bool(re.match(r'^[ACGT]{3,}[-–>]+[ACGT]{3,}', ntc.strip(), re.IGNORECASE))


def is_single_nucleotide_change(ntc):
    """Single base substitution: G>A, T>C, C>T etc."""
    if not ntc: return False
    return bool(re.match(r'^[ACGT]\s*[>→]\s*[ACGT]$', ntc.strip(), re.IGNORECASE))


def has_change_notation(val: str) -> bool:
    """
    True if value contains a valid change notation — any of:

    1. Arrow / separator symbol: -> > → /
       e.g. "G>A", "GCA->GTG", "C->T at -42"

    2. Word-based phrasing: 'A to G', 'C-to-T transition at -11'
       The LLM sometimes writes promoter mutations this way instead of
       using an arrow; without this check Filter 5 rejects them.

    3. Already-normalised compact NT form: A2059G, C-15T, G196A
       Pattern: single ACGT base + integer (optionally negative) + single
       ACGT base, no other characters.  The model occasionally pre-normalises
       the notation (e.g. writes "A2059G" directly into nucleotide_change
       instead of "A>G" + nucleotide_position "2059").  Filter 5 runs on the
       raw field values after normalization has already succeeded, so without
       this branch it incorrectly flags such rows as "no actual change
       described" and drops them.
    """
    if not val or not val.strip():
        return False
    if re.search(r'[-–—>→/]', val):
        return True
    if re.search(r'\b[ACGT][\s-]*to[\s-]*[ACGT]\b', val, re.I):
        return True
    # Compact pre-normalised NT notation: A2059G, C-15T, G196A
    if re.match(r'^[ACGT]-?\d+[ACGT]$', val.strip(), re.I):
        return True
    # Standalone indel/frameshift keywords are unambiguously a change
    # (safety net for Filter 5 when ntc is empty and pc is just "frameshift")
    if re.match(r'^(frameshift|fs|deletion|del|insertion|ins|duplication|dup)$', val.strip(), re.I):
        return True
    return False


def is_standard_aa_change(pc: str) -> bool:
    """
    True for standard AA change notation that implies a change without an arrow.
    Three-letter: Ser83Leu, Leu466Ser
    One-letter:   D94A, S83L, A90V, S315T
    """
    if not pc:
        return False
    if re.match(r'^[A-Z][a-z]{2}\-?\d+[A-Z*]', pc.strip()):
        return True
    if re.match(r'^[A-Z]\d+[A-Z*]', pc.strip()):
        return True
    return False


def _ntp_contains_pc_num(ntp, pc):
    """
    Returns True if the position number from protein_change falls
    within the nucleotide_position field (handles ranges like 85-90).
    """
    if not ntp or not pc: return False
    pc_num = _extract_pos_from_pc(pc)
    if pc_num is None: return False
    ntp_s = str(ntp).strip().replace('−', '-')
    range_m = re.match(r'^(\-?\d+)[-–](\d+)$', ntp_s)
    if range_m:
        lo, hi = int(range_m.group(1)), int(range_m.group(2))
        return lo <= abs(pc_num) <= hi or lo <= pc_num <= hi
    ntp_num = _parse_num(ntp_s)
    return ntp_num is not None and ntp_num == pc_num


def apply_codon_snp_fix(aap, ntp, ntc, pc):
    """
    If protein_change position is contained in nucleotide_position:
      - codon change (GCA->GTG): ntp is actually AA position → move ntp→aap, clear ntp
      - single nt change (G>A):  protein_change is wrong notation → null protein_change
    """
    if not _ntp_contains_pc_num(ntp, pc):
        return aap, ntp, ntc, pc
    if is_codon_change(ntc):
        return ntp, '', ntc, pc   # move ntp → aap
    if is_single_nucleotide_change(ntc):
        return aap, ntp, ntc, ''  # null protein_change
    return aap, ntp, ntc, pc


def clean_mutation_positions(aap, ntp, ntc, pc):
    """
    Enforce position consistency between amino_acid_position and protein_change.

    If aa_pos matches position number in protein_change → confirmed protein entry:
        keep aa_pos + protein_change, null nucleotide_position + nucleotide_change.
    If aa_pos does NOT match (or protein_change has no position) → not a protein entry:
        null aa_pos + protein_change, keep nucleotide fields.
    If no aa_pos → leave as-is (pure nucleotide entry, no protein info to check).
    """
    aa_num = _parse_num(aap)
    pc_num = _extract_pos_from_pc(pc)

    if aa_num is None:
        return aap, ntp, ntc, pc

    if pc_num is not None and aa_num == pc_num:
        return aap, '', '', pc   # protein entry — null nucleotide fields

    # Arrow notation (S→T, R→L, S->T) has no embedded position number
    # but with aap present it IS a protein entry
    if pc_num is None and pc and re.search(r'[>\u2192]', pc):
        return aap, '', '', pc

    # Standalone indel/frameshift keyword — position comes from aap.
    # "frameshift" / "del" / "ins" carry no embedded position number and
    # no arrow, but with aap present they ARE protein-level entries.
    # Without this guard, clean_mutation_positions nulls out aap and pc,
    # causing Filter 4 to drop the row for missing position info.
    # NOTE: ntc is preserved (not cleared) for indels — "Ins A 38-39"
    # and "Del C 100" are the primary mutation description and should
    # remain available for normalised_gene_mutation computation.
    _INDEL_KW = {'frameshift', 'fs', 'deletion', 'del', 'insertion', 'ins',
                 'duplication', 'dup'}
    if pc_num is None and pc and pc.strip().lower() in _INDEL_KW:
        return aap, '', ntc, pc

    return '', ntp, ntc, ''      # not protein entry — null protein fields


# ── Load Bacteria_genes_all.txt ──────────────────────────────────────────────

def load_bacteria_genes(filepath: str):
    """
    Load Bacteria_genes_all.txt and return (names_set, None).
    Stores only slugged names for O(1) lookup. Precompiled regex for speed
    at 7M+ lines.
    """
    _slug_re = re.compile(r'[^a-z0-9]')
    names_set = set()
    with open(filepath, encoding='utf-8') as fh:
        for line in fh:
            name = line.strip()
            if not name or name.startswith('#'):
                continue
            names_set.add(_slug_re.sub('', name.lower()))
    return names_set, None


def _get_allele_candidates(name: str):
    """
    Generate base-name candidates from an allele name, in priority order.
    tetA1 → [teta1, teta], blaTEM-1 → [blatem1, blatem],
    aac(6)ib → [aac6ib, aac6i, aac6, aac], aadA27 → [aada27, aada]
    """
    n = _slug(name)
    candidates = [n]
    seen = {n}

    def add(c):
        c = c.strip()
        if c and len(c) >= 3 and c not in seen:
            candidates.append(c)
            seen.add(c)

    add(re.sub(r'\d+[a-z]?$', '', n))
    add(re.sub(r'\d+[a-z]+$', '', n))
    if len(n) > 4:
        add(re.sub(r'[a-z]$', '', n))
    m = re.match(r'^((?:aac|aph|ant|aad)\d+)(.*)', n)
    if m:
        add(m.group(1))
        add(re.sub(r'\d+$', '', m.group(1)))
    add(re.sub(r'\d+$', '', n))

    return candidates


def is_confirmed_bacterial_gene(gene_name: str, bacteria_names: set, was_normalised: bool) -> bool:
    """
    Return True if gene_name is a confirmed bacterial gene.
    was_normalised=True means already validated — always keep.
    """
    if was_normalised:
        return True
    for c in _get_allele_candidates(gene_name):
        if c in bacteria_names:
            return True
    return False


# ── Gene name cleaning (minimal — just remove obvious garbage) ───────────────

def is_promoter_mutation(r: dict, ntp: str) -> bool:
    """
    Returns True if this mutation row is a promoter mutation.

    Promoter mutations are exempt from Filter 6 (the recognised-antibiotic
    requirement): they alter expression of an existing gene rather than
    introducing a new resistance allele, so the paper's results sentence
    often doesn't restate the drug name right next to the mutation —
    it was usually already established earlier for the gene itself.
    Penalising these rows for a missing antibiotic name would systematically
    under-count exactly the promoter mutations we want in the database.

    Two independent signals, either of which is sufficient:
      1. Text signal: 'promoter' appears in position_in_molecule or
         mutation_type (e.g. "ampC promoter", "promoter mutation").
      2. Positional signal: nucleotide_position is negative. Negative
         numbering relative to the start codon is the standard AMR
         convention for upstream/promoter positions, so this still
         catches promoter mutations even when the model left the text
         fields empty (as happens with some terse extractions).
    """
    text_fields = ' '.join([
        str(r.get('position_in_molecule', '') or ''),
        str(r.get('mutation_type', '') or ''),
    ]).lower()
    if 'promoter' in text_fields:
        return True
    ntp_num = _parse_num(ntp)
    if ntp_num is not None and ntp_num < 0:
        return True
    return False


def is_garbage_gene_name(gene_name: str) -> bool:
    """
    Returns True if the gene name is obviously an artifact, not a real gene.
    Keeps chromosomal genes (gyrA, rpoB) since mutations ON those are valid here.
    """
    n = gene_name.strip()
    nl = n.lower()

    # Too short
    if len(n) <= 2:
        return True
    # Locus tags: bb28_rs06750, mbovpg45_rs01415
    if re.search(r'_rs\d{4,}', nl):
        return True
    if re.match(r'^[a-z0-9]{2,8}_\d{5,}$', _slug(n)):
        return True
    # Hallucinations: repeated chars
    if re.search(r'(.)\1{3,}', nl):
        return True
    # Pure numbers or punctuation
    if re.match(r'^[\d\W]+$', n):
        return True

    return False


# ── Core extraction ───────────────────────────────────────────────────────────

def extract_mutations_from_result(result):
    """
    Extract all mutations from a single paper result dict.
    Returns list of row dicts, one per mutation entry.
    Gene-level fields (encodes, wild_type_susceptible, notes) are
    repeated on every mutation row belonging to that gene.
    """
    pmid        = result.get('pmid', '')
    full_output = result.get('full_output', {})

    paper_title      = full_output.get('paper_title', '')
    publication_year = full_output.get('publication_year', '')

    mutations_dict = full_output.get('mutations', {})
    rows = []

    for gene_name, gene_data in mutations_dict.items():
        if not isinstance(gene_data, dict):
            continue
        if is_garbage_gene_name(gene_name):
            continue

        # Gene-level fields — repeated on every mutation row for this gene
        encodes               = gene_data.get('encodes', '') or ''
        wild_type_susceptible = gene_data.get('wild_type_susceptible', '') or ''
        notes                 = gene_data.get('notes', '') or ''

        mutations_found = gene_data.get('mutations_found', [])
        if not isinstance(mutations_found, list):
            mutations_found = []

        # No mutation entries — emit one gene-level row with empty mutation fields
        if not mutations_found:
            rows.append({
                'paper_pmid':            pmid,
                'paper_title':           paper_title,
                'publication_year':      publication_year,
                'gene_name':             gene_name,
                'encodes':               encodes,
                'notation':              '',
                'amino_acid_position':   '',
                'nucleotide_position':   '',
                'codon_change':          '',
                'nucleotide_change':     '',
                'protein_change':        '',
                'position_in_molecule':  '',
                'confers_resistance_to': '',
                'organisms_observed_in': '',
                'effect_on_function':    '',
                'mutation_type':         '',
                'validated_by':          '',
                'origin':                '',
                'evidence_level':        '',
                'wild_type_susceptible': wild_type_susceptible,
                'notes':                 notes,
                'normalised_gene_mutation':  '',
                'normalised_protein_change': '',
            })
            continue

        for mut in mutations_found:
            if not isinstance(mut, dict):
                continue
            rows.append({
                'paper_pmid':            pmid,
                'paper_title':           paper_title,
                'publication_year':      publication_year,
                'gene_name':             gene_name,
                'encodes':               encodes,
                'notation':              mut.get('notation', '') or '',
                'amino_acid_position':   mut.get('amino_acid_position', '') or '',
                'nucleotide_position':   mut.get('nucleotide_position', '') or '',
                'codon_change':          mut.get('codon_change', '') or '',
                'nucleotide_change':     mut.get('nucleotide_change', '') or '',
                'protein_change':        mut.get('protein_change', '') or '',
                'position_in_molecule':  mut.get('position_in_molecule', '') or '',
                'confers_resistance_to': array_to_string(mut.get('confers_resistance_to', [])),
                'organisms_observed_in': array_to_string(
                    mut.get('organisms_observed_in', []) or
                    mut.get('organisms_tested_in', [])
                ),
                'effect_on_function':    mut.get('effect_on_function', '') or '',
                'mutation_type':         mut.get('mutation_type', '') or '',
                'validated_by':          mut.get('validated_by', '') or '',
                'origin':                mut.get('origin', '') or '',
                'evidence_level':        mut.get('evidence_level', '') or '',
                'wild_type_susceptible': wild_type_susceptible,
                'notes':                 notes,
                'normalised_gene_mutation':  '',   # filled in filter loop
                'normalised_protein_change': '',   # filled in filter loop
            })

    return rows


def expand_plus_mutations(row: dict) -> list:
    """
    Expand ' + ' separated compound mutations into separate rows.
    "A90V + D94G"     → row(aap=90, pc=A90V) + row(aap=94, pc=D94G)
    "A74S + D94G + S95T" → 3 rows
    Single mutations pass through unchanged.
    """
    pc  = str(row.get('protein_change', '') or '').strip()
    aap = str(row.get('amino_acid_position', '') or '').strip()

    # Normalise separators: ', ', ' and ', ' + ' all split into individual mutations
    # 'L25S, L110P, N158K', 'A90V + D94G', 'A311V and T483S' → individual parts
    pc = re.sub(r'\s+and\s+', ' + ', pc, flags=re.I)
    if ', ' in pc:
        pc = pc.replace(', ', ' + ')
    if ' + ' not in pc:
        return [row]

    parts = [p.strip() for p in pc.split(' + ') if p.strip()]
    if len(parts) < 2:
        return [row]

    rows_out = []
    for part in parts:
        # Extract position from the mutation notation itself
        m = re.match(r'^[A-Z*]?(-?\d+)', part, re.I)
        if not m:
            m = re.match(r'^[A-Z][a-z]{2}(-?\d+)', part, re.I)
        pos = m.group(1) if m else aap  # fall back to original aap

        r2 = dict(row)
        r2['protein_change']       = part
        r2['amino_acid_position']  = pos
        r2['normalised_protein_change'] = make_normalised_protein_change(pos, part)
        rows_out.append(r2)
    return rows_out


def expand_slash_variants(row: dict) -> list:
    """
    Expand slash or 'or' variant notation into separate rows.
    H526Y/D, D94N/Y, S315T1/T2, S80L or S80W → one row per variant.
    """
    pc  = str(row.get('protein_change', '') or '').strip()
    aap = str(row.get('amino_acid_position', '') or '').strip()

    # Normalise " or " separator to "/"
    import re as _re
    pc_norm = _re.sub(r'\s+or\s+', '/', pc, flags=_re.I)

    if '/' not in pc_norm:
        return [row]

    parts = pc_norm.split('/')
    if len(parts) != 2:
        return [row]

    first, second = parts[0].strip(), parts[1].strip()

    m1 = re.match(r'^([A-Z*])(-?\d+)([A-Z*]|fs|del|ins|dup|stop|ter)\d*$', first, re.I)
    m2 = re.match(r'^([A-Z*])(-?\d+)([A-Z*]|fs|del|ins|dup|stop|ter)\d*$', second, re.I)

    if m1 and m2:
        # Both full: S80L/S80W
        variants = [first, second]
    elif m1 and re.match(r'^([A-Z*]|fs|del|ins|dup|stop|ter)$', second, re.I):
        # Single alt letter: H526Y/D → H526Y + H526D
        variants = [first, f"{m1.group(1)}{m1.group(2)}{second.upper()}"]
    elif m1 and re.match(r'^[A-Z]\d*$', second, re.I):
        # Variant number: S315T1/T2
        variants = [first, f"{m1.group(1)}{m1.group(2)}{second}"]
    elif re.match(r'^[A-Z*]-?\d+[A-Z*]$', first, re.I) and re.match(r'^[A-Z*]$', second, re.I):
        # Single alt letter no variant digit: D94N/Y
        m_f = re.match(r'^([A-Z*])(-?\d+)([A-Z*])$', first, re.I)
        if m_f:
            variants = [first, f"{m_f.group(1)}{m_f.group(2)}{second.upper()}"]
        else:
            return [row]
    else:
        return [row]

    rows_out = []
    for v in variants:
        r2 = dict(row)
        r2['protein_change'] = v
        r2['normalised_protein_change'] = make_normalised_protein_change(aap, v)
        rows_out.append(r2)
    return rows_out


FIELDNAMES = [
    'paper_pmid', 'paper_title', 'publication_year',
    'gene_name', 'encodes',
    'notation', 'amino_acid_position', 'nucleotide_position',
    'codon_change', 'nucleotide_change', 'normalised_gene_mutation',
    'protein_change', 'normalised_protein_change',
    'position_in_molecule', 'confers_resistance_to',
    'organisms_observed_in', 'effect_on_function', 'mutation_type',
    'validated_by', 'origin', 'evidence_level',
    'wild_type_susceptible', 'notes',
]


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 qwen3_mutations_to_csv.py <input_file> <output_file>")
        print("\nExample:")
        print("  python3 qwen3_mutations_to_csv.py extraction_summary.json mutations.csv")
        sys.exit(1)

    input_file  = sys.argv[1]
    output_file = sys.argv[2]

    # Load chromosomal gene list (optional — for reporting, not filtering)
    chromosomal_genes = set()
    chrom_path = REFERENCE_DATA / 'chromosomalMutationGenes.txt'
    if chrom_path.exists():
        chromosomal_genes = load_gene_list(str(chrom_path))
        print(f'✓ Loaded {len(chromosomal_genes) // 2:,} chromosomal mutation genes from {chrom_path.name}')
        print(f'  (chromosomal gene mutations are KEPT in this table)')
    else:
        print(f'⚠  chromosomalMutationGenes.txt not found')

    # Load Bacteria_genes_all.txt filter
    bacteria_names = None
    bacteria_path = REFERENCE_DATA / 'Bacteria_genes_all.txt'
    if bacteria_path.exists():
        bacteria_names, _ = load_bacteria_genes(str(bacteria_path))
        print(f'✓ Loaded {len(bacteria_names):,} bacterial gene names from {bacteria_path.name}')
        print(f'  → Mutation rows with unrecognised gene names will be removed')
    else:
        print(f'⚠  Bacteria_genes_all.txt not found — bacterial gene filter disabled')

    # Load antibiotic names filter
    antibiotic_set = None
    abx_path = REFERENCE_DATA / 'antibiotics_names_abreviations.txt'
    if abx_path.exists():
        antibiotic_set = load_antibiotics(str(abx_path))
        print(f'✓ Loaded {len(antibiotic_set):,} antibiotic names from {abx_path.name}')
        print(f'  → Rows with no recognised antibiotic in confers_resistance_to will be removed')
    else:
        print(f'⚠  antibiotics_names_abreviations.txt not found — antibiotic filter disabled')

    print(f'\n📖 Reading: {input_file}')
    try:
        with open(input_file, encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f'❌ File not found: {input_file}')
        sys.exit(1)

    results = data.get('results', {})
    print(f'✓ Loaded {len(results):,} papers '
          f'(success={data.get("success")}, '
          f'irrelevant={data.get("irrelevant")}, '
          f'errors={data.get("errors")})')

    print('📊 Processing mutations...')
    all_rows          = []
    skipped           = 0
    garbage_filtered  = 0
    bacteria_filtered = 0
    no_data_filtered  = 0   # no position AND no change info
    no_change_filtered = 0   # single state only, no actual change described
    abx_filtered      = 0   # no recognised antibiotic in confers_resistance_to
    promoter_exempted = 0   # promoter mutations kept despite no antibiotic name
    papers_with_muts  = 0
    total_papers      = len(results)

    for paper_n, (pmid, result) in enumerate(results.items(), start=1):
        if paper_n % 1000 == 0 or paper_n == 1:
            print(f'  paper {paper_n:,}/{total_papers:,}  |  '
                  f'mutations so far: {len(all_rows):,}  |  '
                  f'papers with mutations: {papers_with_muts:,}',
                  flush=True)

        if result.get('status') != 'success':
            skipped += 1
            continue

        rows = extract_mutations_from_result(result)
        kept = []
        for r in rows:
            gene_raw = r['gene_name']
            gene_sl  = _slug(gene_raw)

            # Filter 1: locus tags
            if re.search(r'_rs\d{4,}', gene_raw.lower()) or re.match(r'^[a-z0-9]{2,8}_\d{5,}$', gene_sl):
                garbage_filtered += 1
                continue
            # Filter 2: hallucinations
            # FIX: was `re.search(r'(.){3,}', ...)` — that pattern has no
            # backreference, so it matches ANY 3+ character string (it just
            # means "any character, 3+ times"), which silently rejected almost
            # every real gene name (gyrA, rrs, mcr-1, blaTEM-1, ...). The
            # correct check requires the SAME character repeated via \1,
            # which is what actually detects hallucinated strings like "xxxx".
            if re.search(r'(.)\1{3,}', gene_raw.lower()):
                garbage_filtered += 1
                continue
            # Filter 3: bacterial gene name check
            # Chromosomal mutation genes (gyrA, rpoB, rpsE, parC etc.) are always
            # kept in the mutations table regardless of bacteria filter —
            # they are the primary resistance mutation targets.
            is_chromosomal = (_slug(gene_raw) in {_slug(g) for g in chromosomal_genes}
                              if chromosomal_genes else False)
            if bacteria_names is not None and not is_chromosomal:
                if not is_confirmed_bacterial_gene(gene_raw, bacteria_names, False):
                    bacteria_filtered += 1
                    continue
            # Clean position consistency before filtering
            aap, ntp, ntc, pc = clean_mutation_positions(
                str(r.get('amino_acid_position', '') or ''),
                str(r.get('nucleotide_position',  '') or ''),
                str(r.get('nucleotide_change',    '') or ''),
                str(r.get('protein_change',       '') or ''),
            )
            # Apply codon/SNP fix: if ntp contains pc position,
            # codon change → move ntp to aap; single nt → null protein_change
            aap, ntp, ntc, pc = apply_codon_snp_fix(aap, ntp, ntc, pc)

            # Null protein_change if it contains invalid characters (?, !, #, etc.)
            # e.g. "TA?GT" is a garbled arrow notation, not a protein change
            if pc and re.search(r'[?!#@$%^&*]', pc):
                pc = ''

            # Non-coding RNA correction: for rRNA genes (23S, 16S, rrs, rrl)
            # protein_change is always a hallucination — the LLM maps the
            # nucleotide mutation onto an AA notation template even though
            # rRNA has no amino acids.  Three things happen in order:
            #
            # 1. amino_acid_position is moved to nucleotide_position FIRST
            #    (must happen before aap is cleared — position numbers for
            #    rRNA are always nucleotide coordinates, not AA coordinates).
            # 2. protein_change and amino_acid_position are cleared.
            # 3. notation is promoted to nucleotide_change when ntc is empty
            #    (the model typically writes the correct NT form — C2611T,
            #    A2059G — in the notation field even when it hallucinated
            #    a protein_change like "Cys2611Phe").
            if is_noncoding_rna_gene(gene_raw):
                # Step 1: move aap → ntp before clearing (order matters)
                if aap.strip() and not ntp.strip():
                    ntp = aap
                # Step 2: clear protein fields
                pc = ''
                aap = ''
                # Step 3: promote notation → nucleotide_change if ntc empty
                if not ntc.strip():
                    notation_val = str(r.get('notation', '') or '').strip()
                    if notation_val and (has_change_notation(notation_val) or
                            is_standard_aa_change(notation_val)):
                        ntc = notation_val
                        r['nucleotide_change'] = ntc

            r['amino_acid_position'] = aap
            r['nucleotide_position']  = ntp
            r['nucleotide_change']    = ntc
            r['protein_change']       = pc

            # Backfill nucleotide_position when NEITHER position field was
            # populated by the extraction. Two cases handled:
            #
            # Case 1 — prose description with trailing "at N":
            #   nucleotide_change = "C-to-T transition at -11"
            #   -> extracts "-11" via _extract_embedded_position()
            #
            # Case 2 — compact pre-normalised NT notation with embedded pos:
            #   nucleotide_change = "A2059G"  (no separate position field)
            #   -> extracts "2059" directly from the notation string
            #   This happens when the LLM writes the already-normalised form
            #   directly into nucleotide_change and omits nucleotide_position.
            #   Without this backfill such rows pass Filter 5 (compact NT
            #   pattern in has_change_notation) but die at Filter 4 because
            #   no position digit is found in either dedicated field.
            #
            # Only fires when both dedicated position fields are empty, so
            # it never overrides a real value from the extraction.
            if not ntp.strip() and not aap.strip():
                embedded_pos = _extract_embedded_position(ntc)
                if not embedded_pos:
                    # Try compact NT notation: A2059G -> "2059", C-15T -> "-15"
                    m_compact = re.match(r'^[ACGT](-?\d+)[ACGT]$', ntc.strip(), re.I)
                    if m_compact:
                        embedded_pos = m_compact.group(1)
                if embedded_pos:
                    ntp = embedded_pos
                    r['nucleotide_position'] = ntp

            # Sanity check: nucleotide_position > 10,000 → genomic coordinate,
            # not a within-gene position. Null it out.
            # No AMR gene exceeds ~2,500 bp; 10,000 is a safe upper bound.
            ntp_num = _parse_num(ntp)
            if ntp_num is not None and abs(ntp_num) > 10000:
                r['nucleotide_position'] = ''
                ntp = ''

            # Filter 4: at least one position field must contain a digit
            #           AND at least one change field must be non-empty.
            # "60 and 63" is valid (contains digits); "QRDR" or "" is not.
            has_position = (
                bool(re.search(r'\d', aap)) or
                bool(re.search(r'\d', ntp))
            )
            has_change = ntc.strip() or pc.strip()
            if not has_position or not has_change:
                no_data_filtered += 1
                continue

            # Compute normalised mutation strings
            # If protein_change is empty, try notation field as fallback
            pc_for_norm = pc
            if not pc_for_norm:
                notation_val = str(r.get('notation', '') or '').strip()
                if (has_change_notation(notation_val) or
                        is_standard_aa_change(notation_val)):
                    pc_for_norm = notation_val
            norm_nt = make_normalised_nt_mutation(aap, ntp, ntc, pc_for_norm)
            norm_aa = make_normalised_protein_change(aap, pc_for_norm)
            # If both normalised columns are identical, one of the two
            # normalisation functions matched a notation it shouldn't have
            # (e.g. "A514C" looks like a valid one-letter protein change
            # D94A-style notation even when it's really a nucleotide call on
            # a non-coding gene like rrs/16S rRNA). Disambiguate using
            # whichever position field was actually populated by the
            # extraction, rather than always discarding the nucleotide side.
            if norm_nt and norm_aa and norm_nt == norm_aa:
                ntp_filled = bool(ntp.strip())
                aap_filled = bool(aap.strip())
                if ntp_filled and not aap_filled:
                    # Only a nucleotide position was given — nucleotide entry
                    norm_aa = ''
                elif aap_filled and not ntp_filled:
                    # Only an amino-acid position was given — protein entry
                    norm_nt = ''
                else:
                    # Both filled, or neither filled — genuinely ambiguous;
                    # keep prior default (favor protein notation)
                    norm_nt = ''
            # Null normalised_protein_change if it contains a negative position
            # e.g. A-131T is nucleotide promoter notation, not a protein change
            if norm_aa and re.search(r'[A-Z*]-\d+[A-Z*]', norm_aa):
                norm_aa = ''
            r['normalised_gene_mutation']  = norm_nt
            r['normalised_protein_change'] = norm_aa

            # Filter: remove rows with no normalised form in either column
            if not norm_nt and not norm_aa:
                no_data_filtered += 1
                continue

            # Filter 5: nucleotide_change or protein_change must describe
            # an actual change (arrow notation or standard AA change format).
            # Removes single-state entries like TAC/Leu or CGC/Arg.
            ntc_val = str(r.get('nucleotide_change', '') or '')
            pc_val  = str(r.get('protein_change',   '') or '')
            if not (has_change_notation(ntc_val) or
                    has_change_notation(pc_val)  or
                    is_standard_aa_change(pc_val)):
                no_change_filtered += 1
                continue

            # Filter 6: confers_resistance_to must contain at least one
            # recognised antibiotic name — EXCEPT for promoter mutations,
            # which are exempt (see is_promoter_mutation docstring).
            if antibiotic_set is not None:
                if (not has_known_antibiotic(str(r.get('confers_resistance_to', '') or ''), antibiotic_set)
                        and not is_promoter_mutation(r, ntp)):
                    abx_filtered += 1
                    continue
                elif (not has_known_antibiotic(str(r.get('confers_resistance_to', '') or ''), antibiotic_set)
                        and is_promoter_mutation(r, ntp)):
                    promoter_exempted += 1

            # Expand compound mutations into separate rows
            # "A90V + D94G" → two rows; "H526Y/D" → two rows
            expanded = expand_plus_mutations(r)
            for r_exp in expanded:
                expanded2 = expand_slash_variants(r_exp)
                kept.extend(expanded2)
        if kept:
            papers_with_muts += 1
        all_rows.extend(kept)

    print(f'\n✓ Processed {total_papers - skipped:,} papers ({skipped} skipped)')
    print(f'  {papers_with_muts:,} papers had mutation data')
    print(f'  {garbage_filtered:,} rows removed (locus tags / hallucinations)')
    if bacteria_names is not None:
        print(f'  {bacteria_filtered:,} rows removed (gene not in Bacteria_genes_all.txt)')
    print(f'  {no_data_filtered:,} rows removed (missing position or change info)')
    print(f'  {no_change_filtered:,} rows removed (single state only, no actual change)')
    if antibiotic_set is not None:
        print(f'  {abx_filtered:,} rows removed (no recognised antibiotic in confers_resistance_to)')
        print(f'  {promoter_exempted:,} promoter-mutation rows kept despite no recognised antibiotic')
    print(f'  {len(all_rows):,} mutation rows retained')

    # Report chromosomal gene breakdown
    if chromosomal_genes:
        chrom_rows = sum(1 for r in all_rows if r['gene_name'].lower() in chromosomal_genes
                         or _slug(r['gene_name']) in chromosomal_genes)
        print(f'  {chrom_rows:,} rows for chromosomal resistance genes (gyrA, rpoB, etc.)')

    print(f'\n💾 Writing to: {output_file}')
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f'✅ Complete! Wrote {len(all_rows):,} rows to {output_file}')


if __name__ == '__main__':
    main()