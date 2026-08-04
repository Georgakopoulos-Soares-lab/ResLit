
python qwen3_to_csv.py extraction_summary_batch1.json genes_batch1.csv
python qwen3_to_csv.py extraction_summary_batch2.json genes_batch2.csv
python qwen3_to_csv.py extraction_summary_batch3.json genes_batch3.csv
python qwen3_to_csv.py extraction_summary_batch4.json genes_batch4.csv
python qwen3_to_csv.py extraction_summary_batch5.json genes_batch5.csv
python qwen3_to_csv.py extraction_summary_batch6.json genes_batch6.csv

awk 'FNR==1 && NR!=1 {next} {print}' genes_batch{1..6}.csv > genes_all.csv

cat genes_all.csv | grep "experimentally_characterized" > genes_all_experimentally_characterized.csv 

head -n 1 genes_all.csv > header.csv

cat header.csv genes_all_experimentally_characterized.csv > genes_all_experimental_characterized.csv

python3 - <<'EOF'
import pandas as pd

def normalize_gene_name(name):
    if pd.isna(name):
        return name
    name = str(name).lower()
    name = (name.replace('′', '')
                .replace('ʹ', '')
                .replace(''', '')
                .replace(''', '')
                .replace('`', '')
                .replace('´', '')
                .replace("'", '')
                .replace('"', ''))
    return name

df = pd.read_csv('genes_all_experimental_characterized.csv', low_memory=False)
df.insert(df.columns.get_loc('gene_name') + 1, 'gene_name_normalised', df['gene_name'].apply(normalize_gene_name))
df.to_csv('normalised_genes_all_experimental_characterized.csv', index=False)
EOF

#Removce lines that have rrs , cya6mannnnnngrty, 
#and also remove lines that do not have a paper title 
awk -v FPAT='([^,]*)|("([^"]|"")*")' 'NR == 1 || ($2 != "" && $2 != "\"\"")' normalised_genes_all_experimental_characterized.csv > normalised_genes_all_experimental_characterized_full.csv

awk '{ 
    sub(/\r$/, ""); # Safety check to remove hidden Windows line-breaks
    if (NR == 1) 
        print $0 ",Database" 
    else 
        print $0 ",Reslit" 
}' normalised_genes_all_experimental_characterized_full.csv > normalised_genes_all_experimental_characterized_full_final.csv


python build_reslit_genes.py

python3 ../../other_databases/genes/harmonize_names.py

# Step: Fix gene name capitalization in Full_list_genes_Reslit_harmonized.csv
# Match gene names against the reference list Bacteria_genes_all.txt to restore
# proper capitalization. Both sides are normalized (lowercase, strip primes/quotes)
# before matching. When a match is found, the capitalization from
# Bacteria_genes_all.txt is used.
# Script: fix_gene_capitalization_genes.py
# Result: 1419 out of 3716 unique genes were corrected (e.g. blaVEB -> blaVEB,
#         ampC -> ampC, sul1 -> sul1, etc.).
#         1121 genes had no match in Bacteria_genes_all.txt and were left as-is
#         (mostly allele variants with complex suffixes, fused names, or
#         LLM artifacts like "aac(6)-lb-cr", "bla(oxa-51-like)", etc.).
python3 fix_gene_capitalization_genes.py
python3 clean_organism_resistance.py 