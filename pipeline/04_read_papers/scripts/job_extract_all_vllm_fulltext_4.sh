#!/bin/bash
#SBATCH -J amr_batch_4
#SBATCH -p gh
#SBATCH -N 1
#SBATCH -n 1
#SBATCH -t 48:00:00
#SBATCH -o /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_4/logs/amr_%j.log
#SBATCH -e /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_4/logs/amr_%j.err
#SBATCH -A MCB26038

set -e

echo "Starting AMR Gene Extraction - Batch 4"
echo "SLURM Job ID: $SLURM_JOB_ID"
echo "=================================================="

source /work/11252/skulakis/projects/reslit/venv_311/bin/activate

# Set paths specifically for Batch 4
export PAPERS_FOLDER="/work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/fulltext_4"
export OUTPUT_DIR="/work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_4/results"

# Go to where your Python script lives and run it
cd /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000
python process_all_papers_vllm_final_gemini.py

if [ $? -eq 0 ]; then
    echo "=================================================="
    echo "✅ Batch 4 completed successfully"
else
    echo "=================================================="
    echo "❌ Batch 4 failed with exit code $?"
fi
