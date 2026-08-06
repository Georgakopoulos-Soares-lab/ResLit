#!/usr/bin/env python3
"""
Cleans the Organism and Resistance columns in Full_list_genes_Reslit_harmonized.csv.

Organism column:
  - Checks each pipe-separated organism against available_species.txt
  - Extracts genus+species (first two words) from the reference list for matching
  - Keeps an organism if its genus+species matches any reference entry
  - Removes non-bacterial entries

Resistance column:
  - Checks each pipe-separated value against antibiotics_names.txt and
    antibiotics_names_abreviations.txt
  - Handles plurals (carbapenems -> carbapenem), hyphenated combos
    (piperacillin-tazobactam), slash combos (amoxicillin/clavulanate),
    and common variant spellings
  - Removes non-antibiotic entries (metals, biocides, vague terms)
  - Standardizes formatting: first letter capitalized, rest lowercase
  - Deduplicates within each cell
"""

import re
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent

REFERENCE_DATA = HERE.parent.parent / "reference_data"

INPUT_CSV = HERE / "Full_list_genes_Reslit_harmonized.csv"
SPECIES_FILE = REFERENCE_DATA / "available_species.txt"
ANTIBIOTICS_NAMES_FILE = REFERENCE_DATA / "antibiotics_names.txt"
ANTIBIOTICS_ABBREV_FILE = REFERENCE_DATA / "antibiotics_names_abreviations.txt"
OUTPUT_CSV = HERE / "Full_list_genes_Reslit_harmonized_antib_bact.csv"


# ── Species ──────────────────────────────────────────────────────────────────

_EXTRA_VALID_ORGANISMS = {
    # Higher taxonomy (orders, families, phyla, classes)
    "enterobacterales", "proteobacteria", "firmicutes", "bacteroidetes",
    "bacteroidota", "bacillota", "actinobacteria", "pseudomonadales",
    "betaproteobacteria", "alphaproteobacteria", "gammaproteobacteria",
    "gamma proteobacteria", "alpha proteobacteria",
    "clostridia", "bacilli", "bacillales", "clostridiales", "bacteroidales",
    "burkholderiales bacterium",
    # Families
    "enterobacteriaceae", "comamonadaceae", "flavobacteriaceae",
    "pseudomonadaceae", "pseudomonodaceae", "pasteurellaceae",
    "burkholderiaceae", "bacteroidaceae", "moraxellaceae", "shewanellaceae",
    "vibrionaceae", "morganellaceae", "bacillaceae", "sphingomonadaceae",
    "alcaligenaceae", "ruminococcaceae", "porphyromonadaceae",
    "peptostreptococcaceae", "lachnospiraceae", "clostridiaceae",
    "erysipelotrichaceae", "prevotellaceae", "eubacteriaceae",
    "bifidobacteriaceae", "micrococcaceae", "leptotrichiaceae",
    "phycisphaeraceae", "xanthobacteraceae",
    # Group / common names
    "coagulase-negative staphylococci", "coagulase negative staphylococci",
    "coagulase-negative staphylococcus", "coagulase negative staphylococci",
    "coagulase-negative staphylococci", "coagulase-negative staphylococcus sp.",
    "coagulase-negative staphylococci (cns)",
    "coagulase negative staphylococci (cns)", "coagulase-positive staphylococci",
    "coagulase negative staphylococci", "coagulase-negative staphylococci",
    "cons", "non-aureus staphylococci",
    "gram-negative bacteria", "gram-positive bacteria",
    "gram negative bacteria", "gram-negative bacilli",
    "gram-positive bacilli", "non-fermenting bacteria",
    "non-fermentative gram-negative bacilli",
    "non-fermenting gram-negative bacteria",
    "non-fermenting gram-negative bacilli",
    "lactic acid bacteria", "enterococci", "bacteria",
    "marine bacteria", "environmental bacteria", "soil bacteria",
    "anaerobic bacteria", "various bacteria", "various bacterial species",
    "other bacteria", "intestinal enterococci", "streptococci",
    "gram-negatives",
    # Host / source terms
    "porcine", "swine", "human", "bovine", "canine", "murine",
    "poultry", "chicken", "broilers", "cattle", "duck", "pig",
    "chickens", "humans",
    # Fungi
    "candida albicans", "candida glabrata", "candida tropicalis",
    "candida krusei", "candida auris", "candida dubliniensis",
    "candida lusitaniae", "aspergillus fumigatus", "aspergillus flavus",
    "aspergillus nidulans", "aspergillus lentulus",
    "saccharomyces cerevisiae", "cryptococcus neoformans",
    # Parasites
    "leishmania infantum", "leishmania donovani", "leishmania tropica",
    "leishmania major", "leishmania amazonensis", "leishmania braziliensis",
    "leishmania guyanensis", "plasmodium falciparum",
}


def load_species(filepath):
    """Load genus+species and genera from available_species.txt.

    Reference file has full strain names like 'Escherichia coli O157:H7 str. Sakai'.
    We extract 'escherichia coli' for species-level matching and 'escherichia'
    for genus-level matching, so genus-only organisms are also kept.

    Returns (species_set, genus_set, abbrev_map).
    abbrev_map maps first letter -> set of genera for abbreviated genus matching.
    """
    species = set()
    genera = set()
    abbrev_map = {}
    with open(filepath, encoding="utf-8") as f:
        for line in f:
            name = line.strip()
            if not name:
                continue
            words = name.split()
            genus = words[0].lower()
            genera.add(genus)
            first_letter = genus[0]
            abbrev_map.setdefault(first_letter, set()).add(genus)
            if len(words) >= 2:
                species.add(f"{genus} {words[1].lower()}")
            else:
                species.add(name.lower())
    return species, genera, abbrev_map


