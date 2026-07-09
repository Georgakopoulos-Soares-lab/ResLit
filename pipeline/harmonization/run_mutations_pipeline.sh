#!/usr/bin/env bash
# Mutations post-extraction pipeline. Run from inside this directory.
# Requires extraction_summary_batch1.json .. batch6.json (raw QWEN extraction
# output — not included in this repo, see ../readme_pipeline.txt) to be present here.
# Steps in triple-quoted blocks below were done as manual QA, not scripted —
# see ../readme_pipeline.txt "Manual QA step" for the exact rules that were applied.

python qwen3_mutations_to_csv.py extraction_summary_batch1.json mutations_batch1.csv
python qwen3_mutations_to_csv.py extraction_summary_batch2.json mutations_batch2.csv 
python qwen3_mutations_to_csv.py extraction_summary_batch3.json mutations_batch3.csv 
python qwen3_mutations_to_csv.py extraction_summary_batch4.json mutations_batch4.csv 
python qwen3_mutations_to_csv.py extraction_summary_batch5.json mutations_batch5.csv 
python qwen3_mutations_to_csv.py extraction_summary_batch6.json mutations_batch6.csv 

head -1 mutations_batch1.csv > mutations_all.csv && tail -n +2 -q mutations_batch*.csv >> mutations_all.csv

python3 enrich_database_metadata.py \
    mutations_all.csv \
    mutations_all_enriched.csv \
    --email skulakis@gmail.com

"""
python3 -c "
import csv, sys
with open('mutations_all_enriched.csv') as f, open('mutations_all_final.csv', 'w', newline='') as out:
    r = csv.DictReader(f)
    w = csv.DictWriter(out, fieldnames=r.fieldnames)
    w.writeheader()
    for row in r:
        if row['normalised_gene_mutation'].strip() or row['normalised_protein_change'].strip():
            w.writerow(row)
"
"""

"""
i also remove mutations that have no normalised protein with correct format . 
removed the ones that have ? in normalised protein change nad in nucleotide change 
 i change all rss+something to rrs 
 i remove the rrs that said 23s and also i remove rrl that said 50s 
and after selecting only the rows with microorganisms reproted i create the file mutations_all_final_organisms.csv

 python build_reslit_mutations.py
"""

# Step: Fix gene name capitalization in Full_list_mutations_Reslit.csv
# Match gene names against the reference list Bacteria_genes_all.txt to restore
# proper capitalization. Both sides are normalized (lowercase, strip primes/quotes)
# before matching. When a match is found, the capitalization from
# Bacteria_genes_all.txt is used.
# Script: fix_gene_capitalization_reslit.py
# Result: 211 out of 1180 unique genes were corrected (e.g. GyrA -> gyrA,
#         RpoB -> rpoB, PBP2x -> pbp2x, rv0678 -> Rv0678).
#         180 genes had no match in Bacteria_genes_all.txt and were left as-is.
python3 fix_gene_capitalization_reslit.py

python clean_mutations.py
