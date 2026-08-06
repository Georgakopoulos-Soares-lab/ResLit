import sqlite3
import pandas as pd
import torch
from tqdm.auto import tqdm
import os
import sys
import argparse
os.environ["HF_HOME"] = "/work/11252/skulakis/projects/reslit/hf_cache"
from transformers import AutoTokenizer, AutoModelForCausalLM

# Parse command-line arguments FIRST
parser = argparse.ArgumentParser(description='Screen abstracts for AMR using multi-GPU processing')
parser.add_argument('--passed_file', type=str, required=True, 
                    help='Path to the file containing PMIDs to test')
parser.add_argument('--output_csv', type=str, 
                    default='/work/11252/skulakis/projects/reslit/first_llms/llm_amr_gene_predictions.csv',
                    help='Path to save the output CSV file')
args = parser.parse_args()

passed_file = args.passed_file
output_csv = args.output_csv


def process_all_prompts_on_gpu(model, tokenizer, batch_prompts, batch_pmids, gpu_id):
    """Process all prompts on a single GPU with large batches"""
    
    print(f"GPU {gpu_id}: Model loaded! Processing {len(batch_prompts)} prompts")
    print(f"GPU {gpu_id}: VRAM used: {torch.cuda.memory_allocated(gpu_id) / 1e9:.1f} GB / 120 GB")
    
    batch_results = []
    
    # Process in large inference batches (120GB GPU can handle larger batches safely)
    inference_batch_size = 12  # Conservative batch size for long prompts with few-shot examples
    num_sub_batches = (len(batch_prompts) + inference_batch_size - 1) // inference_batch_size
    
    for batch_idx, i in enumerate(tqdm(range(0, len(batch_prompts), inference_batch_size), 
                                    total=num_sub_batches,
                                    desc=f"GPU {gpu_id} Progress")):
        sub_batch_prompts = batch_prompts[i:i+inference_batch_size]
        sub_batch_pmids = batch_pmids[i:i+inference_batch_size]
        
        print(f"GPU {gpu_id}: Processing sub-batch {batch_idx + 1}/{num_sub_batches} ({len(sub_batch_pmids)} items)")
        
        inputs = tokenizer(
            sub_batch_prompts, 
            return_tensors="pt", 
            padding=True, 
            truncation=True
        ).to(f"cuda:{gpu_id}")
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs, 
                max_new_tokens=10, 
                temperature=0.1, 
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id
            )
        
        # Decode only the newly generated tokens
        input_length = inputs.input_ids.shape[1]
        generated_tokens = outputs[:, input_length:]
        decoded_outputs = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)
        
        for pmid, prediction in zip(sub_batch_pmids, decoded_outputs):
            # Clean up the output to just the YES/NO part for clean printing
            clean_prediction = prediction.split('\n')[0].strip()
            if "Answer:" in clean_prediction:
                clean_prediction = clean_prediction.split("Answer:")[-1].strip()
            
            is_amr = "YES" in clean_prediction.upper()
            
            batch_results.append({
                'pmid': pmid,
                'prediction': clean_prediction,
                'is_amr': is_amr
            })
        
        print(f"GPU {gpu_id}: Completed sub-batch {batch_idx + 1}/{num_sub_batches}")
    
    print(f"GPU {gpu_id}: Finished processing all {len(batch_results)} abstracts")
    return batch_results


# Load model once to get tokenizer
model_name = "BioMistral/BioMistral-7B"
tokenizer = AutoTokenizer.from_pretrained(model_name)
print("Tokenizer loaded!")

# Load model on GPU 0
print("Loading model on GPU 0...")
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="cuda:0",
    use_safetensors=False
)

tokenizer.padding_side = "left"
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

print("Model loaded successfully!")


# Read PMIDs from the file
passed_file = passed_file
with open(passed_file, 'r') as f:
    pmids_to_test = [line.strip() for line in f if line.strip()]

print(f"Loaded {len(pmids_to_test)} PMIDs from {passed_file}")

# Keep the same examples for few-shot prompting
example_pmids = ["10027979", "10049269", "11557503", "1522070", "12726767"]

# Add example PMIDs to the list if they aren't already there to ensure they get fetched
query_pmids = list(set(pmids_to_test + example_pmids))

db_path = "/work/11252/skulakis/projects/reslit/papers.sqlite"
conn = sqlite3.connect(db_path)

# Fetch all relevant context available in the database in batches to avoid SQLite limits
df_list = []
batch_size = 900 # SQLite usually limits placeholders to 999
for i in range(0, len(query_pmids), batch_size):
    batch = query_pmids[i:i+batch_size]
    placeholders = ', '.join('?' for _ in batch)
    query = f"""
    SELECT pmid, article_title, journal, abstract, mesh_terms, substances, keywords, 
           has_gene, has_chemical, has_mutation, has_hv_relation
    FROM papers
    WHERE pmid IN ({placeholders}) AND abstract IS NOT NULL;
    """
    df_batch = pd.read_sql(query, conn, params=batch)
    df_list.append(df_batch)

