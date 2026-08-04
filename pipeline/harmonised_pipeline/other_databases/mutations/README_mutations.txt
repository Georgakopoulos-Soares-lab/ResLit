Pipeline for building Full_list_mutations_otherDatabases.csv
=============================================================

This folder contains all scripts and intermediate files used to combine
point-mutation data from three AMR databases (ResFinder, AMRFinderPlus, CARD)
into a single, uniformly-formatted table.

Input files
-----------
- resfinder_pointMutations.xlsx        (from ResFinder / PointFinder)
- ReferenceGeneCatalog_PointMutations.csv  (from AMRFinderPlus)
- snps.txt                             (from CARD)
- shortname_antibiotics.tsv            (from CARD, maps drug abbreviations to full names;
                                        located at ../databases/card/)
- aro_index.tsv                        (from CARD, maps ARO accessions to DNA accessions;
                                        located at ../databases/card/)

Steps
-----

Step 1: Expand ResFinder multi-codon rows
    Script: expand_res_codon.py
    Input:  resfinder_pointMutations.xlsx
    Output: resfinder_pointMutations_expanded.xlsx

    Some ResFinder rows contain multiple Res_codon values separated by commas
    (e.g. "T,I"). This script splits each such row into separate rows so that
    every row represents a single mutation.

Step 2: Concatenate mutations from all three databases
    Script: concatenate_details.py  (Python rewrite of the original concatenate_details.R)
    Input:  resfinder_pointMutations_expanded.xlsx
            ReferenceGeneCatalog_PointMutations.csv
            snps.txt
            shortname_antibiotics.tsv (for CARD drug abbreviation lookup)
    Output: full_list_mutations.csv

    Parses mutations from each database into a uniform schema with columns:
    Database, TypeGene (AA/NUC), Organism, Gene, Gene_accession, Mutation,
    Codon_pos, Ref_codon, Res_codon, Class, Resistance, paper_pmid, Mechanism,
    Notes, Gene_normalized, Change, paper_title, publication_year.

    Key processing:
    - Extracts gene name, codon position, reference codon, and resistant codon
      from each database's mutation format.
    - Classifies mutations as amino-acid (AA) or nucleotide (NUC) level based
      on rRNA gene annotations, promoter positions, or lowercase nucleotide
      notation (CARD).
    - CARD drug abbreviations are resolved to full antibiotic names using
      shortname_antibiotics.tsv.
    - Multi-PMID cells (comma/semicolon-separated, or Excel-mangled floats)
      are exploded so each row has a single PMID.
    - A normalized gene name (Gene_normalized) is created for cross-database
      matching. The normalization (_slug function) lowercases the name and
      removes all characters except letters and digits using:
          re.sub(r"[^a-z0-9]", "", name.lower())
      This collapses variants like "gyrA_1", "#embB", "16S-rrsB", and "GyrA"
      into a single comparable key (e.g. "gyra1", "embb", "16srrsb", "gyra"),
      so the same gene can be matched across ResFinder, AMRFinder, and CARD
      despite different naming conventions.

Step 3: Enrich with paper titles and publication years from PubMed
    Script: ../../enrich_database_metadata.py  (shared enrichment script)
    Input:  full_list_mutations.csv
    Output: full_list_mutations_enriched.csv

    Command:
        python3 ../../enrich_database_metadata.py \
            full_list_mutations.csv \
            full_list_mutations_enriched.csv \
            --email skulakis@gmail.com

    For each row with a paper_pmid, queries PubMed to fill in paper_title and
    publication_year. Rows without a PMID are searched via GenBank accession.

Step 4: Remove promoter rows mislabeled as amino-acid mutations
    Script: remove_promoter_aa_mismatches.py
    Input:  full_list_mutations_enriched.csv  (overwritten in place)
    Output: full_list_mutations_enriched.csv  (cleaned, overwritten)
            removed_mutations.csv             (discarded rows for inspection)

    Removes rows where TypeGene is "AA" but the Gene column contains "promoter"
    (e.g. "embA-promoter-size-115bp"), since promoter mutations are nucleotide-
    level and were mislabeled.

Step 5: Add DNA accession numbers
    Script: add_dna_accession.py
    Input:  full_list_mutations_enriched.csv
            ../databases/card/aro_index.tsv  (for CARD ARO-to-DNA mapping)
    Output: full_list_mutations_enriched_with_dna_accession.csv

    Resolves a DNA_Accession for each row:
    - CARD: maps "CARD:{id}" to a DNA accession via the ARO index.
    - AMRFinder: uses Gene_accession directly (already a GenBank accession).
    - ResFinder: extracts the NCBI accession from the end of Gene_accession
      (e.g. "gyrA_1_LR134511.1" -> "LR134511.1").