def organism_matches(organism, species_set, genus_set, abbrev_map):
    """Check if any word in the organism string is a known genus, family, or taxonomy term."""
    org_lower = organism.lower().strip()
    if not org_lower:
        return False

    # Check exact match against extra valid organisms
    if org_lower in _EXTRA_VALID_ORGANISMS:
        return True

    words = org_lower.split()

    # Handle abbreviated genus: "e. coli", "s. aureus", etc.
    for i, word in enumerate(words):
        if len(word) <= 2 and word.endswith(".") and i + 1 < len(words):
            letter = word[0]
            possible_genera = abbrev_map.get(letter, set())
            if possible_genera:
                return True

    # Check if any word matches a known genus or extra valid term
    # Also split on hyphens to catch "Escherichia-Shigella" etc.
    for word in words:
        clean = word.strip("(),[]")
        if clean in genus_set:
            return True
        if clean in _EXTRA_VALID_ORGANISMS:
            return True
        for part in clean.split("-"):
            if part in genus_set:
                return True

    return False


def clean_organism(value, species_set, genus_set, abbrev_map):
    """Filter pipe-separated organisms, keeping only bacterial ones."""
    if pd.isna(value) or not str(value).strip():
        return ""
    parts = str(value).split("|")
    kept = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if organism_matches(part, species_set, genus_set, abbrev_map):
            kept.append(part)
    return "|".join(kept)


# ── Antibiotics ──────────────────────────────────────────────────────────────

