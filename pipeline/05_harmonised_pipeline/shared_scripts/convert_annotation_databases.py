#!/usr/bin/env python3
"""
convert_annotation_databases.py
================================
Converts genes_annotation_databases.csv to the same column structure
as genes.csv produced by qwen3_to_csv.py.

Usage:
    python3 convert_annotation_databases.py genes_annotation_databases.csv genes_databases.csv
"""

import sys
import csv
import re
from pathlib import Path

# Import normalisation infrastructure from qwen3_to_csv.py, which lives in
# ../reslit/genes/ in this packaged layout (not the same directory as this
# script). allele_geneFamily.txt lives in ../reference_data/.
_script_dir = Path(__file__).resolve().parent
_reslit_genes_dir = _script_dir.parent / "reslit" / "genes"
_reference_data_dir = _script_dir.parent / "reference_data"
sys.path.insert(0, str(_reslit_genes_dir))
try:
    from qwen3_to_csv import (
        load_allele_gene_family,
        normalize_gene_name,
        _slug,
        _canonical,
    )
    _NORM_AVAILABLE = True
except ImportError:
    _NORM_AVAILABLE = False
    print("⚠  qwen3_to_csv.py not found — gene_name will equal gene_family (no normalisation)")


# ── Column mapping ────────────────────────────────────────────────────────────
#
# genes_annotation_databases.csv  →  genes.csv
# ─────────────────────────────────────────────────────────────────────────────
# gene_family                     →  gene_name        (also allele = same)
# subclass                        →  confers_resistance_to  (comma→pipe)
# class                           →  resistance_mechanism_class
# product_name                    →  encodes
# Resistance Mechanism            →  mechanism
# pubmed_reference                →  paper_pmid       (first PMID only)
# genbank_protein_accession +
#   genbank_nucleotide_accession  →  sequence_accessions (pipe-joined)
# Database                        →  source_database  (new column)
# Notes                           →  notes            (new column)
# ID                              →  (dropped — redundant with accession)
#
# Columns with no equivalent in annotation DBs → empty string:
#   paper_title, publication_year, paper_type, key_findings,
#   geographic_location, methodology, sample_size,
#   role_in_paper, validation_method, evidence_level,
#   key_substitutions, genetic_context_location, genetic_context_notes

FIELDNAMES = [
    'paper_pmid', 'paper_title', 'publication_year', 'paper_type',
    'key_findings', 'geographic_location', 'methodology', 'sample_size',
    'sequence_accessions', 'gene_name', 'allele', 'encodes', 'mechanism',
    'confers_resistance_to', 'resistance_mechanism_class', 'organisms_tested_in',
    'role_in_paper', 'validation_method', 'evidence_level', 'key_substitutions',
    'genetic_context_location', 'genetic_context_notes',
    # Extra columns present only in database entries
    'source_database', 'notes',
]


def clean(val):
    """Strip whitespace and replace sentinel dashes with empty string."""
    if val is None:
        return ''
    v = str(val).strip()
    return '' if v in ('-', 'NA', 'N/A', 'None', 'none') else v


def subclass_to_pipe(subclass: str) -> str:
    """
    Convert comma-separated subclass field to pipe-separated.
    'TOBRAMYCIN, GENTAMICIN' → 'TOBRAMYCIN|GENTAMICIN'
    """
    if not subclass:
        return ''
    parts = [p.strip() for p in subclass.split(',') if p.strip()]
    return '|'.join(parts)


def pubmed_first(pubmed_ref: str) -> str:
    """
    Take the first PMID from a comma-separated list.
    '8407825,40178262' → '8407825'
    """
    if not pubmed_ref:
        return ''
    parts = [p.strip() for p in pubmed_ref.split(',') if p.strip()]
    return parts[0] if parts else ''


def build_sequence_accessions(protein_acc: str, nucleotide_acc: str) -> str:
    """Pipe-join non-empty accessions."""
    parts = [a for a in [clean(protein_acc), clean(nucleotide_acc)] if a]
    return '|'.join(parts)


def convert(input_path: str, output_path: str):
    in_path  = Path(input_path)
    out_path = Path(output_path)

    if not in_path.exists():
        print(f'❌ File not found: {in_path}')
        sys.exit(1)

    # Load allele→family mapping if available
    mapping, families, slug_families, families_list, stripped_map = {}, {}, {}, [], {}
    if _NORM_AVAILABLE:
        allele_map_path = _reference_data_dir / 'allele_geneFamily.txt'
        if allele_map_path.exists():
            mapping, families, slug_families, families_list, stripped_map = \
                load_allele_gene_family(str(allele_map_path))
            print(f'✓ Loaded {len(mapping):,} allele keys / {len(families):,} families from {allele_map_path.name}')
        else:
            print('⚠  allele_geneFamily.txt not found — gene_name will equal gene_family')

    rows_in  = 0
    rows_out = 0

    with open(in_path, encoding='utf-8') as fin, \
         open(out_path, 'w', newline='', encoding='utf-8') as fout:

        reader = csv.DictReader(fin, delimiter='\t')
        writer = csv.DictWriter(fout, fieldnames=FIELDNAMES)
        writer.writeheader()

        for row in reader:
            rows_in += 1

            gene_name = clean(row.get('gene_family', ''))
            if not gene_name:
                continue  # skip rows with no gene family

            out = {
                # ── Paper-level fields (empty for DB entries) ─────────────
                'paper_pmid':           pubmed_first(clean(row.get('pubmed_reference', ''))),
                'paper_title':          '',
                'publication_year':     '',
                'paper_type':           '',
                'key_findings':         '',
                'geographic_location':  '',
                'methodology':          '',
                'sample_size':          '',
                # ── Gene-level fields ─────────────────────────────────────
                'sequence_accessions':  build_sequence_accessions(
                                            row.get('genbank_protein_accession', ''),
                                            row.get('genbank_nucleotide_accession', ''),
                                        ),
                'gene_name':            normalize_gene_name(
                                            gene_name,
                                            mapping, families,
                                            slug_families, families_list,
                                            stripped_map,
                                        ) if _NORM_AVAILABLE else gene_name,
                'allele':               gene_name,   # same as gene_name for DB entries
                'encodes':              clean(row.get('product_name', '')),
                'mechanism':            clean(row.get('Resistance Mechanism', '')),
                'confers_resistance_to': subclass_to_pipe(clean(row.get('subclass', ''))),
                'resistance_mechanism_class': clean(row.get('class', '')),
                'organisms_tested_in':  '',
                'role_in_paper':        '',
                'validation_method':    '',
                'evidence_level':       '',
                'key_substitutions':    '',
                'genetic_context_location': '',
                'genetic_context_notes': '',
                # ── Extra columns (DB-specific) ───────────────────────────
                'source_database':      clean(row.get('Database', '')),
                'notes':                clean(row.get('Notes', '')),
            }

            writer.writerow(out)
            rows_out += 1

    print(f'✓ Read    {rows_in:,} rows from {in_path.name}')
    print(f'✓ Wrote   {rows_out:,} rows to   {out_path.name}')
    print(f'  Skipped {rows_in - rows_out:,} rows (missing gene_family)')


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 convert_annotation_databases.py <input.csv> <output.csv>")
        print("\nExample:")
        print("  python3 convert_annotation_databases.py genes_annotation_databases.csv genes_databases.csv")
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2])


if __name__ == '__main__':
    main()