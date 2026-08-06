#!/bin/bash
#SBATCH -J amr_batch_6
#SBATCH -p gh
#SBATCH -N 1
#SBATCH -n 1
#SBATCH -t 48:00:00
#SBATCH -o /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_6/logs/amr_%j.log
#SBATCH -e /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_6/logs/amr_%j.err
#SBATCH -A MCB26038

set -e

echo "Starting AMR Gene Extraction - Batch 6"
echo "SLURM Job ID: $SLURM_JOB_ID"
echo "=================================================="

source /work/11252/skulakis/projects/reslit/venv_311/bin/activate

# Set paths specifically for Batch 6
export PAPERS_FOLDER="/work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/fulltext_6"
export OUTPUT_DIR="/work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_6/results"

# Go to where your Python script lives and run it
cd /work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000
python process_all_papers_vllm_final_gemini.py

if [ $? -eq 0 ]; then
    echo "=================================================="
    echo "✅ Batch 6 completed successfully"
else
    echo "=================================================="
    echo "❌ Batch 6 failed with exit code $?"
fi