def load_antibiotics(names_file, abbrev_file):
    """Build a lookup: lowercase antibiotic name -> canonical form.

    For each name in the reference files, we also generate:
      - plural form (+ 's')
      - stripped plural (- 's')
      - beta/β variants
    """
    raw_names = set()

    for filepath in [names_file, abbrev_file]:
        with open(filepath, encoding="utf-8") as f:
            for line in f:
                name = line.strip()
                if not name or name.startswith("#"):
                    continue
                raw_names.add(name)

    lookup = {}

    def add(key, canonical):
        key = key.lower().strip()
        if key and key not in lookup:
            lookup[key] = canonical

    for name in raw_names:
        canonical = normalize_antibiotic(name)
        key = name.lower().strip()
        add(key, canonical)

        # Plurals: carbapenem <-> carbapenems
        if key.endswith("s"):
            add(key[:-1], canonical)
        else:
            add(key + "s", canonical)

        # Beta / β variants
        if key.startswith("beta-"):
            add("β-" + key[5:], canonical)
            add("β " + key[5:], canonical)
            add("beta " + key[5:], canonical)
        if key.startswith("β-"):
            add("beta-" + key[2:], canonical)
            add("beta " + key[2:], canonical)

    # Hyphen/slash/plus combos: piperacillin-tazobactam, amoxicillin/clavulanate, etc.
    # If either part of a combo matches, keep the whole thing
    # But also add common combo forms explicitly
    _COMBO_ALIASES = {
        "piperacillin-tazobactam": "Piperacillin/tazobactam",
        "piperacillin/tazobactam": "Piperacillin/tazobactam",
        "piperacillin + tazobactam": "Piperacillin/tazobactam",
        "piperacillin tazobactam": "Piperacillin/tazobactam",
        "piperacillin-tazobactum": "Piperacillin/tazobactam",
        "piperacillin-sulbactam": "Piperacillin/sulbactam",
        "piperacilin-tazobactam": "Piperacillin/tazobactam",
        "tazobactam-piperacillin": "Piperacillin/tazobactam",
        "tazobactam/piperacillin": "Piperacillin/tazobactam",
        "pip-tazo": "Piperacillin/tazobactam",
        "pip/taz": "Piperacillin/tazobactam",
        "amoxicillin-clavulanate": "Amoxicillin/clavulanic acid",
        "amoxicillin/clavulanate": "Amoxicillin/clavulanic acid",
        "amoxicillin-clavulanic acid": "Amoxicillin/clavulanic acid",
        "amoxicillin-clavulanic": "Amoxicillin/clavulanic acid",
        "amoxicillin/clavulanate acid": "Amoxicillin/clavulanic acid",
        "amoxicillin+clavulanic acid": "Amoxicillin/clavulanic acid",
        "amoxicillin + clavulanic acid": "Amoxicillin/clavulanic acid",
        "amoxicillin with clavulanic acid": "Amoxicillin/clavulanic acid",
        "amoxicillin and clavulanic acid": "Amoxicillin/clavulanic acid",
        "amoxicillin plus clavulanic acid": "Amoxicillin/clavulanic acid",
        "amoxicillin-clavulanate acid": "Amoxicillin/clavulanic acid",
        "amoxicillin clavulanate": "Amoxicillin/clavulanic acid",
        "amoxicillin/clavulanate potassium": "Amoxicillin/clavulanic acid",
        "clavulanate/amoxicillin": "Amoxicillin/clavulanic acid",
        "clavulanic acid-amoxicillin": "Amoxicillin/clavulanic acid",
        "co-amoxiclav": "Amoxicillin/clavulanic acid",
        "augmentin": "Amoxicillin/clavulanic acid",
        "ampicillin-sulbactam": "Ampicillin/sulbactam",
        "ampicillin/sulbactam": "Ampicillin/sulbactam",
        "ampicillin + clavulanic acid": "Ampicillin/clavulanic acid",
        "ampicillin-clavulanic acid": "Ampicillin/clavulanic acid",
        "ampicillin-clavulanate": "Ampicillin/clavulanic acid",
        "ampicillin/clavulanate": "Ampicillin/clavulanic acid",
        "ampicillin/clavulanic acid": "Ampicillin/clavulanic acid",
        "ampicillin+clavulanate": "Ampicillin/clavulanic acid",
        "ampicillin-avibactam": "Ampicillin/avibactam",
        "ampicillin/amoxicillin-clavulanate": "Ampicillin/clavulanic acid",
        "ceftazidime-avibactam": "Ceftazidime/avibactam",
        "ceftazidime/avibactam": "Ceftazidime/avibactam",
        "ceftazidime + avibactam": "Ceftazidime/avibactam",
        "ceftazidime--avibactam": "Ceftazidime/avibactam",
        "ceftazidime–avibactam": "Ceftazidime/avibactam",
        "ceftazidime-clavulanic acid": "Ceftazidime/clavulanic acid",
        "ceftolozane-tazobactam": "Ceftolozane/tazobactam",
        "ceftolozane/tazobactam": "Ceftolozane/tazobactam",
        "trimethoprim-sulfamethoxazole": "Trimethoprim/sulfamethoxazole",
        "trimethoprim/sulfamethoxazole": "Trimethoprim/sulfamethoxazole",
        "trimethoprim sulfamethoxazole": "Trimethoprim/sulfamethoxazole",
        "trimethoprim/sulphamethoxazole": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole-trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole/trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole:trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole+trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole with trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole/trimehtoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole/trimetoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoxazole/triprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethoazole/trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulphamethoxazole/trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulfamethazine/trimethoprim": "Trimethoprim/sulfamethoxazole",
        "sulfonamide-trimethoprim": "Trimethoprim/sulfamethoxazole",
        "cotrimoxazole (smzco)": "Trimethoprim/sulfamethoxazole",
        "tmp-smx": "Trimethoprim/sulfamethoxazole",
        "tmp/smx": "Trimethoprim/sulfamethoxazole",
        "cotrimoxazole": "Trimethoprim/sulfamethoxazole",
        "co-trimoxazole": "Trimethoprim/sulfamethoxazole",
        "meropenem-vaborbactam": "Meropenem/vaborbactam",
        "meropenem/vaborbactam": "Meropenem/vaborbactam",
        "mer-vab": "Meropenem/vaborbactam",
        "imipenem-cilastatin": "Imipenem/cilastatin",
        "imipenem/cilastatin": "Imipenem/cilastatin",
        "imipenem-relebactam": "Imipenem/relebactam",
        "imipenem/relebactam": "Imipenem/relebactam",
        "imipenem--relebactam": "Imipenem/relebactam",
        "imi-rel": "Imipenem/relebactam",
        "cefepime-taniborbactam": "Cefepime/taniborbactam",
        "cefepime/taniborbactam": "Cefepime/taniborbactam",
        "cefepime-zidebactam": "Cefepime/zidebactam",
        "cefepime/zidebactam": "Cefepime/zidebactam",
        "cefepime/avibactam": "Cefepime/avibactam",
        "cefepime-avibactam": "Cefepime/avibactam",
        "ceftibuten-avibactam": "Ceftibuten/avibactam",
        "cefotaxime-clavulanic acid": "Cefotaxime/clavulanic acid",
        "cefotaxime + clavulanic acid": "Cefotaxime/clavulanic acid",
        "cefotaxime/clavulanate": "Cefotaxime/clavulanic acid",
        "cefotaxime/avibactam": "Cefotaxime/avibactam",
        "cefoperazone/sulbactam": "Cefoperazone/sulbactam",
        "ticarcillin-clavulanate": "Ticarcillin/clavulanic acid",
        "ticarcillin/clavulanate": "Ticarcillin/clavulanic acid",
        "ticarcillin-clavulanic acid": "Ticarcillin/clavulanic acid",
        "ticarcillin/clavulanic acid": "Ticarcillin/clavulanic acid",
        "ticarcillin+clavulanic acid": "Ticarcillin/clavulanic acid",
        "ticarcillin + clavulanic acid": "Ticarcillin/clavulanic acid",
        "ticarcillin-clavulonate": "Ticarcillin/clavulanic acid",
        "quinupristin-dalfopristin": "Quinupristin/dalfopristin",
        "quinupristin/dalfopristin": "Quinupristin/dalfopristin",
        "chloramphenicol-florfenicol": "Chloramphenicol/florfenicol",
        "sulbactam-durlobactam": "Sulbactam/durlobactam",
        "aztreonam-avibactam": "Aztreonam/avibactam",
        "aztreonam/avibactam": "Aztreonam/avibactam",
        "ceftazidime/tebipenem": "Ceftazidime/tebipenem",
        "ceftriaxone/aztreonam": "Ceftriaxone/aztreonam",
        "streptomycin and spectinomycin": "Streptomycin/spectinomycin",
        "streptomycin-spectinomycin": "Streptomycin/spectinomycin",
        "amoxicillin + clauvunic acid": "Amoxicillin/clavulanic acid",
        "piperacillin with tazobactam": "Piperacillin/tazobactam",
        "tazocin": "Piperacillin/tazobactam",
        "quaternary ammonium compounds (qacs)": "Quaternary ammonium compounds",
    }
    def override(key, canonical):
        """Override a key and its plural/singular variant."""
        key = key.lower().strip()
        lookup[key] = canonical
        if key.endswith("s"):
            lookup[key[:-1]] = canonical
        else:
            lookup[key + "s"] = canonical

    for key, canonical in _COMBO_ALIASES.items():
        override(key, canonical)

    # Common class-level names and extra aliases
    _CLASS_ALIASES = {
        # --- Antibiotic classes ---
        "fluoroquinolone": "Fluoroquinolones",
        "fluoroquinolones": "Fluoroquinolones",
        "fluroquinolones": "Fluoroquinolones",
        "quinolone": "Quinolones",
        "quinolones": "Quinolones",
        "(fluoro)quinolones": "Fluoroquinolones",
        "aminoglycoside": "Aminoglycosides",
        "aminoglycosides": "Aminoglycosides",
        "aminoglykosides": "Aminoglycosides",
        "beta-lactam": "Beta-lactams",
        "beta-lactams": "Beta-lactams",
        "β-lactam": "Beta-lactams",
        "β-lactams": "Beta-lactams",
        "ß-lactam": "Beta-lactams",
        "ß-lactams": "Beta-lactams",
        "betalactam": "Beta-lactams",
        "beta lactam": "Beta-lactams",
        "beta-lactam antibiotics": "Beta-lactams",
        "β-lactam antibiotics": "Beta-lactams",
        "extended-spectrum beta-lactams": "Beta-lactams",
        "extended-spectrum β-lactams": "Beta-lactams",
        "extended-spectrum-beta-lactams": "Beta-lactams",
        "broad-spectrum beta-lactams": "Beta-lactams",
        "narrow-spectrum beta-lactams": "Beta-lactams",
        "cephalosporin": "Cephalosporins",
        "cephalosporins": "Cephalosporins",
        "cephalosporine": "Cephalosporins",
        "cephalosporines": "Cephalosporins",
        "cepha losporins": "Cephalosporins",
        "third-generation cephalosporins": "Cephalosporins",
        "third generation cephalosporins": "Cephalosporins",
        "3rd generation cephalosporins": "Cephalosporins",
        "3rd-generation cephalosporins": "Cephalosporins",
        "3rd gen. cephalosporin": "Cephalosporins",
        "3rd gen. cephalosporins": "Cephalosporins",
        "second-generation cephalosporins": "Cephalosporins",
        "second generation cephalosporins": "Cephalosporins",
        "first-generation cephalosporins": "Cephalosporins",
        "first generation cephalosporins": "Cephalosporins",
        "first-generation cephalosporin": "Cephalosporins",
        "first generation of cephalosporins": "Cephalosporins",
        "fourth-generation cephalosporins": "Cephalosporins",
        "4th-generation cephalosporins": "Cephalosporins",
        "extended-spectrum cephalosporins": "Cephalosporins",
        "expanded-spectrum cephalosporins": "Cephalosporins",
        "expanded spectrum cephalosporins": "Cephalosporins",
        "broad-spectrum cephalosporins": "Cephalosporins",
        "narrow-spectrum cephalosporins": "Cephalosporins",
        "antipseudomonal cephalosporins": "Cephalosporins",
        "oxyimino cephalosporins": "Cephalosporins",
        "oxyimino-cephalosporins": "Cephalosporins",
        "oxyiminocephalosporins": "Cephalosporins",
        "early cephalosporins": "Cephalosporins",
        "early_generation_cephalosporins": "Cephalosporins",
        "second- and third-generation cephalosporins": "Cephalosporins",
        "cephem": "Cephalosporins",
        "cephems": "Cephalosporins",
        "cephemycin": "Cephalosporins",
        "cephemycins": "Cephalosporins",
        "cephamycin": "Cephalosporins",
        "cephamycins": "Cephalosporins",
        "carbapenem": "Carbapenems",
        "carbapenems": "Carbapenems",
        "penicillin": "Penicillin",
        "penicillins": "Penicillin",
        "penicillin g": "Penicillin",
        "penicillin v": "Penicillin",
        "penicillin-g": "Penicillin",
        "benzylpenicillin": "Penicillin",
        "penam": "Penicillin",
        "penams": "Penicillin",
        "penem": "Carbapenems",
        "penems": "Carbapenems",
        "aminopenicillin": "Aminopenicillins",
        "aminopenicillins": "Aminopenicillins",
        "carboxypenicillins": "Carboxypenicillins",
        "ureidopenicillins": "Ureidopenicillins",
        "acylaminopenicillins": "Ureidopenicillins",
        "monobactam": "Aztreonam",
        "monobactams": "Aztreonam",
        "macrolide": "Macrolides",
        "macrolides": "Macrolides",
        "macrolide-lincosamide-streptogramin": "MLS",
        "macrolide-lincosamide-streptogramin b": "MLS",
        "macrolide-lincosamide-streptogramin-b (mls) antibiotics": "MLS",
        "macrolides-lincosamides-streptogramin b (mls)": "MLS",
        "macrolides-lincosamides-streptogramins": "MLS",
        "macrolides/lincosamides": "MLS",
        "macrolides, lincosamides, streptogramin b": "MLS",
        "mls": "MLS",
        "mls b": "MLS",
        "mls antibiotics": "MLS",
        "mls b antibiotics": "MLS",
        "mls-b": "MLS",
        "mlsb": "MLS",
        "tetracycline": "Tetracycline",
        "tetracyclines": "Tetracycline",
        "tetracyline": "Tetracycline",
        "glycylcycline": "Glycylcyclines",
        "glycylcyclines": "Glycylcyclines",
        "glycopeptide": "Glycopeptides",
        "glycopeptides": "Glycopeptides",
        "lipoglycopeptides": "Glycopeptides",
        "lincosamide": "Lincosamides",
        "lincosamides": "Lincosamides",
        "lincomamide": "Lincosamides",
        "lincomamides": "Lincosamides",
        "lincosamid": "Lincosamides",
        "oxazolidinone": "Oxazolidinones",
        "oxazolidinones": "Oxazolidinones",
        "streptogramin": "Streptogramins",
        "streptogramins": "Streptogramins",
        "streptogramin a": "Streptogramin A",
        "streptogramins a": "Streptogramin A",
        "streptogramin b": "Streptogramin B",
        "streptogramins b": "Streptogramin B",
        "phenicol": "Phenicols",
        "phenicols": "Phenicols",
        "amphenicol": "Phenicols",
        "amphenicols": "Phenicols",
        "chloramphenicols": "Phenicols",
        "pleuromutilin": "Pleuromutilins",
        "pleuromutilins": "Pleuromutilins",
        "pleuromutilines": "Pleuromutilins",
        "polymyxin": "Polymyxins",
        "polymyxins": "Polymyxins",
        "sulfonamide": "Sulfonamides",
        "sulfonamides": "Sulfonamides",
        "sulphonamides": "Sulfonamides",
        "rifamycin": "Rifamycins",
        "rifamycins": "Rifamycins",
        "ansamycins": "Rifamycins",
        "rifampin": "Rifampicin",
        "rifampicin": "Rifampicin",
        "lipopeptide": "Lipopeptides",
        "lipopeptides": "Lipopeptides",
        "nitroimidazole": "Nitroimidazoles",
        "nitroimidazoles": "Nitroimidazoles",
        "nitrofuran": "Nitrofurans",
        "nitrofurans": "Nitrofurans",
        "aminocoumarin": "Aminocoumarin",
        "aminocoumarins": "Aminocoumarin",
        "elfamycin": "Elfamycin",
        "elfamycins": "Elfamycin",
        "elphamycins": "Elfamycin",
        "diaminopyrimidine": "Diaminopyrimidines",
        "diaminopyrimidines": "Diaminopyrimidines",
        "ketolides": "Ketolides",
        "cyclopeptides": "Cyclopeptides",
        # --- Specific antibiotics ---
        "novobiocin": "Novobiocin",
        "tilmicosin": "Tilmicosin",
        "tildipirosin": "Tildipirosin",
        "tulathromycin": "Tulathromycin",
        "gamithromycin": "Gamithromycin",
        "tylosin tartrate": "Tylosin",
        "acriflavine": "Acriflavine",
        "acriflavin": "Acriflavine",
        "carbenicillin": "Carbenicillin",
        "cephalexin": "Cephalexin",
        "cefalexin": "Cephalexin",
        "cefalotin": "Cefalotin",
        "cephaloridine": "Cephaloridine",
        "cephradine": "Cephradine",
        "cefpodoxime-proxetil": "Cefpodoxime",
        "cefpodoxime/proxam": "Cefpodoxime",
        "cefsulodin": "Cefsulodin",
        "cefmetazole": "Cefmetazole",
        "ceftizoxime": "Ceftizoxime",
        "ceftobiprole": "Ceftobiprole",
        "cefidocrol": "Cefiderocol",
        "cefidrogol": "Cefiderocol",
        "cefprozil": "Cefprozil",
        "cefquinome": "Cefquinome",
        "cefloxitin": "Cefoxitin",
        "cephoxitin": "Cefoxitin",
        "cefuxitin": "Cefoxitin",
        "cefamandole": "Cefamandole",
        "cefovecin": "Cefovecin",
        "cefpime": "Cefepime",
        "cefrtriaxone": "Ceftriaxone",
        "cefizime": "Cefixime",
        "cefotaxime sodium": "Cefotaxime",
        "ceftriaxone sodium": "Ceftriaxone",
        "flomoxef": "Flomoxef",
        "carumonam": "Carumonam",
        "mecillinam": "Mecillinam",
        "azlocillin": "Azlocillin",
        "fosmidomycin": "Fosmidomycin",
        "phleomycin": "Phleomycin",
        "bicyclomycin": "Bicyclomycin",
        "nourseothricin": "Nourseothricin",
        "puromycin": "Puromycin",
        "olaquindox": "Olaquindox",
        "tosufloxacin": "Tosufloxacin",
        "enoxacin": "Enoxacin",
        "enoxacine": "Enoxacin",
        "enoxyacin": "Enoxacin",
        "flumequine": "Flumequine",
        "grepafloxacin": "Grepafloxacin",
        "lomefloxacin": "Lomefloxacin",
        "pipemidic acid": "Pipemidic acid",
        "pradofloxacin": "Pradofloxacin",
        "trovafloxacin": "Trovafloxacin",
        "oxolinic acid": "Oxolinic acid",
        "kanamycin a": "Kanamycin",
        "kanamycin b": "Kanamycin",
        "neomycin b": "Neomycin",
        "micronomicin": "Micronomicin",
        "sulfamethazine": "Sulfamethazine",
        "sulfadimethoxine": "Sulfadimethoxine",
        "sulfadimethazine": "Sulfamethazine",
        "sulfamonomethoxine": "Sulfamonomethoxine",
        "sulfathiazole": "Sulfathiazole",
        "sulfacetamide": "Sulfacetamide",
        "sulfachloropyridazine": "Sulfachloropyridazine",
        "sulfadiazine sodium": "Sulfadiazine",
        "sulfadoxine": "Sulfadoxine",
        "sulfafurazole": "Sulfisoxazole",
        "sulfamisoxazole": "Sulfisoxazole",
        "sulfisoxazole": "Sulfisoxazole",
        "sulfanilamide": "Sulfanilamide",
        "sulbactam": "Sulbactam",
        "tazobactam": "Tazobactam",
        "vaborbactam": "Vaborbactam",
        "avibactam": "Avibactam",
        "relebactam": "Relebactam",
        "durlobactam": "Durlobactam",
        "furazolidone": "Furazolidone",
        "solithromycin": "Solithromycin",
        "cethromycin": "Cethromycin",
        "pirlimycin": "Pirlimycin",
        "d-cycloserine": "Cycloserine",
        "pseudomonic acid": "Mupirocin",
        "fusidic acid": "Fusidic acid",
        "nalidixic acid": "Nalidixic acid",
        "para-aminosalicylic acid": "Para-aminosalicylic acid",
        "para-aminosalicylic acid (pas)": "Para-aminosalicylic acid",
        "4-aminosalicylic acid": "Para-aminosalicylic acid",
        "paraminosalicylic acid": "Para-aminosalicylic acid",
        "sulopenem": "Sulopenem",
        "bacitracin": "Bacitracin",
        "polymyxin b sulfate": "Polymyxin B",
        "colistin e": "Colistin",
        # --- Abbreviations ---
        "nal": "Nalidixic acid",
        "ctx": "Cefotaxime",
        "fep": "Cefepime",
        "mem": "Meropenem",
        "dor": "Doripenem",
        "amc": "Amoxicillin/clavulanic acid",
        "cfm": "Cefixime",
        "caz": "Ceftazidime",
        "cro": "Ceftriaxone",
        "fox": "Cefoxitin",
        "car": "Carbenicillin",
        "lex": "Cephalexin",
        "sul": "Sulfonamides",
        "amp": "Ampicillin",
        "pb": "Polymyxin B",
        "azi": "Azithromycin",
        "eft": "Ceftiofur",
        "aml": "Amoxicillin",
        "cet": "Cefotetan",
        "flor": "Florfenicol",
        "tgc": "Tigecycline",
        "fam": "Faropenem",
        "lvx": "Levofloxacin",
        "ofl": "Ofloxacin",
        "naf": "Nafcillin",
        "fua": "Fusidic acid",
        "cli": "Clindamycin",
        "tri": "Trimethoprim",
        "dcs": "Cycloserine",
        "eth": "Ethionamide",
        "cm": "Chloramphenicol",
        "sm": "Streptomycin",
        "km": "Kanamycin",
        "stm": "Streptomycin",
        "nov": "Novobiocin",
        "fos": "Fosfomycin",
        "bl": "Beta-lactams",
        "fq": "Fluoroquinolones",
        # --- Beta-lactam/BLI combo class terms ---
        "beta-lactam drugs": "Beta-lactams",
        "beta-lactam antimicrobial drugs": "Beta-lactams",
        "beta-lactam penicillin": "Beta-lactams",
        "beta-lactam-ring-containing drugs": "Beta-lactams",
        "other beta-lactams": "Beta-lactams",
        "other beta-lactam antibiotics": "Beta-lactams",
        "other β-lactam antibiotics": "Beta-lactams",
        "other β-lactams": "Beta-lactams",
        "some beta-lactams": "Beta-lactams",
        "all beta-lactams": "Beta-lactams",
        "all β-lactam antibiotics except monobactams": "Beta-lactams",
        "all beta-lactams except cephalosporins": "Beta-lactams",
        "all beta-lactams, including carbapenems, except aztreonam": "Beta-lactams",
        "non-carbapenem beta-lactam antibiotics": "Beta-lactams",
        "ampc β-lactams": "Beta-lactams",
        "related β-lactams": "Beta-lactams",
        "oxyimino-β-lactams": "Beta-lactams",
        "β-lactam inhibitors": "Beta-lactams",
        "beta-lactam inhibitors": "Beta-lactams",
        "beta-lactamase": "Beta-lactamase inhibitors",
        "beta-lactamases": "Beta-lactamase inhibitors",
        "beta-lactamase inhibitor": "Beta-lactamase inhibitors",
        "beta-lactamase inhibitors": "Beta-lactamase inhibitors",
        "beta-lactam/beta-lactamase inhibitors": "Beta-lactams/beta-lactamase inhibitors",
        "beta-lactam/beta-lactamase inhibitor combinations": "Beta-lactams/beta-lactamase inhibitors",
        "beta-lactams/beta-lactamase inhibitors": "Beta-lactams/beta-lactamase inhibitors",
        "beta-lactam-beta-lactamase-inhibitor combinations": "Beta-lactams/beta-lactamase inhibitors",
        "beta-lactamase inhibitor-β-lactam combinations": "Beta-lactams/beta-lactamase inhibitors",
        "beta-lactam/inhibitor combinations": "Beta-lactams/beta-lactamase inhibitors",
        "beta-lactam/bli combinations": "Beta-lactams/beta-lactamase inhibitors",
        "β-lactam/bli combinations": "Beta-lactams/beta-lactamase inhibitors",
        "cephalosporins/cephamycins": "Cephalosporins",
        "cephalosporin_i": "Cephalosporins",
        "cephalosporin_ii": "Cephalosporins",
        "cephalosporin_iii": "Cephalosporins",
        "cephalosporin-i": "Cephalosporins",
        "cephalosporin-ii": "Cephalosporins",
        # --- Misspellings / variant names ---
        "gentamycin": "Gentamicin",
        "meticillin": "Methicillin",
        "pipercillin": "Piperacillin",
        "florphenicol": "Florfenicol",
        "fluro(quinolones)": "Fluoroquinolones",
        "amphencols": "Phenicols",
        "chlorohexidine": "Chlorhexidine",
        "apr amycin": "Apramycin",
        # --- Additional specific antibiotics ---
        "amphotericin b": "Amphotericin B",
        "nystatin": "Nystatin",
        "ceftibuten": "Ceftibuten",
        "rifapentine": "Rifapentine",
        "rifaximin": "Rifaximin",
        "valnemulin": "Valnemulin",
        "virginiamycin m1": "Virginiamycin",
        "garenoxacin": "Garenoxacin",
        "ertapenem/cilastatin": "Ertapenem/cilastatin",
        # --- Fluoroquinolones (veterinary / newer) ---
        "gemifloxacin": "Gemifloxacin",
        "danofloxacin": "Danofloxacin",
        "marbofloxacin": "Marbofloxacin",
        "clinafloxacin": "Clinafloxacin",
        "orbifloxacin": "Orbifloxacin",
        "difloxacin": "Difloxacin",
        "prulifloxacin": "Prulifloxacin",
        "antofloxacin": "Antofloxacin",
        "nadifloxacin": "Nadifloxacin",
        "pazufloxacin": "Pazufloxacin",
        "premafloxacin": "Premafloxacin",
        "nemonoxacin": "Nemonoxacin",
        "gepotidacin": "Gepotidacin",
        "ciprofloxycin": "Ciprofloxacin",
        "enaloxacin": "Enoxacin",
        # --- BLI / combo terms ---
        "clavulanate": "Clavulanic acid",
        "clavulanic acid": "Clavulanic acid",
        "clavulanic_acid": "Clavulanic acid",
        "relebactam": "Relebactam",
        "imipenem/cilastatin/relebactam": "Imipenem/relebactam",
        "penicillin-clavulanic acid": "Penicillin/clavulanic acid",
        "tebipenem": "Tebipenem",
        # --- Oxazolidinones (newer) ---
        "sutezolid": "Sutezolid",
        "contezolid": "Contezolid",
        "delpazolid": "Delpazolid",
        "topezolid": "Topezolid",
        # --- Other specific antibiotics ---
        "cefotiam": "Cefotiam",
        "tigecylline": "Tigecycline",
        "streptovaricin": "Streptovaricin",
        "rifalazil": "Rifalazil",
        "teixobactin": "Teixobactin",
        "ramoplanin": "Ramoplanin",
        "cervimycin": "Cervimycin",
        "actinorhodin": "Actinorhodin",
        "formycin": "Formycin",
        "hygromycin a": "Hygromycin",
        "gramicidin": "Gramicidin",
        "trimethoprim/sulfa-methoxazole": "Trimethoprim/sulfamethoxazole",
        # --- Antiseptics/biocides (kept as categories) ---
        "quaternary ammonium compounds": "Quaternary ammonium compounds",
        "quaternary ammonium": "Quaternary ammonium compounds",
        "quaternary_ammonium_compounds": "Quaternary ammonium compounds",
        "quaternary_ammonium": "Quaternary ammonium compounds",
        "benzalkonium chloride": "Benzalkonium chloride",
        "benzalkonium": "Benzalkonium chloride",
        "chlorhexidine": "Chlorhexidine",
        "triclosan": "Triclosan",
        "ethidium bromide": "Ethidium bromide",
        "ionophore": "Ionophores",
        "ionophores": "Ionophores",
        "steroid antibacterial": "Steroid antibacterial",
        "ethidium": "Ethidium bromide",
        "mitomycin c": "Mitomycin C",
        "mitomycin": "Mitomycin C",
        # --- Uppercase abbreviations -> full names ---
        "amk": "Amikacin",
        "amx": "Amoxicillin",
        "atm": "Aztreonam",
        "bdq": "Bedaquiline",
        "cap": "Capreomycin",
        "chl": "Chloramphenicol",
        "cip": "Ciprofloxacin",
        "dlm": "Delamanid",
        "ery": "Erythromycin",
        "flo": "Florfenicol",
        "gen": "Gentamicin",
        "inh": "Isoniazid",
        "ipm": "Imipenem",
        "kan": "Kanamycin",
        "lzd": "Linezolid",
        "mac": "Macrolides",
        "neo": "Neomycin",
        "nor": "Norfloxacin",
        "oxa": "Oxacillin",
        "rif": "Rifampicin",
        "str": "Streptomycin",
        "sxt": "Trimethoprim/sulfamethoxazole",
        "tet": "Tetracycline",
        "tmp": "Trimethoprim",
        "tob": "Tobramycin",
        "trc": "Tetracycline",
        # --- Variant forms ---
        "piperacillin+tazobactam": "Piperacillin/tazobactam",
        "rifampin": "Rifampicin",
        # --- Antimalarials ---
        "artemisinin": "Artemisinin",
        "artemisinin_candidate": "Artemisinin",
        "amodiaquine": "Amodiaquine",
        "chloroquine": "Chloroquine",
        "lumefantrine": "Lumefantrine",
        "mefloquine": "Mefloquine",
        "piparaquine": "Piperaquine",
        "piperaquine": "Piperaquine",
        "pyrimethamine": "Pyrimethamine",
        "sulphadoxine": "Sulfadoxine",
        # --- Additional antibiotics ---
        "fidaxomicin": "Fidaxomicin",
        "nitroxoline": "Nitroxoline",
        "zoliflodacin": "Zoliflodacin",
        "para-aminosalicyclic acid": "Para-aminosalicylic acid",
        "hyrgomycin b": "Hygromycin B",
        "kasugamicin": "Kasugamycin",
    }
    for key, canonical in _CLASS_ALIASES.items():
        override(key, canonical)

    # Remove vague/non-antibiotic terms that may appear in the reference files
    for term in ("none", "multiple_drugs", "folate pathway antagonist"):
        lookup.pop(term, None)
        lookup.pop(term + "s", None)
        if term.endswith("s"):
            lookup.pop(term[:-1], None)

    return lookup


