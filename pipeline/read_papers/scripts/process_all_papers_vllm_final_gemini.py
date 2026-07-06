#!/usr/bin/env python
"""
ResLit AMR Literature Mining Pipeline — Structured Extraction (Pass 1 + Pass 2)
================================================================================
Strict extraction of AMR genes & mutations from full-text papers using Qwen3-30B
via vLLM. Two-stage pipeline:
  Pass 1 — structured JSON extraction with whitelist-based validation
  Pass 2 — atomic auditor: field-by-field verification against paper text

Key design principles (locked v1.0):
  - PRECISION OVER RECALL. 1% FP at 400K papers = 4000 wrong entries → curator
    trust collapses. False negatives are invisible; most AMR genes appear in
    multiple papers anyway.
  - RESULTS-ONLY RULE. Extract only what THIS paper investigated, not what it
    cites from other work (Introduction/Discussion are full of citation traps).
  - VALIDATION GATE. Genes must be experimentally validated in THIS paper to
    appear in the genes section. WGS-only discovery is not enough.
  - REGULATORY/BIOSYNTHESIS GENES → MUTATIONS SECTION ONLY. mgrB, pmrA/B,
    phoP/Q, lpxA-T, arnB-T, etc. confer resistance only when mutated.
  - REVIEW PAPERS get bibliography-inference rules (codon_change=null,
    evidence_level="inferred", source="bibliography").
  - COMPUTATIONAL+VALIDATION PAPERS (e.g. fARGene-style HMM screening with
    cloning) extract validated genes by their internal family code.

Author: Ar (UT Austin), with pipeline support from Hanyu
Target: NAR Database Issue, June 30 deadline
"""

import os
import re
import json
import gc
import sys
import time
import argparse
import traceback
from pathlib import Path
from glob import glob
from typing import Any, Dict, List, Optional, Tuple

import torch
from vllm import LLM, SamplingParams
from transformers import AutoTokenizer

# =============================================================================
# CONFIG
# =============================================================================

MODEL_NAME              = "Qwen/Qwen3-30B-A3B"
HF_CACHE                = "/work/11252/skulakis/projects/reslit/hf_cache"

# --- THE FIX: Read from environment variables, fallback to defaults ---
PAPERS_DIR              = os.getenv("PAPERS_FOLDER", "/work/11252/skulakis/projects/reslit/read_papers/fulltext_txt")
OUTPUT_DIR              = os.getenv("OUTPUT_DIR", "/work/11252/skulakis/projects/reslit/read_papers/analyse_papers/results_vllm")
# ----------------------------------------------------------------------

GPU_MEMORY_UTILIZATION  = 0.92
MAX_MODEL_LEN           = 32768
#
DTYPE                   = "bfloat16"
TENSOR_PARALLEL_SIZE    = 1

EXTRACTION_MAX_TOKENS   = 12000      # full-paper extraction budget
CHUNK_MAX_TOKENS        = 8000       # tighter budget per chunk (perf fix)
AUDIT_MAX_TOKENS        = 4096       # per-entity audit budget

CHARS_LIMIT_DIRECT      = 66360      # below this → direct extraction
CHARS_LIMIT_PER_CHUNK   = 55000      # chunk this size
CHUNK_OVERLAP_CHARS     = 1000

BATCH_SIZE              = 1          # one paper at a time (papers can be 170K+ chars)
AUDIT_ENABLED           = True

# Audit-side paper text budget. The Qwen3 context is 32768 tokens. Each audit
# call already spends tokens on prompt template + entity JSON + reserved output
# (~4096). To stay safely under the limit we cap the paper text fed to the
# auditor at this many characters. For large papers we extract only the regions
# that mention the entity (see _build_audit_paper_context).
AUDIT_PAPER_MAX_CHARS   = 80000

os.environ["HF_HOME"]              = HF_CACHE
os.environ["TRANSFORMERS_CACHE"]   = HF_CACHE
os.environ["HF_HUB_CACHE"]         = HF_CACHE
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"


# =============================================================================
# SCHEMAS — canonical shapes for output
# =============================================================================

GENE_ENTRY_SCHEMA = {
    "allele": None,
    "encodes": None,
    "mechanism": None,
    "confers_resistance_to": [],
    "resistance_mechanism_class": None,
    "organisms_tested_in": [],
    "role_in_paper": None,
    "validation_method": None,
    "evidence_level": None,
    "key_substitutions": None,
    "genetic_context": None,
    "source": None,           # "bibliography" for review papers, else null
    "evidence_note": None,    # explanation when source == "bibliography"
}

MUTATION_ENTRY_SCHEMA = {
    "notation": None,
    "amino_acid_position": None,
    "nucleotide_position": None,
    "codon_change": None,
    "nucleotide_change": None,
    "protein_change": None,
    "position_in_molecule": None,
    "confers_resistance_to": [],
    "organisms_observed_in": [],
    "effect_on_function": None,
    "mutation_type": None,
    "validated_by": None,
    "origin": None,
    "evidence_level": None,
}

MUTATION_TARGET_SCHEMA = {
    "encodes": None,
    "mutations_found": [],
    "wild_type_susceptible": None,
    "notes": None,
    "source": None,           # "bibliography" for review papers, else null
    "evidence_note": None,    # explanation when source == "bibliography"
}

CANONICAL_RESULT_FIELDS = [
    "pmid", "status", "extraction_mode", "extracted_genes",
    "total_genes", "full_output"
]


# =============================================================================
# BLOCKLISTS — these are the core defense against over-extraction
# =============================================================================

# Genes that are NOT acquired AMR genes; they confer resistance only when mutated
# Includes: TCS, regulators, LPS biosynthesis, lipid A remodeling, sigma factors,
# efflux regulators, hopanoid, locus tags. These belong in mutations section ONLY.
CORE_GENE_HARD_BLOCKLIST = {
    # Two-component systems (regulators)
    "pmra", "pmrb", "pmrab", "pmrcab",
    "phop", "phoq", "phopq",
    "parr", "pars", "parrs",
    "colr", "cols", "colrs",
    "cprr", "cprs", "cprrs",
    "rppa", "rppb", "rppab",
    "qseb", "qsec", "qsebc",
    "basr", "bass", "basrs",
    "envz", "ompr", "envzompr",
    # Negative regulators / accessory
    "mgrb", "mgrr", "mica",
    # LPS biosynthesis / lipid A remodeling
    "lpxa", "lpxc", "lpxd", "lpxe", "lpxf", "lpxh", "lpxk", "lpxl", "lpxm",
    "lpxo", "lpxp", "lpxt",
    "arnb", "arnc", "arnd", "arne", "arnf", "arnt",
    "arnbcad", "arnbcadtef",
    "pmrc", "pmrcab", "pmre",
    "epta", "eptb", "eptc",
    "cpta", "ugd", "waal", "waap",
    "rfba", "lpsb", "galu",
    # Acylation / outer-membrane modification
    "msbb", "pagp", "pagl",
    # LPS transport
    "lpta", "lptb", "lptc", "lptd", "lpte", "lptf", "lptg",
    # Sigma factors
    "rpon", "rpoe", "rpos", "rpoh", "rpod",
    # Efflux regulators (NOT efflux pumps themselves)
    "mexr", "nalc", "nald", "mexz", "mext",
    "acrr", "marr", "mara", "soxr", "soxs", "ramr", "rama",
    # Hopanoid
    "isph", "hpnj",
    # rRNA hypersusceptibility alleles — neither belongs in "genes"
"16s", "16srna", "16srrna",
"23s", "23srna", "23srrna",
"12s", "12srna", "12srrna",
"rrna", "rrns", "rrnl",
}

# Prefixes that signal operon names rather than single genes
BLOCKED_PREFIXES = (
    "arnbcad", "pmrcab", "lpxabc", "phopq", "pmrab", "parrs", "colrs",
)

# Pattern for Pseudomonas aeruginosa locus tags (PA####) and similar
LOCUS_TAG_PATTERNS = [
    re.compile(r"^pa\d{3,5}$", re.IGNORECASE),
    re.compile(r"^pa14_\d+$", re.IGNORECASE),
    re.compile(r"^paerug_\d+$", re.IGNORECASE),
    re.compile(r"^orf\d+$", re.IGNORECASE),
    re.compile(r"^locus_\d+$", re.IGNORECASE),
]

# Keys that should never appear as mutation "target" names (operon names, etc.)
MUTATIONS_EXACT_BLOCKLIST = {
    "arnbcadtef", "arnbcad", "pmrcab", "lpxabc",
    "tcs", "two-component-system", "operon",
}

# Vague drug claims that should never stand alone as confers_resistance_to
VAGUE_MDR_TERMS = {
    "multiple antibiotics", "multidrug", "mdr", "various antibiotics",
    "antibiotics", "multiple drugs", "broad spectrum",
    "beta-lactams", "beta lactams",   # too vague without subclass
}

# Antibiotics by drug class (used for class-filter sanity check)
DRUG_CLASS_MAP = {
    "bla":   ["penicillin", "cephalosp", "carbapenem", "monobactam",
              "amoxicillin", "ampicillin", "piperacillin", "ticarcillin",
              "cefotaxime", "ceftazidime", "ceftriaxone", "cefepime",
              "cefoxitin", "cephalothin", "imipenem", "meropenem",
              "ertapenem", "doripenem", "aztreonam", "oxacillin",
              "cloxacillin", "methicillin", "sulbactam-durlobactam",
              "beta-lactam", "β-lactam"],
    "aac":   ["aminoglyc", "gentamicin", "tobramycin", "amikacin",
              "kanamycin", "neomycin", "netilmicin", "streptomycin",
              "spectinomycin", "kasugamycin", "sisomicin"],
    "aph":   ["aminoglyc", "gentamicin", "tobramycin", "amikacin",
              "kanamycin", "neomycin", "netilmicin", "streptomycin"],
    "aad":   ["aminoglyc", "streptomycin", "spectinomycin"],
    "ant":   ["aminoglyc", "streptomycin", "spectinomycin", "tobramycin"],
    "tet":   ["tetracycl", "doxycycl", "minocycl", "tigecycl"],
    "qnr":   ["quinolone", "fluoroquinolone", "ciprofloxacin",
              "norfloxacin", "levofloxacin", "moxifloxacin"],
    "erm":   ["macrolide", "lincosamide", "streptogramin", "mls",
              "erythromycin", "clindamycin", "azithromycin", "spiramycin",
              "tylosin", "telithromycin"],
    "mef":   ["macrolide", "erythromycin", "azithromycin"],
    "mph":   ["macrolide", "erythromycin", "azithromycin", "spiramycin",
              "tylosin", "telithromycin"],
    "van":   ["vancomycin", "teicoplanin", "glycopeptide"],
    "cfr":   ["chloramphenicol", "phenicol", "oxazolidinone", "linezolid",
              "lincosamide", "pleuromutilin", "streptogramin"],
    "optra": ["oxazolidinone", "linezolid", "phenicol", "chloramphenicol",
              "tedizolid"],
    "poxta": ["oxazolidinone", "linezolid", "phenicol", "chloramphenicol",
              "tedizolid"],
    "cat":   ["chloramphenicol", "phenicol"],
    "sul":   ["sulfonamide", "sulfa"],
    "dfr":   ["trimethoprim"],
    "mcr":   ["colistin", "polymyxin"],
    "fos":   ["fosfomycin"],
}

