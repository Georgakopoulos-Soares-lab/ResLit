python3 enrich_database_metadata.py     other_databases/genes_databases_allOther.csv     other_databases/genes_databases_enriched.csv     --email skulakis@gmail.com

CLAUDE 
no for start i want for this file /home/argis/Desktop/austin/reslit/site/paper/other_databases/amr_genes/Full_list_genes_otherDatabases.csv to check the allele and the encodes as in the most of times the allele is not correct, is the same of the gene and the allele is referred to the encodes. Can you do this for me in a new file called /home/argis/Desktop/austin/reslit/site/paper/other_databases/amr_genes/Full_list_genes_otherDatabases_AlleleCorrected.csv


cd /home/argis/Desktop/austin/reslit/site/paper/other_databases/amr_genes && python3 remove_snp_matches.py

cd /home/argis/Desktop/austin/reslit/site/paper/other_databases/amr_genes && python3 concatenate_duplicate_rows.py

cd /home/argis/Desktop/austin/reslit/site/paper/other_databases/amr_genes && python3 fix_bla_alleles.py


Step 6: Backfill missing PMID / Resistance for Card Database rows via ARO lookup
    Script: fill_card_pubmed_antibiotic.py
    Input:  Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv
            genes_annotation_databases.csv  (the earlier, pre-fanout 3-database merge)
    Output: Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed_pubmed_antibiotic_corrected.csv

    Many Card Database rows in the bla_fixed file lost their PMID and/or
    Resistance (antibiotic class) somewhere between genes_annotation_databases.csv
    and the final file, even though genes_annotation_databases.csv itself still
    has that data for the same CARD entry. This step recovers it by matching on
    ARO number instead of re-deriving it:

    - Builds an index from genes_annotation_databases.csv: every ARO:NNNNN token
      found in a row's Notes column -> that row's pubmed_reference and subclass
      values (aggregated across rows, since 3,739 ARO numbers appear more than
      once in genes_annotation_databases.csv).
    - For every Card Database row in the bla_fixed file with an empty PMID and/or
      empty Resistance, extracts the ARO:NNNNN token(s) from that row's own Notes
      column (Notes carries the ARO accession all the way through the pipeline)
      and looks them up in the index.
    - PMID is filled from the first non-"-" pubmed_reference found across the
      matched ARO entries (same "first PMID only if multiple" convention used in
      convert_annotation_databases.py).
    - Resistance is filled from the matched entries' subclass values: comma-split,
      deduplicated, rejoined with "|" (same subclass -> Resistance transformation
      already used earlier in the pipeline, in convert_annotation_databases.py).
    - Already-populated PMID/Resistance values, and non-Card rows, are left
      untouched. Row count is unchanged (22082 in, 22082 out).

    Results (verified run):
    - 8525 Card Database rows total; 5930 missing PMID and/or Resistance
    - Resistance: 2943/2943 filled (100% -- CARD's own subclass field is never
      empty at the source)
    - PMID: 1436/5928 filled; 4492 still missing (genuinely missing at the CARD
      source too -- 4050 Card rows in genes_annotation_databases.csv have
      pubmed_reference == "-")
    - 207 targeted rows had no ARO match at all in genes_annotation_databases.csv

#not runned 

Step 5: Clean Organism and Resistance columns
    Script: clean_other_genes.py
    Input:  Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv
    Output: Full_list_genes_otherDatabases_clean.csv

    Applies the same cleaning pipeline used for the Reslit data
    (clean_organism_resistance.py):

    Organism cleaning:
    - Checks each organism against available_species.txt
    - Removes non-biological entries (plasmids, metagenomes, synthetic constructs)
    - 129 rows modified, 129 rows had all organisms removed

    Resistance cleaning:
    - Splits each cell by '|' and ',' separators
    - Resolves abbreviations to full names (AMK -> amikacin, CIP -> ciprofloxacin)
    - Resolves combo drugs via alias table
      (e.g. PIPERACILLIN+TAZOBACTAM -> piperacillin tazobactam,
       CEFTAZIDIME+AVIBACTAM -> ceftazidime avibactam)
    - Normalizes all values to lowercase with no special characters
    - Merges variant forms (e.g. RIFAMPIN -> rifampicin)
    - Removes vague/non-antibiotic terms (EFFLUX, INACTIVE, UNKNOWN AMINOGLYCOSIDE,
      UNKNOWN BETA-LACTAM, UNKNOWN QUINOLONE)
    - Deduplicates within each cell
    - Output uses '|' as separator

    Row removal:
    - Rows with no recognized antibiotic in Resistance are dropped
      (2943 originally empty + 748 emptied by cleaning = 3691 dropped)
    - 18391 rows remaining (from 22082)

