#!/bin/bash
#SBATCH -J amr_extraction_all
#SBATCH -p gh
#SBATCH -N 1
#SBATCH -n 1
#SBATCH -t 24:00:00
#SBATCH -o /work/11252/skulakis/projects/reslit/read_papers/analyse_papers/logs/amr_extraction_%j.log
#SBATCH -e /work/11252/skulakis/projects/reslit/read_papers/analyse_papers/logs/amr_extraction_%j.err
#SBATCH -A MCB26038

# AMR Gene Extraction - Process All Papers with vLLM
# Extracts resistance genes from all papers in fulltext_txt directory

set -e  # Exit on error

# Setup
echo "Starting AMR Gene Extraction Job"
echo "SLURM Job ID: $SLURM_JOB_ID"
echo "Start Time: $(date)"
echo "=================================================="

# Activate Python environment (adjust path as needed)
source /work/11252/skulakis/projects/reslit/venv_311/bin/activate

# Create logs directory if it doesn't exist
mkdir -p /work/11252/skulakis/projects/reslit/read_papers/analyse_papers/logs

# Run the extraction script
cd /work/11252/skulakis/projects/reslit/read_papers/analyse_papers

python process_all_papers_vllm_final_gemini.py

# Check exit code
if [ $? -eq 0 ]; then
    echo "=================================================="
    echo "✅ Job completed successfully"
else
    echo "=================================================="
    echo "❌ Job failed with exit code $?"
fi

echo "End Time: $(date)"