# Review-paper signals: 2+ hits in first 3000 chars → review
REVIEW_SIGNALS = [
    "this review", "in this review", "we review",
    "this article reviews", "review article",
    "summarizes the literature", "summarize current knowledge",
    "minireview", "mini-review", "mini review",
    "we discuss recent", "an overview of", "overview of mechanisms",
    "current understanding", "have been reported",
    "this paper reviews",
]


# =============================================================================
# EXTRACTION PROMPT (Pass 1) — locked v1.0
# =============================================================================

EXTRACTION_PROMPT = """You are an antimicrobial resistance (AMR) extraction system. Read the paper text below and output a JSON object describing the AMR genes and mutations characterized in THIS paper.

OUTPUT: a single JSON object only. Start with {{ immediately. No prose, no markdown.
{chunk_note}
================================================================================
SECTION 1 — SCOPE OF THE "genes" SECTION
================================================================================
The "genes" section holds acquired or intrinsic AMR genes whose wild-type
product directly confers resistance — i.e., the gene works on its own, no
mutation required. Examples of families that qualify:
  - Beta-lactamases (bla-prefixed enzymes)
  - Aminoglycoside-modifying enzymes (aac, aph, aad, ant)
  - Tetracycline / quinolone / macrolide / lincosamide / streptogramin
    resistance genes (tet, qnr, erm, mef, mph, lnu, lsa, vat, vgb, ...)
  - Phenicol / oxazolidinone resistance (cat, cfr, optrA, poxtA, ...)
  - Glycopeptide cassettes (vanA–G), polymyxin (mcr), fosfomycin (fos)
  - Sulfonamide / trimethoprim (sul, dfr)
  - Acquired efflux pumps reported as full operons (mexAB-OprM, acrAB-TolC,
    oqxAB, ...)
  - Novel AMR genes characterized for the first time in the paper, named by
    the authors (e.g. a paper describing a new bacitracin amidohydrolase
    might name it bahA). Include these when the paper experimentally
    demonstrates the resistance phenotype.

NAMING CONVENTION:
- Beta-lactamases: use the canonical "bla<FAMILY>-<N>" form as the JSON key,
  even when the paper writes the enzyme bare. The bare form names the enzyme;
  the gene name carries the "bla" prefix.
- Other AMR genes: use the name as written, preserving punctuation
  (e.g. "aac(6')-Ib", "tet(M)", "qnrS1").

What does NOT belong in "genes" (these go in "mutations" instead):
- Regulators whose mutation/loss is the resistance mechanism (TCS like
  pmrA/B, phoP/Q, parR/S, mgrB; efflux regulators like mexR, acrR; sigma
  factors; etc.)
- Biosynthesis / cell-envelope genes (lpxA-T, arnB-T, eptA-C, waaL, pagP,
  cell-wall remodeling enzymes)
- Chromosomal core genes whose mutation creates resistance (gyrA, parC,
  rpoB, rpsL, folA, ompK35/36, PBPs, rRNAs)
- Locus tags (PA####, ORF####, locus_####)

Special allowance — when genes are named with internal family codes such
as "C1264", "E449", use as gene name the overall gene family and the specific name as 
allele. When the paper validates them experimentally, extract
each validated gene using its internal identifier as the key.

================================================================================
SECTION 2 — THE RESULTS-ONLY RULE (single most important filter)
================================================================================
Extract ONLY genes and mutations that represent THIS paper's OWN findings.
A gene belongs in the output if and only if it appears in:
  ✓ The Results section with experimental data generated in this study
  ✓ A table of THIS paper's own results (MIC, gene characterization, mutations)
  ✓ The Methods section as a gene cloned or assayed in this study
  ✓ The abstract as a finding of this study

EXCLUDE genes that appear only in:
  ✗ Introduction as background or context ("X was previously reported...")
  ✗ Discussion as comparison to other work ("similar to what Y et al. found...")
  ✗ Reference list citations
  ✗ Any sentence containing: "previously", "reported by", "described by",
    "identified by", "according to", "et al.", "was shown to", "has been"
    when referring to other groups' work

THE TEST: "Did the authors of THIS paper generate new data about this gene?"
  YES → include    NO → exclude

EXCEPTION — allele-characterization papers:
For papers that name new alleles AND deposit sequences AND perform functional tests
(hydrolysis, MIC on transformant, or susceptibility testing of the native strain),
extract ONLY the alleles that were functionally tested, NOT the full WGS-discovered list.
WGS-only discovery without any functional data does NOT qualify.

================================================================================
SECTION 3 — VALIDATION GATE (the second filter)
================================================================================
DIRECTION OF RESISTANCE CHECK:
AMR genes and mutations confer RESISTANCE — they reduce susceptibility of a
microorganism to a drug. If the experimental finding is the OPPOSITE —
increased susceptibility, hypersusceptibility, sensitization, or enhanced
drug toxicity — the entry does NOT belong in genes or mutations.
This applies regardless of how thoroughly the phenotype is characterized.

A gene passes into the "genes" section only if ALL three conditions are met:
  (a) It was experimentally validated in THIS paper AND the validation demonstrated
    an ANTIMICROBIAL RESISTANCE PHENOTYPE — meaning a change in MIC, zone of
    inhibition, growth in the presence of an antibiotic, or enzyme activity against
    an antibiotic substrate. The following do NOT qualify as AMR validation:
      - Macrophage survival or intracellular survival assays
      - Apoptosis induction assays
      - Animal infection models (LD50, mucin model, etc.)
      - Invasion or adherence assays
      - Virulence phenotypes of any kind
      - Complementation of a virulence defect
    A gene characterized only for its role in pathogenesis, metabolism, or host
    interaction MUST NOT appear in "genes" even if extensively validated.
  (c) The wild-type gene confers resistance WITHOUT requiring a mutation
      (i.e., it is an acquired or intrinsic resistance gene, not a regulator
      whose loss-of-function alters susceptibility)

If (b) fails — i.e., the gene confers resistance only when mutated or inactivated —
the entry belongs in the MUTATIONS section, not the genes section.

================================================================================
SECTION 3b — REGULATORY / LOSS-OF-FUNCTION / BIOSYNTHESIS GENES
================================================================================
These genes ALWAYS go in the MUTATIONS section, never the genes section, because
the wild-type does not confer resistance — only mutations or inactivation do:

  Two-component systems: pmrA, pmrB, phoP, phoQ, parR, parS, colR, colS,
    cprR, cprS, rppA, rppB, qseB, qseC, basR, basS, envZ, ompR
  Negative regulators: mgrB, mgrR, micA
  LPS biosynthesis: lpxA, lpxC, lpxD, lpxE, lpxF, lpxH, lpxK, lpxL, lpxM,
    lpxO, lpxP, lpxT, arnB, arnC, arnD, arnE, arnF, arnT, pmrC, pmrE,
    eptA, eptB, eptC, cptA, ugd, waaL, waaP, rfbA, lpsB, galU
  Acylation: msbB, pagP, pagL
  LPS transport: lptA-G
  Sigma factors: rpoN, rpoE, rpoS, rpoH, rpoD
  Efflux regulators: mexR, nalC, nalD, mexZ, mexT, acrR, marR/marA, soxR/soxS,
    ramR/ramA
  Hopanoid: isph, hpnJ
  Locus tags: PA####, PA14_####, ORF####, locus_#### — never extract as genes

Also: language patterns "mutations in X", "inactivation of X", "loss-of-function
in X", "disruption of X", "ΔX confers" → mutations section regardless of family.

================================================================================
SECTION 4 — DRUG CLASS RULES (assignment must match family)
================================================================================
HARD EXCLUSIONS (these are common hallucinations):
  - bla genes do NOT confer fluoroquinolone, colistin, vancomycin, or
    aminoglycoside resistance
  - aac/aph/aad genes do NOT confer beta-lactam, fluoroquinolone, or
    colistin resistance
  - qnr genes do NOT confer beta-lactam or vancomycin resistance
  - tet genes do NOT confer beta-lactam or vancomycin resistance
  - mcr genes confer ONLY colistin / polymyxin resistance

Legitimate multi-class genes (preserve all valid classes):
  - cfr: MLS + oxazolidinones + phenicols + pleuromutilins (MOLPS)
  - optrA, poxtA: oxazolidinones + phenicols
  - erm: macrolides + lincosamides + streptogramin B (MLS)
  - broad efflux pumps (mexAB-OprM, acrAB-TolC): multiple classes ARE valid

Prefer to use the specific antibiotic name(s) compared to vague terms alone ("multidrug", "multiple antibiotics",
"beta-lactams"). 

================================================================================
SECTION 5 — TABLE EXTRACTION (MANDATORY)
================================================================================
Tables are the PRIMARY source of structured AMR data. Scan EVERY table before
writing JSON. Failure to extract from tables is the most common error.

FOR EVERY TABLE:
  1. Read every row AND every column header
  2. Identify which columns contain gene/allele names, mutation notations,
     MIC values, organism names, or antibiotic names
  3. Extract EVERY named gene or mutation that passes the validation gate
  4. Do not stop at the first family — if a table has OXA, ADC, NDM, KPC
     columns, all families must be extracted

MUTATION TABLES specifically:
  - Every row → a separate mutation entry
  - Column headers map to fields: position → amino_acid_position,
    substitution → notation + protein_change, MIC → confers_resistance_to
  - Different genes in different columns → separate entries in mutations section

GENE CHARACTERIZATION TABLES:
  - Cloned genes with MIC values → extract each gene with specific MICs as
    confers_resistance_to
  - Enzyme kinetics tables → extract Km/kcat if present

DO NOT extract from:
  - Whole-isolate MIC tables (MIC for entire clinical isolate, not specific
    cloned gene) → do not use for confers_resistance_to
  - Epidemiological tables with isolate metadata only
  - Reference tables citing other studies


================================================================================
SECTION 6 — ANTI-HALLUCINATION & NON-CODING MUTATIONS
================================================================================
- Do NOT invent codon changes, nucleotide changes, positions, or organisms.
- If the paper does not state a field explicitly, set it to null (do not guess).
- Do NOT copy mutation notations verbatim across different genes.
- Do NOT generate gene entries that share identical (encodes, mechanism,
  confers_resistance_to, organisms, validation_method) tuples — this is the
  copy-paste loop signature.
- If a gene name appears only in the bibliography or a reference list, exclude it.

For mutations in NON-CODING regions (promoter, RBS, UTR, intergenic — anywhere
outside the protein-coding sequence):
  - protein_change = null, amino_acid_position = null
  - Use nucleotide_change and nucleotide_position
  - position_in_molecule describes the regulatory region
  - The associated gene appears in BOTH "genes" (the wild-type enzyme is the
    AMR gene) and "mutations" (the regulatory change is the mechanism).

================================================================================
SECTION 7 — COMPUTATIONAL + EXPERIMENTAL VALIDATION PAPERS
================================================================================
For papers that computationally discover new gene families AND experimentally
validate representative genes (cloning + MIC or disk diffusion):
  - Set paper_type = "computational_with_validation"
  - Extract EACH experimentally validated gene as its own entry in "genes" using as gene name the overall gene family in which it belongs
  - confers_resistance_to = the actual phenotype observed in validation
  - validation_method = brief description (e.g. "cloning in E. coli + disk diffusion")
  - evidence_level = "computational_with_wet_lab_validation"
  - role_in_paper = "experimentally_characterized"
  - Set resistance_mechanism_class if the paper indicates the closest known
    homolog family (e.g. "aminoglycoside acetyltransferase")
  - Genes that were computationally predicted but NOT experimentally validated
    in this paper → do NOT extract

================================================================================
SECTION 8 — OUTPUT STRUCTURE
================================================================================
STRUCTURAL RULE: Gene entries NEVER carry a "mutations_found" field.

{{
  "pmid": "<pmid string>",
  "relevant": true | false,
  "paper_title": "<title>",
  "publication_year": "<year>",
  "paper_type": "single_gene" | "multi_gene_resistome" | "review" |
                "computational_with_validation",
  "genes": {{
    "<gene_name>": {{ ...GENE_ENTRY_SCHEMA fields only — NO mutations_found here... }}
  }},
  "mutations": {{
    "<target_gene>": {{
      "encodes": "what type of product this gene encodes",
      "mutations_found": [ {{ ...MUTATION_ENTRY_SCHEMA fields... }} ],
      "wild_type_susceptible": "yes" | "no" | null,
      "notes": null | "<string>"
    }}
  }},
  "sequence_accessions": [ "<accession>", ... ],
  "key_findings": "<1-2 sentence summary of paper's main AMR findings>",
  "methodology": "<1 sentence on experimental methods used>",
  "geographic_location": [ "<region>", ... ],
  "sample_size": "<string>"
}}

FIELD NOTES:
organisms_tested_in should almost never be empty. Look for:
  - The bacterial species the gene was cloned or isolated from (check
    the paper title, abstract, and Methods — it is almost always there)
  - The expression host used for MIC testing (commonly E. coli)
  - Any species named in susceptibility or MIC testing
  Use standard binomial nomenclature with serovar/strain where given
  (e.g. "Salmonella enterica serovar Typhimurium DT104", not just
  "Salmonella"). If the gene is from organism A and tested in organism B,
  list both. Only leave empty if the paper truly names no organism at all.
  
If the paper is not AMR-relevant at all, return:
{{"pmid": "<pmid>", "relevant": false, "genes": {{}}, "mutations": {{}}}}

================================================================================
SECTION 9 — SELF-CHECK (run before output)
================================================================================
Step 0 — GATE CHECK 
 DIRECTION CHECK (run before everything else):
Ask: "Does this gene/mutation REDUCE susceptibility of a microorganism to
an antimicrobial agent?"
  YES → proceed to other checks
  NO, or the effect is INCREASED susceptibility / drug toxicity / 
  sensitization → remove from output entirely

SUBJECT CHECK:
Ask: "Is the resistance or susceptibility phenotype measured in a
microorganism (bacterium, fungus, parasite)?"
  YES → proceed
  NO (phenotype is in human cells, animal tissue, mitochondria of
  eukaryotic cells, hair cells, etc.) → remove from output entirely

  Step 0a — GATE CHECK each entry in "genes":
  (a) Does the gene name belong to a recognized AMR family OR is it a validated
      gene in the papers?
  (b) Was the gene experimentally validated in THIS paper?
  (c) Does the wild-type confer resistance without mutation?
  If any answer is NO → remove from "genes" (move to mutations if appropriate).

Step 1 — Results-only check: every gene/mutation must appear in Results, Methods
(as cloned/assayed in this study), Tables, or Abstract findings.

Step 2 — Drug-class check: each confers_resistance_to entry must be consistent
with the gene family.

Step 3 — Hallucination check: any codon_change, nucleotide_change, or position
not literally written in the paper → set to null.

Step 4 — Table coverage: did you scan every table? Recount.

================================================================================
PAPER TEXT
================================================================================
{paper_text}
"""


