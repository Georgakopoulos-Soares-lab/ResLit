#!/bin/bash
#SBATCH -J reslit_biomistral_abstract_filtering_vista
#SBATCH -o /work/11252/skulakis/projects/reslit/vista/logs/reslit_biomistral_abstract_filtering_%j.out
#SBATCH -e /work/11252/skulakis/projects/reslit/vista/logs/reslit_biomistral_abstract_filtering_%j.err
#SBATCH -p gh
#SBATCH -N 1
#SBATCH -n 1
#SBATCH -t 48:00:00
#SBATCH -A MCB25091

source /work/11252/skulakis/projects/reslit/venv_311/bin/activate

cd /work/11252/skulakis/projects/reslit/vista
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

bash /work/11252/skulakis/projects/reslit/vista/screen_abstract_vista.sh /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/0_300K_passed_cleaned_remaining_900K.txt /work/11252/skulakis/projects/reslit/vista/results_300000 passed_cleaned_300000.csv