Step 6: Add organism names from NCBI taxonomy
    Script: add_organism_accession.py
    Input:  full_list_mutations_enriched_with_dna_accession.csv
    Output: full_list_mutations_enriched_with_organism.csv

    Queries NCBI for each unique DNA_Accession:
    1. Batch esummary on the nucleotide database to get TaxIds.
    2. Batch efetch on the taxonomy database to get ScientificName for each TaxId.
    Results are cached locally in .ncbi_organism_cache.json to avoid redundant
    NCBI queries on re-runs.

Step 7: Build the final output table
    Script: build_final_mutations.py
    Input:  full_list_mutations_enriched_with_organism.csv
    Output: Full_list_mutations_otherDatabases.csv

    Maps the enriched columns into the final schema:
    - Splits Change into Nucleotide_Change (for NUC rows) or Protein_Change
      (for AA rows).
    - Uses Gene_normalized as Gene.
    - Takes the first two words of organism_accession as Organism (genus + species).
    - For CARD rows, appends "CARD accession: CARD:XXXXX" to Notes.
    - Leaves Encodes, Validated_by, and Origin empty (to be filled later or
      from other sources).

    Final columns: Database, Nucleotide_Change, Protein_Change, Gene, Encodes,
    Mechanism, Resistance, Organism, Validated_by, Notes, Accession, PMID,
    Paper_title, Publication_year, Origin.

Step 8: Fix gene name capitalization
    Script: fix_gene_capitalization.py
    Input:  Full_list_mutations_otherDatabases.csv
            ../../Bacteria_genes_all.txt  (reference list of gene names)
    Output: Full_list_mutations_otherDatabases.csv  (overwritten in place)

    After Step 7 the Gene column contains only lowercase names (from the _slug
    normalization). This step restores proper capitalization by matching each
    gene against the reference list in Bacteria_genes_all.txt.

    Both sides are normalized before matching using:
        - lowercase
        - strip prime characters (′ ʹ), quotes (' ' ` ´ ' "), and whitespace

    When a normalized gene matches a reference entry, the original
    capitalization from Bacteria_genes_all.txt is used (e.g. "gyra" -> "gyrA",
    "rpob" -> "rpoB", "rv0678" -> "Rv0678"). Genes with no match in the
    reference list are kept as-is.

    Result: 195 out of 249 unique genes were corrected. 32 genes had no match
    in Bacteria_genes_all.txt (e.g. blaoxa143, dhfr, dhps, k13, porin) and
    were left unchanged.

Step 9: Clean Organism, Resistance, and Nucleotide_Change columns
    Script: clean_other_mutations.py
    Input:  Full_list_mutations_otherDatabases.csv
    Output: Full_list_mutations_otherDatabases_clean.csv

    Applies the same cleaning pipeline used for the Reslit data
    (clean_organism_resistance.py) with adaptations for separator differences:

    Organism cleaning:
    - Checks each organism against available_species.txt
    - Keeps bacterial, fungal, and parasite entries; removes non-biological entries
    - 14 rows modified, 14 rows had all organisms removed

    Resistance cleaning:
    - This file uses '/' and ',' as separators (not '|' like the Reslit files)
    - Splits each cell by ',' and '&' first, then by '/' for multi-drug values
      (e.g. "AMIKACIN/GENTAMICIN/KANAMYCIN/TOBRAMYCIN" -> 4 separate antibiotics)
    - Combo drugs using '-' are resolved as single entries via the combo alias table
      (e.g. "AZTREONAM-AVIBACTAM" -> "aztreonam avibactam")
    - Resolves abbreviations to full names (AMK -> amikacin, CIP -> ciprofloxacin)
    - Normalizes all values to lowercase with no special characters
      (e.g. "Trimethoprim/sulfamethoxazole" -> "trimethoprim sulfamethoxazole")
    - Removes vague/non-antibiotic terms (EFFLUX, Unknown, Multiple antibiotics,
      XDR-TB, NfxB, pandas artifacts like "dtype: object")
    - Deduplicates within each cell
    - Output uses '|' as separator

    Nucleotide/Protein position validation:
    - When both Nucleotide_Change and Protein_Change have a position number,
      the nucleotide position must be approximately 3x the protein position (+-2)
    - If not, the Nucleotide_Change is cleared (the number was likely a copy of
      the protein position, not an actual nucleotide coordinate)

    Row removal:
    - Rows with no recognized antibiotic in Resistance are dropped
    - Exception: promoter mutations (negative position in Nucleotide_Change)
      are kept even with empty Resistance
    - 180 rows dropped, 8792 rows remaining

Change these manually