# =============================================================================
# AUDITOR PROMPT (Pass 2) — atomic field verification
# =============================================================================

AUDITOR_COMPREHENSIVE_PROMPT = """You are a strict AMR data auditor. You are given:
  1. The full text of a paper
  2. A single extracted entity (gene OR mutation target) as a JSON object

YOUR JOB: For EACH field in the JSON object, point to the EXACT sentence in the
paper that supports the value. If you cannot find explicit support, SET the field
TO NULL (do not omit it).

OUTPUT: a single JSON object containing the audited entity. Start with {{ immediately.
No prose, no markdown, no explanation. If the entity should be removed entirely
(no support in paper, or misclassified), return an empty object: {{}}.

RULES:
  - MISCLASSIFICATION CHECK (CRITICAL): Acquired AMR "genes" confer resistance in their wild-type form just by being present.
    * If ENTITY TYPE is "Gene", you MUST return {{}} to completely remove it if the paper implies ANY of the following:
      a) It is an "intrinsic", "baseline", or "endogenous" resistance determinant.
      b) Disrupting, knocking out, or mutating the gene causes SUSCEPTIBILITY, "supersusceptibility", or an "MIC reduction".
      c) Mutations, overexpression, or loss-of-function are required to gain resistance.
      d) A gene where the text specifies that "mutations", "amino acid changes", or "truncations" are what confer resistance.
      e) It is a core structural/biosynthesis gene (e.g., LPS, cell wall, glycosyl transferase) or a general regulatory gene (e.g., response regulator, two-component system).
      f) The paper's only experimental validation of this gene involves
         virulence, pathogenesis, or host-interaction phenotypes (macrophage
         survival, apoptosis, invasion, LD50, animal models) with no
         antimicrobial susceptibility data directly attributed to this gene.
         A gene validated only for virulence is NOT an AMR gene.

  - Find the specific section in the papers to check each field validity. SET fields to NULL when unsupported. Do not delete them.
  - Set codon_change, nucleotide_change, nucleotide_position to NULL UNLESS the paper
    explicitly writes them (e.g. "AGG→TAT", "G249T", "position 249"). Verbatim
    only — do not infer from amino-acid change.
  - For drug classes: if the papers does not state specifically that this gene family confers resistance to a given
    antibiotic, remove that antibiotic. Do not rely on inference from family name alone.
  - organisms_tested_in / organisms_observed_in: This field should almost
    never be empty. Actively search the paper for:
      * The species the gene was cloned or isolated FROM (e.g. "from
        Salmonella typhimurium DT104")
      * The host used for functional testing (e.g. E. coli transformants)
      * Any species named in MIC testing, disk diffusion, or susceptibility
        assays
    If the paper studies a gene from organism A expressed in organism B,
    list both. Use standard binomial nomenclature with strain/serovar where
    given (e.g. "Salmonella enterica serovar Typhimurium DT104"). Check the
    title, abstract, and Methods section — the organism is almost always
    named in at least one of these. Only leave empty if the paper truly
    does not name any organism.

  - For mutation targets: if the paper does not explicitly state that "mutations in X" or "inactivation of X" confers resistance 
    to the specified drug, remove the drug from confers_resistance_to. Do not rely on inference from family name alone.

ENTITY TYPE: {entity_type}
ENTITY NAME: {entity_name}
ENTITY DATA:
{entity_json}

PAPER TEXT:
{paper_text}

AUDITED JSON OBJECT:
"""

# =============================================================================
# UTILITIES
# =============================================================================

# Non-bla AMR gene prefixes — used to EXCLUDE these from beta-lactamase
# normalization. Any uppercase-letter name with an allele number is treated
# as a probable beta-lactamase enzyme UNLESS its leading letters match one
# of these prefixes. This is a denylist (specific things to skip) rather
# than an allowlist (enumerated enzyme names), so the rule generalizes to
# new beta-lactamase families without code changes.
NON_BLA_GENE_PREFIXES = {
    "aac", "aph", "aad", "ant", "tet", "qnr", "erm", "mef", "mph",
    "vat", "vgb", "vga", "lnu", "lsa", "cfr", "cat", "sul", "dfr",
    "van", "mcr", "fos", "mdf", "rmt", "arr", "rph", "qep", "oqx",
    "fex", "qac", "msr", "pmr", "phop", "phoq", "gyr", "par", "rpo",
    "rps", "rpl", "omp", "pbp", "fol", "mur", "fus", "tuf",
}


def _looks_like_bla_allele(name: str) -> bool:
    """Heuristic: does this name look like a beta-lactamase enzyme written
    without the 'bla' prefix?

    Pattern: 2-6 letters (with optional '-M' for the CTX-M family) followed
    by a hyphen and a positive integer (optionally with a letter suffix).
    The leading letters must NOT match a known non-bla AMR gene prefix.

    Examples that match: ADC-56, OXA-23, CTX-M-15, KPC-2, NDM-1, TEM-1,
      SHV-12, CMY-2, DHA-1, ACT-7, FRI-1, GIM-1, IMP-4, VIM-2, GES-5,
      BEL-1, CARB-8, PER-1, VEB-1, MIR-1, FOX-3, MOX-1, TLA-1, ACC-1,
      CFE-1, LAP-1 — any beta-lactamase enzyme of this form, enumerated or not.
    Examples that don't match: aac(6')-Ib (parens), gyrA (no number),
      pmrA (no hyphen-number), tet(M) (parens), van-A (van excluded),
      aac-3 (aac excluded), PA1234 (locus tag prefix)."""
    if not isinstance(name, str):
        return False
    s = name.strip()
    if not s or s.lower().startswith("bla"):
        return False
    m = re.match(r"^([A-Za-z]{2,6}(?:-[Mm])?)-(\d+[A-Za-z]?)$", s)
    if not m:
        return False
    family_root = m.group(1).lower().replace("-m", "")
    for prefix in NON_BLA_GENE_PREFIXES:
        if family_root.startswith(prefix):
            return False
    return True


def _normalize_gene_key(name: str) -> str:
    """Normalize a gene name to canonical form.

    - "ADC-56"     -> "blaADC-56"   (pattern-detected beta-lactamase allele)
    - "OXA-23"     -> "blaOXA-23"
    - "CTX-M-15"   -> "blaCTX-M-15"
    - "bla OXA-23" -> "blaOXA-23"   (whitespace cleanup)
    - "bla-OXA-23" -> "blaOXA-23"
    - "blaOXA-23"  -> "blaOXA-23"   (already canonical)
    - "gyrA"       -> "gyrA"         (no number, not normalized)
    - "aac(6')-Ib" -> "aac(6')-Ib"   (has parens, not a bla pattern)
    - "tet-1"      -> "tet-1"        (tet is on the non-bla denylist)

    Pattern-based detection — generalizes to ANY beta-lactamase enzyme of the
    form 'XXX-N' (or 'XXX-M-N' for CTX-M-style) that doesn't collide with a
    known non-bla AMR gene prefix. No enumerated allowlist of enzyme names."""
    if not isinstance(name, str):
        return name
    s = name.strip()
    if not s:
        return name
    if s.lower().startswith("bla "):
        s = "bla" + s[4:].lstrip()
    elif s.lower().startswith("bla-"):
        s = "bla" + s[4:].lstrip("-").lstrip()
    if s.lower().startswith("bla"):
        return s
    if _looks_like_bla_allele(s):
        m = re.match(r"^([A-Za-z]{2,6}(?:-[Mm])?)-(\d+[A-Za-z]?)$", s)
        if m:
            family = m.group(1).upper().replace("-M", "-M")
            return f"bla{family}-{m.group(2)}"
    return s