def normalize_antibiotic(name):
    """Lowercase, replace special characters with spaces, collapse whitespace."""
    name = name.strip()
    if not name:
        return name
    name = name.lower()
    name = re.sub(r"[/\-+_()&,]", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def resolve_antibiotic(part, antibiotics_lookup):
    """Try to resolve a resistance value to a canonical antibiotic name."""
    key = part.lower().strip()
    if not key:
        return None

    # Direct match
    hit = antibiotics_lookup.get(key)
    if hit:
        return hit

    # Try stripping trailing 's'
    if key.endswith("s") and len(key) > 3:
        hit = antibiotics_lookup.get(key[:-1])
        if hit:
            return hit

    # Try adding 's'
    hit = antibiotics_lookup.get(key + "s")
    if hit:
        return hit

    # Normalize double-hyphens and en-dashes
    normalized = key.replace("--", "-").replace("–", "-").replace("—", "-")
    if normalized != key:
        hit = antibiotics_lookup.get(normalized)
        if hit:
            return hit

    # Strip " antibiotic" / " antibiotics" suffix
    for suffix in (" antibiotics", " antibiotic"):
        if key.endswith(suffix):
            base = key[:-len(suffix)]
            hit = antibiotics_lookup.get(base)
            if hit:
                return hit
            hit = antibiotics_lookup.get(base + "s")
            if hit:
                return hit

    # Strip underscores -> spaces
    if "_" in key:
        spaced = key.replace("_", " ")
        hit = antibiotics_lookup.get(spaced)
        if hit:
            return hit

    return None


def clean_resistance(value, antibiotics_lookup):
    """Filter pipe-separated resistance values, keeping only recognized antibiotics.
    Standardize capitalization and deduplicate."""
    if pd.isna(value) or not str(value).strip():
        return ""
    parts = str(value).split("|")
    seen = set()
    kept = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        canonical = resolve_antibiotic(part, antibiotics_lookup)
        if canonical is None:
            continue
        canonical = normalize_antibiotic(canonical)
        dedup_key = canonical.lower()
        if dedup_key not in seen:
            seen.add(dedup_key)
            kept.append(canonical)
    return "|".join(kept)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Loading reference files...")
    species_set, genus_set, abbrev_map = load_species(SPECIES_FILE)
    print(f"  {len(species_set)} unique genus+species and {len(genus_set)} unique genera loaded from {SPECIES_FILE.name}")

    antibiotics_lookup = load_antibiotics(ANTIBIOTICS_NAMES_FILE, ANTIBIOTICS_ABBREV_FILE)
    print(f"  {len(antibiotics_lookup)} antibiotic name variants loaded")

    print(f"\nReading {INPUT_CSV.name}...")
    df = pd.read_csv(INPUT_CSV, low_memory=False)
    total_rows = len(df)
    print(f"  {total_rows} rows")

    # --- Clean Organism column ---
    print("\nCleaning Organism column...")
    org_before = df["Organism"].copy()
    df["Organism"] = df["Organism"].apply(lambda v: clean_organism(v, species_set, genus_set, abbrev_map))

    org_changed = (org_before.fillna("") != df["Organism"].fillna("")).sum()
    org_emptied = ((org_before.fillna("") != "") & (df["Organism"] == "")).sum()
    print(f"  {org_changed} rows modified")
    print(f"  {org_emptied} rows had all organisms removed (no bacterial species found)")

    removed_orgs = {}
    for before_val, after_val in zip(org_before.fillna(""), df["Organism"].fillna("")):
        before_set = {o.strip() for o in str(before_val).split("|") if o.strip()}
        after_set = {o.strip() for o in str(after_val).split("|") if o.strip()}
        for removed in before_set - after_set:
            removed_orgs[removed] = removed_orgs.get(removed, 0) + 1

    if removed_orgs:
        print(f"\n  Top 30 removed organisms:")
        for org, count in sorted(removed_orgs.items(), key=lambda x: -x[1])[:30]:
            print(f"    {count:5d}x  {org}")

    # --- Clean Resistance column ---
    print("\nCleaning Resistance column...")
    res_before = df["Resistance"].copy()
    df["Resistance"] = df["Resistance"].apply(lambda v: clean_resistance(v, antibiotics_lookup))

    res_changed = (res_before.fillna("") != df["Resistance"].fillna("")).sum()
    res_emptied = ((res_before.fillna("") != "") & (df["Resistance"] == "")).sum()
    print(f"  {res_changed} rows modified")
    print(f"  {res_emptied} rows had all resistance values removed (no recognized antibiotics)")

    removed_res = {}
    for before_val in res_before.fillna(""):
        for part in str(before_val).split("|"):
            part = part.strip()
            if not part:
                continue
            if resolve_antibiotic(part, antibiotics_lookup) is None:
                removed_res[part.lower()] = removed_res.get(part.lower(), 0) + 1

    if removed_res:
        print(f"\n  Top 50 truly removed resistance values (not recognized):")
        for res, count in sorted(removed_res.items(), key=lambda x: -x[1])[:50]:
            print(f"    {count:5d}x  {res}")

    # Drop rows with empty Resistance
    before_drop = len(df)
    df = df[df["Resistance"].fillna("").str.strip() != ""]
    dropped = before_drop - len(df)
    print(f"\n  Dropped {dropped} rows with no recognized antibiotic in Resistance")
    print(f"  {len(df)} rows remaining")

    # Save
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"\nSaved to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