df_test = pd.concat(df_list, ignore_index=True)
conn.close()

print(f"Found {len(df_test)} abstracts in the database.\n")

# After substances line, add a hint if AMR-related substances detected
amr_keywords = [
    # Mechanisms & Enzymes
    'resistance', 'resistant', 'susceptibility', 'susceptible', 'MIC', 
    'lactamase', 'carbapenemase', 'acetyltransferase', 'phosphotransferase',
    'nucleotidyltransferase', 'esterase', 'efflux', 'pump', 'transporter',
    'porin', 'permeability', 'methyltransferase', 'demethylase',
    
    # Genetic Elements & Context
    'integron', 'cassette', 'plasmid', 'transposon', 'mobilizable', 
    'conjugative', 'insertion sequence', 'operon', 'allele', 'variant', 
    'genotype', 'SNP', 'mutation', 'missense', 'point mutation',
    
    # Drug Classes (Substances)
    'aminoglycoside', 'tetracycline', 'methicillin', 'vancomycin', 'colistin',
    'polymyxin', 'carbapenem', 'cephalosporin', 'fluoroquinolone', 'macrolide',
    'sulfonamide', 'oxazolidinone', 'glycopeptide', 'penicillin', "fosfomycin", 
    "choramphenicol"
]

def format_paper_info(row):
    """Formats all the database columns into a clean text prompt"""
    info = f"Title: {row.get('article_title', '')}\n"
    info += f"Journal: {row.get('journal', '')}\n"
    info += f"Abstract: {row.get('abstract', '')}\n"
    if pd.notna(row.get('mesh_terms')):
        info += f"MeSH Terms: {row.get('mesh_terms', '')}\n"
    
    substances = str(row.get('substances', ''))
    if pd.notna(row.get('substances')):
        info += f"Substances: {substances}\n"
        
    if pd.notna(row.get('keywords')):
        info += f"Keywords: {row.get('keywords', '')}\n"
    info += f"Extracted Entities - Has Gene: {bool(row.get('has_gene'))}, "
    info += f"Has Chemical: {bool(row.get('has_chemical'))}, "
    info += f"Has Mutation: {bool(row.get('has_mutation'))}\n"
    
    if any(kw in substances.lower() for kw in amr_keywords):
        info += "Note: Substances suggest possible resistance mechanism.\n"
    return info

# Build the few-shot prompt prefix
df_examples = df_test[df_test['pmid'].isin(example_pmids)].copy()
df_eval = df_test[df_test['pmid'].isin(pmids_to_test) & ~df_test['pmid'].isin(example_pmids)].copy()

few_shot_prefix = (
            "You are an expert microbiologist reviewing papers for antimicrobial resistance (AMR). "
            "This includes: antibiotic resistance genes and mutations, drug target genes (DHPS, DHFR, GyrA, PBPs), "
            "gene cassettes, integrons, transposons, mobile genetic elements, efflux pumps, beta-lactamases, and susceptibility studies. "
            "A paper is relevant even if it does not use the word 'resistance' — "
            "cloning or characterizing an AMR-related gene, transposon, or its mutations counts as YES. "
            "Papers about resistance-gene-carrying transposons are YES, even if written in highly technical molecular biology language (e.g., cointegrate formation, IS elements). "
            "Answer strictly YES or NO.\n\n"
        )
# Append the positive examples
for _, row in df_examples.iterrows():
    if row['pmid'] in example_pmids:
        few_shot_prefix += "--- Paper ---\n"
        few_shot_prefix += format_paper_info(row)
        if str(row['pmid']) == "11557503":
            few_shot_prefix += "\nNote: Even without extracted entities, gene cassettes and integrons indicate AMR.\n"
        few_shot_prefix += "\nIs this paper about antimicrobial resistance? Answer: YES\n\n"

print(f"Using {len(df_examples)} examples for the few-shot prompt.")
print(f"Testing on the remaining {len(df_eval)} PMIDs...\n")

# Update tokenizer for batching
tokenizer.padding_side = "left"
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# Collect all prompts and PMIDs
prompts = []
pmids_batch = []

for index, row in df_eval.iterrows():
    pmid = row['pmid']
    prompt = few_shot_prefix + "--- Paper ---\n" + format_paper_info(row) + "\nIs this paper about antimicrobial resistance? Answer:"
    prompts.append(prompt)
    pmids_batch.append(pmid)

print(f"Total abstracts to process: {len(prompts)}")
print(f"Processing on single GPU (GPU 0)...\n")

# Process all prompts on GPU 0
results = process_all_prompts_on_gpu(model, tokenizer, prompts, pmids_batch, gpu_id=0)

print("\nProcessing completed!")

# Count resistance results
resistance_count = sum(1 for r in results if r['is_amr'])
print(f"\nTotal tested PMIDs characterized as resistance (YES): {resistance_count} out of {len(results)}")

# Save the predictions to a CSV file for later review
results_df = pd.DataFrame(results)
results_df.to_csv(output_csv, index=False)
print(f"Results saved to {output_csv}")