# Signals that a mutation is in a non-coding regulatory region (promoter,
# Pribnow box, ribosome binding site, etc.) rather than the coding sequence.
PROMOTER_REGION_TERMS = (
    "promoter", "pribnow", "-10", "-35", "regulatory", "consensus",
    "ribosome binding", "rbs", "upstream", "5'", "untranslated",
    "utr", "non-coding", "intergenic", "operator", "shine-dalgarno",
)


def _looks_like_promoter_or_regulatory_mutation(mut: Dict[str, Any]) -> bool:
    """Detect promoter / regulatory / non-coding mutations.

    These are mutations where the SEQUENCE LOCATION is regulatory (not in the
    coding region of the protein), so the resistance mechanism is
    overexpression of the WILD-TYPE gene rather than a new allele with an
    altered protein. They MUST stay in the mutations section, not be lifted
    into key_substitutions of a gene entry."""
    if not isinstance(mut, dict):
        return False
    pim = (mut.get("position_in_molecule") or "").lower()
    if any(sig in pim for sig in PROMOTER_REGION_TERMS):
        return True
    mut_type = (mut.get("mutation_type") or "").lower()
    if any(t in mut_type for t in ("promoter", "regulatory", "non-coding")):
        return True
    # Nucleotide-only signature: has nucleotide_change/position but no
    # protein-level change/position
    has_nt = bool(mut.get("nucleotide_change") or mut.get("nucleotide_position"))
    has_protein = bool(mut.get("protein_change") or mut.get("amino_acid_position"))
    if has_nt and not has_protein:
        return True
    # Notation looks like a pure nucleotide change with no protein info
    notation = str(mut.get("notation") or "")
    if re.match(r"^[ACGTU]\d+[ACGTU]$", notation, re.IGNORECASE) and not has_protein:
        return True
    return False


def _looks_like_protein_substitution(notation: str) -> bool:
    """True if `notation` looks like a coding-region amino-acid substitution
    (e.g. 'R148Q', 'S83I'). False for nucleotide changes like 'G249T'."""
    if not isinstance(notation, str):
        return False
    s = notation.strip()
    # Standard amino-acid substitution: letter + digits + letter/stop
    if not re.match(r"^[A-Z]\d+[A-Z*]$", s):
        return False
    # Reject pure-nucleotide letters (A, C, G, T, U) on both ends — that's a
    # nucleotide change, not a protein substitution.
    if s[0] in "ACGTU" and s[-1] in "ACGTU":
        return False
    return True


def _lift_misclassified_bla_alleles_from_mutations(result: Dict[str, Any]) -> Dict[str, Any]:
    """Reconcile beta-lactamase alleles that appear in `mutations`.
    
    Only handles Case A: Allele-defining coding substitutions. 
    Lifts to genes['blaXXX'] and DELETES from mutations.
    Skips anything without explicit protein substitutions to protect regulatory data.
    """
    if not isinstance(result, dict):
        return result
    mutations = result.get("mutations") or {}
    genes = result.get("genes") or {}
    if not isinstance(mutations, dict) or not isinstance(genes, dict):
        return result

    candidates: List[Tuple[str, str, Dict[str, Any]]] = []
    for target_name, mut_data in list(mutations.items()):
        if target_name.startswith("_") or not isinstance(mut_data, dict):
            continue
        normalized = _normalize_gene_key(target_name)
        if not normalized.lower().startswith("bla"):
            continue
        # Must parse as 'blaXXX-N' (with an allele/family number)
        if not re.match(r"^bla[A-Z]+(?:-[Mm])?-\d+", normalized):
            continue
        candidates.append((target_name, normalized, mut_data))

    for target_name, bla_form, mut_data in candidates:
        muts = mut_data.get("mutations_found") or []
        
        # Protect explicitly marked promoter mutations
        any_promoter = any(
            _looks_like_promoter_or_regulatory_mutation(m)
            for m in muts if isinstance(m, dict)
        )
        if any_promoter:
            continue

        # Gather substitutions
        substitutions: List[str] = []
        antibiotics: List[str] = []
        organisms: List[str] = []
        
        for m in muts:
            if not isinstance(m, dict):
                continue
            n = m.get("notation") or m.get("protein_change")
            if n and _looks_like_protein_substitution(n) and n not in substitutions:
                substitutions.append(n)
            for a in (m.get("confers_resistance_to") or []):
                if a not in antibiotics:
                    antibiotics.append(a)
            for o in (m.get("organisms_observed_in") or []):
                if o not in organisms:
                    organisms.append(o)

        # 🛑 THE FIX: If no explicit coding substitutions were found, it might be 
        # a vague regulatory/promoter mutation. Abort the lift and leave it safely in mutations.
        if not substitutions:
            continue

        key_subs = ", ".join(substitutions)
        allele_only = bla_form[3:]   # strip "bla" prefix → "ADC-56"
        notes = mut_data.get("notes")
        
        new_entry = {
            "allele": allele_only,
            "encodes": "beta-lactamase",
            "mechanism": notes,
            "confers_resistance_to": antibiotics,
            "resistance_mechanism_class": "enzymatic_inactivation",
            "organisms_tested_in": organisms,
            "role_in_paper": "experimentally_characterized",
            "validation_method": None,
            "evidence_level": "experimental",
            "key_substitutions": key_subs,
            "genetic_context": None,
        }
        
        # Merge with existing gene entry if present
        if bla_form in genes and isinstance(genes[bla_form], dict):
            existing = genes[bla_form]
            for k, v in new_entry.items():
                if v and not existing.get(k):
                    existing[k] = v
                elif isinstance(v, list) and isinstance(existing.get(k), list):
                    for item in v:
                        if item not in existing[k]:
                            existing[k].append(item)
        else:
            genes[bla_form] = new_entry

        # Move out of mutations
        if target_name in mutations:
            del mutations[target_name]
            
        print(f"  🔁 lifted misclassified beta-lactamase allele "
              f"'{target_name}' → genes['{bla_form}'] "
              f"(substitutions: {key_subs})")

    result["genes"] = genes
    result["mutations"] = mutations
    return result


def _normalize_gene_keys_in_dict(result: Dict[str, Any]) -> Dict[str, Any]:
    """Rename gene keys to canonical form: 'adc-56' → 'blaADC-56', etc."""
    genes = result.get("genes") or {}
    if not isinstance(genes, dict):
        return result
    new_genes: Dict[str, Any] = {}
    for name, data in genes.items():
        if name.startswith("_"):
            new_genes[name] = data
            continue
        canonical = _normalize_gene_key(name)
        if canonical != name:
            print(f"  ✏  normalized gene key: '{name}' → '{canonical}'")
        # If a canonical version already exists, merge into it
        if canonical in new_genes and isinstance(new_genes[canonical], dict) \
                and isinstance(data, dict):
            for k, v in data.items():
                if v and not new_genes[canonical].get(k):
                    new_genes[canonical][k] = v
        else:
            new_genes[canonical] = data
    result["genes"] = new_genes
    return result


def _normalize_antibiotic(name: str) -> str:
    if not isinstance(name, str):
        return ""
    return name.strip().lower()


def _get_gene_family_prefix(gene_name: str) -> Optional[str]:
    """Return the 3-letter family prefix of a gene if recognized, else None."""
    if not gene_name:
        return None
    # Normalize first so 'ADC-56' is correctly identified as bla family
    g = _normalize_gene_key(gene_name).strip().lower()
    g = re.sub(r"^bla[\s_-]*", "bla", g)
    for prefix in ["bla", "aac", "aph", "aad", "ant", "tet", "qnr", "erm",
                   "mef", "mph", "vat", "vgb", "vga", "lnu", "lsa", "cfr",
                   "optra", "poxta", "cat", "sul", "dfr", "van", "mcr",
                   "fos", "mdf"]:
        if g.startswith(prefix):
            return prefix
    return None


def _get_allowed_class(gene_name: str) -> Optional[List[str]]:
    prefix = _get_gene_family_prefix(gene_name)
    if prefix is None:
        return None
    return DRUG_CLASS_MAP.get(prefix)


def _is_blocked_gene_name(name: str) -> bool:
    if not isinstance(name, str) or not name.strip():
        return True
    key = name.strip().lower()
    key = re.sub(r"^bla\s*", "bla", key)
    if key in CORE_GENE_HARD_BLOCKLIST:
        return True
    for prefix in BLOCKED_PREFIXES:
        if key.startswith(prefix):
            return True
    for pat in LOCUS_TAG_PATTERNS:
        if pat.match(key):
            return True
    return False


def _is_internal_identifier(name: str) -> bool:
    """Letter+digits pattern, e.g. 'C1264', 'E449', 'H957'. Used by
    computational+validation papers (e.g. fARGene HMM family codes)."""
    if not isinstance(name, str):
        return False
    return bool(re.match(r"^[A-Z]\d+$", name.strip()))


def is_likely_review(text: str) -> bool:
    """Heuristic: 2+ review signals in first 3000 chars."""
    head = (text or "")[:3000].lower()
    hits = sum(1 for sig in REVIEW_SIGNALS if sig in head)
    return hits >= 2


def parse_single_json(raw: str) -> Optional[Dict[str, Any]]:
    """Parse a single JSON object from model output. Strips thinking blocks,
    markdown fences, and finds the first balanced {...} block."""
    if not raw:
        return None
    text = raw.strip()
    if "</think>" in text:
        text = text.split("</think>", 1)[1].strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```\s*$", "", text)
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if esc:
            esc = False
            continue
        if c == "\\":
            esc = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


# =============================================================================
# SCHEMA ENFORCEMENT — None-safe
# =============================================================================

def _apply_schema(data: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
    """Build a STRICTLY canonical dict: only keys defined in `schema` appear in
    the result. Missing fields get the schema default; None lists become [].
    All non-schema keys in `data` are DROPPED — the output is exactly the
    canonical shape, no extras.

    This is the enforcement layer for the canonical JSON format. Any aliasing
    of model-emitted alternative field names (e.g. 'position' → 'amino_acid_position')
    must happen BEFORE this function is called."""
    if not isinstance(data, dict):
        return dict(schema)
    result: Dict[str, Any] = {}
    for key, default in schema.items():
        value = data.get(key, default)
        if isinstance(default, list) and value is None:
            value = []
        result[key] = value
    return result


def _promote_gene_mutations_to_mutations_section(result: Dict[str, Any]) -> Dict[str, Any]:
    """STRUCTURAL RULE: gene entries must not carry mutations_found.
    Before schema strips them, lift any model-emitted gene-level mutations_found
    arrays into the mutations section under the same target name, so the data
    isn't lost — only restructured."""
    if not isinstance(result, dict):
        return result
    genes = result.get("genes") or {}
    mutations = result.get("mutations") or {}
    if not isinstance(mutations, dict):
        mutations = {}
    for gene_name, gene_data in list(genes.items()):
        if gene_name.startswith("_") or not isinstance(gene_data, dict):
            continue
        muts = gene_data.get("mutations_found")
        if not muts or not isinstance(muts, list):
            continue
        # Only promote real mutation entries (must have at least notation)
        promoted = [m for m in muts
                    if isinstance(m, dict) and m.get("notation")]
        if not promoted:
            # Empty / placeholder — just drop silently
            gene_data.pop("mutations_found", None)
            continue
        target = mutations.get(gene_name)
        if not isinstance(target, dict):
            target = {
                "encodes": None,
                "mutations_found": [],
                "wild_type_susceptible": None,
                "notes": (f"Mutations promoted from gene entry '{gene_name}' "
                          f"(model emitted mutations_found inside genes)."),
            }
            mutations[gene_name] = target
        existing_mf = target.get("mutations_found") or []
        seen = {json.dumps(m, sort_keys=True) for m in existing_mf
                if isinstance(m, dict)}
        for m in promoted:
            key = json.dumps(m, sort_keys=True)
            if key not in seen:
                existing_mf.append(m)
                seen.add(key)
        target["mutations_found"] = existing_mf
        # Now safe to drop from the gene entry
        gene_data.pop("mutations_found", None)
        print(f"  🔁 promoted {len(promoted)} mutation entries from gene "
              f"'{gene_name}' → mutations section")
    result["mutations"] = mutations
    return result


def _enforce_gene_entry_schema(data: Dict[str, Any]) -> Dict[str, Any]:
    # Strict schema drops mutations_found (and any other non-canonical keys).
    # The actual rescue of mutations_found data happens upstream in
    # _promote_gene_mutations_to_mutations_section() which runs before this.
    return _apply_schema(data, GENE_ENTRY_SCHEMA)


# Field-aliases the model sometimes emits inside a mutation entry instead of
# using the canonical schema names. We fold these back into the canonical
# fields BEFORE _apply_schema runs, so the canonical fields aren't all-null
# while the data sits in extra non-schema keys.
MUTATION_ENTRY_ALIASES = {
    # alias_name           -> canonical_name
    "substitution":        "notation",
    "substitution_change": "notation",
    "amino_acid_change":   "notation",
    "aa_change":           "notation",
    "mutation":            "notation",
    "change":              "notation",

    "position":            "amino_acid_position",
    "aa_position":         "amino_acid_position",
    "residue_position":    "amino_acid_position",
    "codon_position":      "amino_acid_position",

    "nt_position":         "nucleotide_position",
    "base_position":       "nucleotide_position",

    "codon":               "codon_change",
    "nucleotide":          "nucleotide_change",
    "nt_change":           "nucleotide_change",

    "protein_substitution": "protein_change",
    "aa_substitution":     "protein_change",

    "domain":              "position_in_molecule",
    "region":              "position_in_molecule",

    "validation_method":   "validated_by",
    "method":              "validated_by",

    "type":                "mutation_type",
}

# Fields that belong at the mutation-TARGET level, not on individual mutation
# entries. If the model put them inside a mutation entry, lift them up.
MUTATION_ENTRY_TO_TARGET_LIFTS = {
    "wild_type_susceptible", "notes", "encodes",
    "mechanism",  # mechanism is a target-level descriptor in our schema
}


def _alias_and_clean_mutation_entry(m: Dict[str, Any],
                                    target_carry: Dict[str, Any]) -> Dict[str, Any]:
    """Fold model-emitted alias field names into the canonical mutation entry
    schema. Lift target-level fields out into `target_carry` (caller will merge
    them onto the parent target). Drop redundant duplicates.

    Context-aware: if `position_in_molecule` indicates a non-coding/regulatory
    region (Pribnow box, -10/-35, promoter, RBS, UTR, ...), an alias like
    'position' or 'substitution' is routed to nucleotide_* fields instead of
    amino_acid_*/protein_change. This prevents the alias-folder from
    converting a promoter G→T into a fake amino-acid substitution."""
    if not isinstance(m, dict):
        return m

    # Detect non-coding context BEFORE folding aliases so we can route correctly
    pim = (m.get("position_in_molecule") or "").lower()
    is_non_coding = any(sig in pim for sig in PROMOTER_REGION_TERMS)
    mut_type_str = (m.get("mutation_type") or "").lower()
    if any(t in mut_type_str for t in ("promoter", "regulatory", "non-coding")):
        is_non_coding = True

    # 1. Fold aliases into canonical names (only if canonical is empty).
    #    When non-coding context is detected, redirect protein-level aliases to
    #    nucleotide-level destinations.
    alias_map = dict(MUTATION_ENTRY_ALIASES)
    if is_non_coding:
        alias_map.update({
            "substitution":         "nucleotide_change",
            "substitution_change":  "nucleotide_change",
            "amino_acid_change":    "nucleotide_change",
            "aa_change":            "nucleotide_change",
            "mutation":             "nucleotide_change",
            "change":               "nucleotide_change",
            "position":             "nucleotide_position",
            "aa_position":          "nucleotide_position",
            "residue_position":    "nucleotide_position",
            "codon_position":       "nucleotide_position",
            "protein_substitution": "nucleotide_change",
            "aa_substitution":      "nucleotide_change",
        })

    for alias, canonical in alias_map.items():
        if alias in m and m[alias] is not None and m.get(canonical) in (None, "", []):
            m[canonical] = m[alias]
        m.pop(alias, None)

    # 2. Lift target-level fields up out of the entry
    for field in MUTATION_ENTRY_TO_TARGET_LIFTS:
        if field in m:
            val = m.pop(field)
            if val is not None and val != "" and val != [] \
                    and target_carry.get(field) in (None, "", []):
                target_carry[field] = val

    # 3. Backfill: notation → protein_change + amino_acid_position
    #    BUT only when the context is coding (so we don't fake a protein change
    #    from a nucleotide notation in a promoter context).
    notation = m.get("notation")
    if isinstance(notation, str) and not is_non_coding:
        if not m.get("protein_change") and re.match(r"^[A-Z]\d+[A-Z*]$", notation):
            # Avoid pure-nucleotide letters on both ends (those are NT changes)
            if not (notation[0] in "ACGTU" and notation[-1] in "ACGTU"):
                m["protein_change"] = notation
        if m.get("amino_acid_position") in (None, "") and \
                re.match(r"^[A-Z](\d+)[A-Z*]$", notation):
            if not (notation[0] in "ACGTU" and notation[-1] in "ACGTU"):
                try:
                    m["amino_acid_position"] = int(
                        re.match(r"^[A-Z](\d+)[A-Z*]$", notation).group(1))
                except (ValueError, AttributeError):
                    pass

    # 3b. For non-coding mutations, mirror notation → nucleotide_change if
    #     nucleotide_change is empty and notation looks like a NT change.
    if isinstance(notation, str) and is_non_coding:
        if not m.get("nucleotide_change") and \
                re.match(r"^[ACGTU]\d+[ACGTU]$", notation, re.IGNORECASE):
            m["nucleotide_change"] = notation
        if m.get("nucleotide_position") in (None, "") and \
                re.match(r"^[ACGTU](\d+)[ACGTU]$", notation, re.IGNORECASE):
            try:
                m["nucleotide_position"] = int(
                    re.match(r"^[ACGTU](\d+)[ACGTU]$",
                             notation, re.IGNORECASE).group(1))
            except (ValueError, AttributeError):
                pass

    # 4. Filter vague-MDR claims from antibiotic lists
    cr = m.get("confers_resistance_to") or []
    if isinstance(cr, list):
        m["confers_resistance_to"] = [
            a for a in cr
            if _normalize_antibiotic(a) not in VAGUE_MDR_TERMS
        ]

    return m


def _enforce_mutation_target_schema(data: Dict[str, Any]) -> Dict[str, Any]:
    # Pass 1: rescue target-level fields that the model put inside mutation
    # entries, and fold mutation-entry alias names into the canonical schema
    target_carry: Dict[str, Any] = {}
    raw_muts = data.get("mutations_found") or []
    if isinstance(raw_muts, list):
        cleaned_muts = [
            _alias_and_clean_mutation_entry(m, target_carry)
            for m in raw_muts
            if isinstance(m, dict)
        ]
        data["mutations_found"] = cleaned_muts
    # Merge anything lifted into target-level (only if target field is empty)
    for k, v in target_carry.items():
        if data.get(k) in (None, "", []):
            data[k] = v

    # Pass 2: apply target + entry schemas
    out = _apply_schema(data, MUTATION_TARGET_SCHEMA)
    if out.get("mutations_found") is None:
        out["mutations_found"] = []
    out["mutations_found"] = [
        _apply_schema(m, MUTATION_ENTRY_SCHEMA)
        for m in out["mutations_found"]
        if isinstance(m, dict)
    ]
    return out


# =============================================================================
# STRUCTURAL FIXERS for malformed model output
# =============================================================================

def _fix_nested_duplicate_key(name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Unwrap {"pmrA": {"pmrA": {...}}} → {...}. Model bug."""
    if isinstance(data, dict) and len(data) == 1:
        only_key = next(iter(data))
        only_val = data[only_key]
        if only_key.lower() == name.lower() and isinstance(only_val, dict):
            return only_val
    return data


def _fix_flat_mutations(name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """If mutation fields appear directly on target dict, rescue into
    mutations_found array."""
    if not isinstance(data, dict):
        return data
    mut_field_keys = {
        "notation", "amino_acid_position", "nucleotide_position",
        "codon_change", "nucleotide_change", "protein_change",
        "position_in_molecule", "effect_on_function", "mutation_type",
        "validated_by", "origin",
    }
    flat_keys = mut_field_keys.intersection(data.keys())
    if "mutations_found" in data or not flat_keys:
        return data
    if data.get("notation"):
        rescued = {k: data.pop(k) for k in list(data.keys()) if k in MUTATION_ENTRY_SCHEMA}
        data["mutations_found"] = [rescued]
    return data


def _fix_nested_mutations_found(name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten nested mutations_found lists."""
    if not isinstance(data, dict):
        return data
    mf = data.get("mutations_found")
    if isinstance(mf, list):
        flat = []
        for item in mf:
            if isinstance(item, list):
                flat.extend([x for x in item if isinstance(x, dict)])
            elif isinstance(item, dict):
                flat.append(item)
        data["mutations_found"] = flat
    return data


# =============================================================================
# REVIEW FIELD ENFORCEMENT (deterministic, applied after audit)
# =============================================================================

REVIEW_BIB_NOTE = ("Mutations reported in this review paper are sourced from "
                   "cited studies. Original experimental data is in the "
                   "referenced publications.")


def _enforce_review_fields(data: Dict[str, Any], category: str) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return data
    if category == "mutations":
        muts = data.get("mutations_found") or []
        for m in muts:
            if not isinstance(m, dict):
                continue
            m["codon_change"] = None
            m["nucleotide_change"] = None
            m["nucleotide_position"] = None
            m["validated_by"] = "reported in cited literature"
            m["evidence_level"] = "inferred"
        data["source"] = "bibliography"
        data["evidence_note"] = REVIEW_BIB_NOTE
    elif category == "genes":
        data["evidence_level"] = "inferred"
        data["source"] = "bibliography"
        data["evidence_note"] = REVIEW_BIB_NOTE
    return data


# =============================================================================
# DETERMINISTIC AUDIT (text-matching sanity check)
# =============================================================================

def deterministic_gene_audit(result: Dict[str, Any], paper_text: str) -> Dict[str, Any]:
    """Remove genes whose name (or family prefix) does not literally appear in
    the paper text. Skipped for computational_with_validation papers because
    those use internal identifier codes that may appear in figures/tables only."""
    paper_type = result.get("paper_type")
    if paper_type == "computational_with_validation":
        # Internal identifiers are legitimate; trust them.
        return result

    text_lower = (paper_text or "").lower()
    kept: Dict[str, Any] = {}
    removed = []
    for gene_name, gene_data in (result.get("genes") or {}).items():
        if gene_name.startswith("_"):
            kept[gene_name] = gene_data
            continue
        key = gene_name.strip().lower()
        key_clean = re.sub(r"^bla[\s_-]*", "bla", key)
        family = _get_gene_family_prefix(gene_name)
        if key in text_lower or key_clean in text_lower:
            kept[gene_name] = gene_data
        elif family and family in text_lower:
            # Family present but exact name absent — keep with caution
            kept[gene_name] = gene_data
        else:
            removed.append(gene_name)
    if removed:
        print(f"    🛑 deterministic audit removed (not in text): {removed}")
    result["genes"] = kept
    return result


# =============================================================================
# DRUG-CLASS FILTERING — None-safe
# =============================================================================

def _filter_antibiotics_by_class(result: Dict[str, Any]) -> Dict[str, Any]:
    for gene_name, gene_data in (result.get("genes") or {}).items():
        if not isinstance(gene_data, dict):
            continue
        original = gene_data.get("confers_resistance_to") or []
        if not original:
            continue
        normalized = [_normalize_antibiotic(ab) for ab in original]
        vague = [ab for ab in normalized if ab in VAGUE_MDR_TERMS]
        if vague:
            print(f"  ⚠  {gene_name}: vague MDR claim removed: {vague}")
            normalized = [ab for ab in normalized if ab not in VAGUE_MDR_TERMS]
        allowed = _get_allowed_class(gene_name)
        if allowed is not None:
            filtered = [ab for ab in normalized if any(a in ab for a in allowed)]
            rejected = [ab for ab in normalized if ab not in filtered]
            if rejected:
                print(f"  ✂  {gene_name}: removed {len(rejected)} off-class "
                      f"antibiotics: {rejected}")
            normalized = filtered
        gene_data["confers_resistance_to"] = normalized
    return result


# =============================================================================
# CLEANUP: blocked names, mutation operon keys, copy-paste loops, empty entries
# =============================================================================

def clean_malformed_genes(result: Dict[str, Any]) -> Dict[str, Any]:
    """Apply structural cleanup to the genes section.

    Filtering philosophy: the recognized AMR family whitelist is a POSITIVE
    signal (genes whose names start with known prefixes are clearly in scope)
    but NOT a hard filter. The actual defenses against junk gene names are:
      - CORE_GENE_HARD_BLOCKLIST: known regulators / biosynthesis / LPS /
        sigma-factor genes that must NOT appear in the genes section
      - Locus-tag patterns (PA####, ORF####, locus_####)
      - The validation gate in the extraction prompt (gene must be
        experimentally characterized in THIS paper)
      - Deterministic gene-name audit (name must literally appear in
        the paper text — see deterministic_gene_audit())
      - Copy-paste loop detector

    Removing the whitelist allows legitimately novel gene names from
    discovery papers (e.g. bahA, cpaA, llmA from cave-resistome studies)
    to survive."""
    # 0. Lift misclassified beta-lactamase alleles from mutations → genes
    result = _lift_misclassified_bla_alleles_from_mutations(result)
    # 1. Normalize gene keys: 'adc-56' → 'blaADC-56'
    result = _normalize_gene_keys_in_dict(result)
    # 2. Promote any gene-level mutations_found into the mutations section
    #    before schema strips them, so the data isn't lost.
    result = _promote_gene_mutations_to_mutations_section(result)
    paper_type = result.get("paper_type")
    genes_in = result.get("genes") or {}
    genes_out: Dict[str, Any] = {}
    removed_blocked = []
    for name, data in genes_in.items():
        if name.startswith("_"):
            genes_out[name] = data
            continue
        if not isinstance(data, dict):
            continue
        # Allow internal identifiers ONLY when paper_type matches
        if _is_internal_identifier(name):
            if paper_type == "computational_with_validation":
                genes_out[name] = _enforce_gene_entry_schema(data)
                continue
            else:
                removed_blocked.append(name)
                continue
        # Hard denylist: regulators, biosynthesis genes, locus tags, etc.
        if _is_blocked_gene_name(name):
            removed_blocked.append(name)
            continue
        # No whitelist check — trust the model + downstream audit to handle
        # novel AMR gene names from discovery papers.
        data = _fix_nested_duplicate_key(name, data)
        data = _enforce_gene_entry_schema(data)
        genes_out[name] = data
    if removed_blocked:
        print(f"  ✂  denylist removed from genes: {removed_blocked}")
    result["genes"] = genes_out
    return result


def _clean_mutations_section(result: Dict[str, Any]) -> Dict[str, Any]:
    muts_in = result.get("mutations") or {}
    muts_out: Dict[str, Any] = {}
    removed = []
    for target, data in muts_in.items():
        if target.startswith("_"):
            muts_out[target] = data
            continue
        key = target.strip().lower()
        if key in MUTATIONS_EXACT_BLOCKLIST:
            removed.append(target)
            continue
        if not isinstance(data, dict):
            removed.append(target)
            continue
        data = _fix_nested_duplicate_key(target, data)
        data = _fix_flat_mutations(target, data)
        data = _fix_nested_mutations_found(target, data)
        data = _enforce_mutation_target_schema(data)
        # Drop fully-empty mutation entries (all fields None and no notation)
        cleaned_muts = []
        for m in (data.get("mutations_found") or []):
            if not isinstance(m, dict):
                continue
            if not any(v not in (None, [], "") for k, v in m.items()
                       if k != "evidence_level"):
                continue
            # Skip entries where the only value is the gene name in notation
            if (m.get("notation") and
                    m["notation"].strip().lower() == target.strip().lower()
                    and not any(v not in (None, [], "") for k, v in m.items()
                                if k != "notation")):
                continue
            cleaned_muts.append(m)
        data["mutations_found"] = cleaned_muts
        # Drop target if it has zero usable mutations and zero notes
        if not cleaned_muts and not data.get("notes"):
            removed.append(target)
            continue
        muts_out[target] = data
    if removed:
        print(f"  ✂  cleaned/removed from mutations: {removed}")
    result["mutations"] = muts_out
    return result



# =============================================================================
# RESULT NORMALIZATION — canonical wrapper
# =============================================================================

FULL_OUTPUT_SCHEMA = {
    "pmid": None,
    "relevant": None,
    "paper_title": None,
    "publication_year": None,
    "paper_type": None,
    "genes": {},
    "mutations": {},
    "sequence_accessions": [],
    "key_findings": None,
    "methodology": None,
    "geographic_location": [],
    "sample_size": None,
}


def _enforce_full_output_schema(data: Dict[str, Any]) -> Dict[str, Any]:
    """Build a STRICTLY canonical full_output dict. Only the documented
    top-level fields survive; everything else is dropped. genes and mutations
    are passed through unchanged (their internal schemas are enforced by
    _enforce_gene_entry_schema / _enforce_mutation_target_schema)."""
    if not isinstance(data, dict):
        data = {}
    result: Dict[str, Any] = {}
    for key, default in FULL_OUTPUT_SCHEMA.items():
        value = data.get(key, default)
        if isinstance(default, list) and value is None:
            value = []
        if isinstance(default, dict) and value is None:
            value = {}
        result[key] = value
    return result


def _normalize_result_format(pmid: str, status: str, extraction_mode: str,
                             full_output: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure every result has the canonical top-level shape AND the canonical
    full_output shape — no extra fields, no internal flags."""
    full_output = _enforce_full_output_schema(full_output)
    genes = full_output.get("genes") or {}
    extracted_genes = list(genes.keys())
    return {
        "pmid": pmid,
        "status": status,
        "extraction_mode": extraction_mode,
        "extracted_genes": extracted_genes,
        "total_genes": len(extracted_genes),
        "full_output": full_output,
    }


# =============================================================================
# AUDIT PROMPT BUILDER
# =============================================================================

def _build_audit_paper_context(paper_text: str, entity_name: str,
                               max_chars: int = AUDIT_PAPER_MAX_CHARS) -> str:
    """Build a compact view of the paper for auditing one entity.

    Small papers: returned verbatim.
    Large papers: extract regions that mention the entity name, plus the
    abstract/intro head, merge overlapping windows, and concatenate until
    max_chars is reached. This keeps the audit context grounded in the
    sentences that mention the entity rather than dumping the full paper."""
    if not paper_text:
        return ""
    if len(paper_text) <= max_chars:
        return paper_text

    text_lower = paper_text.lower()
    name = (entity_name or "").strip().lower()
    name_clean = re.sub(r"^bla[\s_-]*", "bla", name)

    # Find all occurrences of either the raw name or the bla-normalized form
    positions: List[int] = []
    if name:
        start = 0
        while True:
            i = text_lower.find(name, start)
            if i < 0:
                break
            positions.append(i)
            start = i + max(1, len(name))
    if name_clean and name_clean != name:
        start = 0
        while True:
            i = text_lower.find(name_clean, start)
            if i < 0:
                break
            positions.append(i)
            start = i + max(1, len(name_clean))
    positions.sort()

    head_chars = min(8000, len(paper_text))
    head = paper_text[:head_chars]
    parts: List[str] = [head]
    used = len(head)

    if not positions:
        # No mentions found — head only is the best we can do
        if used < max_chars:
            tail = paper_text[head_chars:max_chars]
            parts.append("\n[... continuation ...]\n" + tail)
        return "".join(parts)

    # Build windows around each mention, merge overlaps
    window = 4000
    windows: List[Tuple[int, int]] = []
    for pos in positions:
        s = max(0, pos - window // 2)
        e = min(len(paper_text), pos + window // 2)
        windows.append((s, e))
    windows.sort()
    merged: List[List[int]] = [list(windows[0])]
    for s, e in windows[1:]:
        if s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])

    for s, e in merged:
        if e <= head_chars:
            continue  # already inside head
        s = max(s, head_chars)
        snippet = paper_text[s:e]
        marker = f"\n[... excerpt from char {s} ...]\n"
        if used + len(marker) + len(snippet) > max_chars:
            remaining = max_chars - used - len(marker)
            if remaining > 200:
                parts.append(marker + snippet[:remaining])
                used = max_chars
            break
        parts.append(marker + snippet)
        used += len(marker) + len(snippet)

    return "".join(parts)


def build_comprehensive_audit_prompt(paper_text: str, entity_type: str,
                                     entity_name: str,
                                     entity_data: Dict[str, Any]) -> str:
    entity_json = json.dumps(entity_data, indent=2, ensure_ascii=False)
    paper_context = _build_audit_paper_context(paper_text, entity_name)
    return AUDITOR_COMPREHENSIVE_PROMPT.format(
        entity_type=entity_type,
        entity_name=entity_name,
        entity_json=entity_json,
        paper_text=paper_context,
    )


# =============================================================================
# ATOMIC AUDITOR (Pass 2)
# =============================================================================

def run_atomic_audit(pmid: str, paper_text: str, draft_json: Dict[str, Any],
                     model: LLM, tokenizer) -> Dict[str, Any]:
    """Strict per-entity audit. Removes/nulls fields unsupported by paper text."""
    is_review = draft_json.get("paper_type") == "review"
    if is_review:
        print(f"  📋 PMID {pmid}: review paper — auditing with bibliography rules")

    prompts: List[str] = []
    tracking: List[Tuple[str, str, Dict[str, Any]]] = []

    for gene_name, gene_data in (draft_json.get("genes") or {}).items():
        if gene_name.startswith("_"):
            continue
        if not isinstance(gene_data, dict):
            continue
        prompts.append(build_comprehensive_audit_prompt(
            paper_text, "Gene", gene_name, gene_data))
        tracking.append(("genes", gene_name, gene_data))

    for mut_target, mut_data in (draft_json.get("mutations") or {}).items():
        if mut_target.startswith("_"):
            continue
        if not isinstance(mut_data, dict):
            continue
        prompts.append(build_comprehensive_audit_prompt(
            paper_text, "Mutation", mut_target, mut_data))
        tracking.append(("mutations", mut_target, mut_data))

    if not prompts:
        return draft_json

    print(f"  🔍 PMID {pmid}: auditing {len(prompts)} entities...")

    if tokenizer is not None:
        formatted = []
        for p in prompts:
            messages = [
                {"role": "system",
                 "content": ("You are a strict data auditor. SET unverified "
                             "fields TO NULL. Output ONLY valid JSON. Start "
                             "with { immediately.")},
                {"role": "user", "content": p},
            ]
            try:
                formatted.append(tokenizer.apply_chat_template(
                    messages, tokenize=False,
                    add_generation_prompt=True, enable_thinking=False))
            except Exception:
                formatted.append(p)
        prompts = formatted

    sampling_params = SamplingParams(
        temperature=0.0,
        max_tokens=AUDIT_MAX_TOKENS,
        top_p=1.0,
        repetition_penalty=1.05,
        stop=["<|im_end|>", "<|endoftext|>"],
    )

    try:
        responses = model.generate(prompts, sampling_params)
    except Exception as e:
        print(f"  ⚠  audit inference failed: {e} — returning draft unchanged")
        return draft_json

    audited = dict(draft_json)
    audited["genes"] = {}
    audited["mutations"] = {}

    removed_count = 0
    modified_count = 0
    removed_mut_entries = 0

    for (category, entity_name, original_data), response in zip(tracking, responses):
        if not isinstance(original_data, dict):
            audited[category][entity_name] = original_data
            continue
        raw = response.outputs[0].text
        audited_data = parse_single_json(raw)
        if audited_data is None:
            print(f"    ⚠  {entity_name}: audit parse failed — keeping original")
            audited[category][entity_name] = original_data
            continue
        if not audited_data:
            print(f"    🛑 {entity_name}: removed (not supported in paper)")
            removed_count += 1
            continue

        audited_data = _fix_nested_duplicate_key(entity_name, audited_data)
        if category == "mutations":
            audited_data = _fix_flat_mutations(entity_name, audited_data)
            audited_data = _fix_nested_mutations_found(entity_name, audited_data)

        if is_review:
            audited_data = _enforce_review_fields(audited_data, category)

        if category == "mutations":
            audited_data = _enforce_mutation_target_schema(audited_data)
        elif category == "genes":
            audited_data = _enforce_gene_entry_schema(audited_data)

        # None-safe list normalization (auditor sometimes returns null for lists)
        if category == "genes":
            for f in ("confers_resistance_to", "organisms_tested_in"):
                if audited_data.get(f) is None:
                    audited_data[f] = []
        if category == "mutations":
            if audited_data.get("mutations_found") is None:
                audited_data["mutations_found"] = []
            for m in audited_data["mutations_found"]:
                if not isinstance(m, dict):
                    continue
                for f in ("confers_resistance_to", "organisms_observed_in"):
                    if m.get(f) is None:
                        m[f] = []

        if category == "mutations":
            o = len(original_data.get("mutations_found") or [])
            n = len(audited_data.get("mutations_found") or [])
            if o > n:
                removed_mut_entries += (o - n)
                print(f"    ✂  {entity_name}: dropped {o - n}/{o} mutation entries")

        orig_keys = set(original_data.keys())
        new_keys = set(audited_data.keys())
        removed_keys = {k for k in orig_keys - new_keys if not k.startswith("_")}
        if removed_keys:
            modified_count += 1
            print(f"    ✂  {entity_name}: removed fields: {sorted(removed_keys)}")

        if category == "genes":
            orig_abs = set(original_data.get("confers_resistance_to") or [])
            new_abs = set(audited_data.get("confers_resistance_to") or [])
            removed_abs = orig_abs - new_abs
            if removed_abs:
                print(f"       removed antibiotics: {sorted(removed_abs)}")

        audited[category][entity_name] = audited_data

    print(f"  ✓ audit complete: removed {removed_count} entities, "
          f"cleaned {modified_count} entries, "
          f"dropped {removed_mut_entries} mutation entries")
    return audited


# =============================================================================
# POST-AUDIT FINAL PASS
# =============================================================================

def _no_resistance_phenotype(data: Dict[str, Any]) -> bool:
    """Return True if a gene entry has no resistance evidence at all.

    Requires BOTH conditions to be true:
      1. confers_resistance_to is empty / null
      2. resistance_mechanism_class is null, unknown, none, or empty

    A gene with a known mechanism class (e.g. "efflux", "enzymatic_inactivation")
    is retained even if specific antibiotics were not extracted — the mechanism
    class alone is enough evidence that this is a real AMR gene.
    """
    crt = data.get("confers_resistance_to") or []
    rmc = (data.get("resistance_mechanism_class") or "").strip().lower()
    rmc_absent = not rmc or rmc in ("null", "unknown", "none")
    return (not crt) and rmc_absent


def post_audit_finalize(result: Dict[str, Any], paper_text: str) -> Dict[str, Any]:
    result = clean_malformed_genes(result)
    result = _clean_mutations_section(result)
    result = _filter_antibiotics_by_class(result)
    result = deterministic_gene_audit(result, paper_text)

    # Final sweep: remove gene entries where BOTH confers_resistance_to is
    # empty AND resistance_mechanism_class is null/unknown/empty.
    # This catches entries that survived earlier filters but have no
    # resistance phenotype — e.g. toxicity/susceptibility papers where
    # the auditor correctly emptied both fields (A1555G/C1494T-type cases),
    # or virulence genes the model extracted despite the prompt instructions.
    genes = result.get("genes") or {}
    no_phenotype = [
        name for name, data in genes.items()
        if isinstance(data, dict) and _no_resistance_phenotype(data)
    ]
    if no_phenotype:
        for name in no_phenotype:
            del genes[name]
        print(f"  🛑 final sweep removed {len(no_phenotype)} gene(s) "
              f"with no resistance phenotype: {no_phenotype}")
    result["genes"] = genes

    return result


# =============================================================================
# CHUNKING
# =============================================================================

def chunk_paper(text: str) -> List[str]:
    if len(text) <= CHARS_LIMIT_DIRECT:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHARS_LIMIT_PER_CHUNK, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - CHUNK_OVERLAP_CHARS
    return chunks


def merge_chunked_results(pmid: str, chunk_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {
        "pmid": pmid,
        "relevant": False,
        "paper_title": None,
        "publication_year": None,
        "paper_type": None,
        "genes": {},
        "mutations": {},
        "sequence_accessions": [],
        "key_findings": None,
        "methodology": None,
        "geographic_location": [],
        "sample_size": None,
    }
    for cr in chunk_results:
        if not isinstance(cr, dict):
            continue
        if cr.get("relevant"):
            merged["relevant"] = True
        for f in ("paper_title", "publication_year", "paper_type",
                  "key_findings", "methodology", "sample_size"):
            if cr.get(f) and not merged.get(f):
                merged[f] = cr[f]
        for f in ("sequence_accessions", "geographic_location"):
            for v in (cr.get(f) or []):
                if v not in merged[f]:
                    merged[f].append(v)
        for g_name, g_data in (cr.get("genes") or {}).items():
            if g_name not in merged["genes"]:
                merged["genes"][g_name] = g_data
        for m_name, m_data in (cr.get("mutations") or {}).items():
            if m_name not in merged["mutations"]:
                merged["mutations"][m_name] = m_data
            else:
                # Merge mutations_found
                existing = merged["mutations"][m_name]
                if isinstance(existing, dict) and isinstance(m_data, dict):
                    ex_mf = existing.get("mutations_found") or []
                    new_mf = m_data.get("mutations_found") or []
                    seen = {json.dumps(m, sort_keys=True) for m in ex_mf}
                    for m in new_mf:
                        key = json.dumps(m, sort_keys=True)
                        if key not in seen:
                            ex_mf.append(m)
                            seen.add(key)
                    existing["mutations_found"] = ex_mf
    return merged


# =============================================================================
# BATCH EXTRACTION
# =============================================================================

def _build_extraction_prompt(paper_text: str, is_chunk: bool) -> str:
    chunk_note = ""
    if is_chunk:
        chunk_note = (
            "\nNOTE: This is ONE CHUNK of a larger paper. Extract only "
            "genes/mutations with clear experimental evidence in THIS chunk. "
            "Be concise — other chunks cover the rest of the paper. "
            "Maximum ~20 gene entries per chunk.\n")
    return EXTRACTION_PROMPT.format(chunk_note=chunk_note, paper_text=paper_text)


def _format_for_model(prompt: str, tokenizer) -> str:
    if tokenizer is None:
        return prompt
    messages = [
        {"role": "system",
         "content": ("You are an AMR data extraction system. Output ONLY a "
                     "single valid JSON object. Start with { immediately.")},
        {"role": "user", "content": prompt},
    ]
    try:
        return tokenizer.apply_chat_template(
            messages, tokenize=False,
            add_generation_prompt=True, enable_thinking=False)
    except Exception:
        return prompt


def extract_batch_vllm(batch: List[Tuple[str, str]], model: LLM, tokenizer
                       ) -> Tuple[List[Dict[str, Any]], int, int, int, int, int]:
    """Extract a batch of (pmid, paper_text) tuples.
    Returns: (results, success, irrelevant, errors, reviews, total_genes)."""
    print("=" * 80)
    print(f"Batch of {len(batch)} paper(s)")
    print(f"Processing PMID(s): {[p for p, _ in batch]}")
    print("=" * 80)

    results: List[Dict[str, Any]] = []
    success = 0
    irrelevant = 0
    errors = 0
    reviews = 0
    total_genes = 0

    for pmid, paper_text in batch:
        try:
            paper_text = paper_text or ""
            chars = len(paper_text)

            # Decide direct vs chunked
            if chars <= CHARS_LIMIT_DIRECT:
                mode = "direct"
                chunks = [paper_text]
                print(f"  📄 PMID {pmid}: {chars:,} chars → DIRECT")
            else:
                mode = "chunked"
                chunks = chunk_paper(paper_text)
                print(f"  📄 PMID {pmid}: {chars:,} chars → CHUNKED "
                      f"(exceeds {CHARS_LIMIT_DIRECT:,})")
                sizes = [len(c) for c in chunks]
                print(f"  📦 PMID {pmid}: chunked into {len(chunks)} parts "
                      f"({sizes} chars each)")

            chunk_results: List[Dict[str, Any]] = []

            for ci, chunk_text in enumerate(chunks, start=1):
                is_chunk = (mode == "chunked")
                if is_chunk:
                    print(f"  ⚙  PMID {pmid}: processing chunk {ci}/{len(chunks)} "
                          f"({len(chunk_text):,} chars)...")
                prompt = _build_extraction_prompt(chunk_text, is_chunk)
                prompt = _format_for_model(prompt, tokenizer)
                max_toks = CHUNK_MAX_TOKENS if is_chunk else EXTRACTION_MAX_TOKENS
                sp = SamplingParams(
                    temperature=0.0,
                    max_tokens=max_toks,
                    top_p=1.0,
                    repetition_penalty=1.1,
                    stop=["<|im_end|>", "<|endoftext|>"],
                )
                try:
                    resp = model.generate([prompt], sp)
                    raw = resp[0].outputs[0].text
                except Exception as e:
                    print(f"  ❌ chunk inference failed: {e}")
                    chunk_results.append({"pmid": pmid, "relevant": False,
                                          "genes": {}, "mutations": {}})
                    continue

                parsed = parse_single_json(raw)
                if parsed is None:
                    print(f"  ⚠  PMID {pmid}: parse failed on chunk {ci}")
                    chunk_results.append({"pmid": pmid, "relevant": False,
                                          "genes": {}, "mutations": {}})
                    continue

                if not parsed.get("relevant", True):
                    if is_chunk:
                        print(f"  ⬜ chunk {ci}: marked irrelevant — skipping")
                    chunk_results.append(parsed)
                    continue

                # Force review classification by heuristic if not flagged
                if is_likely_review(chunk_text) and parsed.get("paper_type") != "review":
                    print(f"  📋 PMID {pmid}: review heuristic triggered "
                          f"→ paper_type='review'")
                    parsed["paper_type"] = "review"

                chunk_results.append(parsed)
                if is_chunk:
                    g_count = len(parsed.get("genes") or {})
                    m_count = len(parsed.get("mutations") or {})
                    print(f"  ✓ chunk {ci}: {g_count} genes, {m_count} mutation targets")

            # Merge chunk results
            if mode == "chunked":
                full_output = merge_chunked_results(pmid, chunk_results)
            else:
                full_output = chunk_results[0] if chunk_results else \
                    {"pmid": pmid, "relevant": False, "genes": {}, "mutations": {}}

            # Irrelevant?
            if not full_output.get("relevant"):
                norm = _normalize_result_format(pmid, "irrelevant", mode, full_output)
                results.append(norm)
                irrelevant += 1
                continue

            # Deterministic cleaning (pre-audit)
            full_output = clean_malformed_genes(full_output)
            full_output = _clean_mutations_section(full_output)
            full_output = _filter_antibiotics_by_class(full_output)

            print(f"  ✅ PMID {pmid}: merged result — "
                  f"{len(full_output.get('genes') or {})} genes, "
                  f"{len(full_output.get('mutations') or {})} mutation targets")

            # Audit pass
            if AUDIT_ENABLED:
                full_output = run_atomic_audit(pmid, paper_text, full_output,
                                               model, tokenizer)

            # Final post-audit cleanup
            full_output = post_audit_finalize(full_output, paper_text)

            # Classification stats
            if full_output.get("paper_type") == "review":
                reviews += 1

            norm = _normalize_result_format(pmid, "success", mode, full_output)
            results.append(norm)
            success += 1
            total_genes += norm["total_genes"]

            print(f"  PMID {pmid}:")
            print(f"    Extracted genes: {norm['extracted_genes']}")

        except Exception as e:
            print(f"  ❌ PMID {pmid}: unhandled error — {e}")
            traceback.print_exc()
            norm = _normalize_result_format(
                pmid, "error", "direct",
                {"pmid": pmid, "relevant": False,
                 "genes": {}, "mutations": {}},
            )
            print(f"  ⚠  PMID {pmid}: error recorded — {e}")
            results.append(norm)
            errors += 1

    return results, success, irrelevant, errors, reviews, total_genes


# =============================================================================
# MAIN
# =============================================================================

def load_paper(path: str) -> Tuple[str, str]:
    """Returns (pmid, full_text)."""
    pmid = Path(path).stem
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        text = fh.read()
    return pmid, text


def main():
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description="Extract AMR genes from papers using vLLM",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python script.py                           # Process all papers
  python script.py --PMID 12345678 87654321  # Process specific PMIDs
  python script.py --PMID 12345678           # Process single PMID
        """
    )
    parser.add_argument(
        '--PMID',
        nargs='+',
        type=str,
        help='Specific PMID(s) to process. If not provided, processes all papers in folder'
    )
    parser.add_argument(
        '--override',
        action='store_true',
        help='Override existing output files and recreate new results'
    )
    parser.add_argument(
        '--skip-audit',
        action='store_true',
        help='Skip atomic audit pass (faster, less accurate)'
    )
    args = parser.parse_args()

    # Apply --skip-audit: toggle the module-level flag for this run
    global AUDIT_ENABLED
    if args.skip_audit:
        AUDIT_ENABLED = False
        print("⚠  Atomic audit pass DISABLED (--skip-audit)")

    papers_dir = PAPERS_DIR
    output_dir = OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)

    # Discover papers
    if args.PMID:
        paths = []
        for pmid in args.PMID:
            cands = glob(os.path.join(papers_dir, f"{pmid}.*"))
            if cands:
                paths.append(cands[0])
            else:
                print(f"  ⚠  PMID {pmid}: no paper file found")
    else:
        paths = sorted(glob(os.path.join(papers_dir, "*.txt"))
                       + glob(os.path.join(papers_dir, "*.xml")))

    # Resume by default: skip PMIDs that already have an output file.
    # --override disables this and reprocesses everything.
    if not args.override:
        existing = {Path(p).stem for p in
                    glob(os.path.join(output_dir, "*.json"))}
        before = len(paths)
        paths = [p for p in paths if Path(p).stem not in existing]
        skipped = before - len(paths)
        if skipped > 0:
            print(f"⏭  Skipping {skipped} PMID(s) already in {output_dir} "
                  f"(use --override to reprocess)")
    else:
        print("🔄 --override active: existing output files will be overwritten")

    print(f"Found {len(paths)} paper(s) to process")
    if not paths:
        print("Nothing to do.")
        return

    # Load model
    print(f"\nLoading model: {MODEL_NAME}")
    print(f"  HF cache: {HF_CACHE}")
    print(f"  GPU mem util: {GPU_MEMORY_UTILIZATION}")
    print(f"  Max model len: {MAX_MODEL_LEN}")
    print(f"  TP size: {TENSOR_PARALLEL_SIZE}")
    model = LLM(
        model=MODEL_NAME,
        download_dir=HF_CACHE,
        gpu_memory_utilization=GPU_MEMORY_UTILIZATION,
        max_model_len=MAX_MODEL_LEN,
        dtype=DTYPE,
        tensor_parallel_size=TENSOR_PARALLEL_SIZE,
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, cache_dir=HF_CACHE,
                                              trust_remote_code=True)
    print("Model loaded.\n")

    # Process in batches
    all_results: Dict[str, Any] = {}
    n_success = n_irrelevant = n_errors = n_reviews = n_total_genes = 0
    n_papers = len(paths)
    n_batches = (n_papers + BATCH_SIZE - 1) // BATCH_SIZE

    t_start = time.time()
    for bi in range(n_batches):
        batch_paths = paths[bi * BATCH_SIZE:(bi + 1) * BATCH_SIZE]
        batch = [load_paper(p) for p in batch_paths]
        print(f"\n>>> Batch {bi + 1}/{n_batches}")
        results, s, ir, er, rv, tg = extract_batch_vllm(batch, model, tokenizer)
        n_success += s
        n_irrelevant += ir
        n_errors += er
        n_reviews += rv
        n_total_genes += tg
        for r in results:
            pmid = r["pmid"]
            all_results[pmid] = r
            out_path = os.path.join(output_dir, f"{pmid}.json")
            with open(out_path, "w", encoding="utf-8") as fh:
                json.dump(r, fh, indent=2, ensure_ascii=False)

    t_elapsed = time.time() - t_start

    # Write summary
    summary = {
        "model": MODEL_NAME,
        "audit_enabled": AUDIT_ENABLED,
        "total_papers": n_papers,
        "success": n_success,
        "reviews": n_reviews,
        "irrelevant": n_irrelevant,
        "errors": n_errors,
        "total_genes": n_total_genes,
        "elapsed_seconds": round(t_elapsed, 1),
        "results": all_results,
    }
    summary_path = os.path.join(output_dir, "extraction_summary.json")
    with open(summary_path, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, ensure_ascii=False)

    # Auxiliary summaries
    reviews_only = {p: r for p, r in all_results.items()
                    if r.get("full_output", {}).get("paper_type") == "review"}
    irrelevant_only = {p: r for p, r in all_results.items()
                       if r.get("status") == "irrelevant"}
    errors_only = {p: r for p, r in all_results.items()
                   if r.get("status") == "error"}
    with open(os.path.join(output_dir, "reviews_summary.json"), "w") as fh:
        json.dump(reviews_only, fh, indent=2, ensure_ascii=False)
    with open(os.path.join(output_dir, "irrelevant_summary.json"), "w") as fh:
        json.dump(irrelevant_only, fh, indent=2, ensure_ascii=False)
    with open(os.path.join(output_dir, "errors_summary.json"), "w") as fh:
        json.dump(errors_only, fh, indent=2, ensure_ascii=False)

    print("\n" + "=" * 80)
    print("PIPELINE COMPLETE")
    print("=" * 80)
    print(f"Papers processed : {n_papers}")
    print(f"Success          : {n_success}")
    print(f"Reviews          : {n_reviews}")
    print(f"Irrelevant       : {n_irrelevant}")
    print(f"Errors           : {n_errors}")
    print(f"Total genes      : {n_total_genes}")
    print(f"Elapsed          : {t_elapsed:.1f}s "
          f"({t_elapsed / max(n_papers, 1):.1f}s/paper)")
    print(f"Summary          : {summary_path}")
    print("=" * 80)


if __name__ == "__main__":
    main()