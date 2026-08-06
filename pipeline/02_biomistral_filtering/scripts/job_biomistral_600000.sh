#!/bin/bash
#SBATCH -J reslit_biomistral_abstract_filtering
#SBATCH -o /work/11252/skulakis/projects/reslit/biomistral_filtering/logs/reslit_biomistral_abstract_filtering_%j.out
#SBATCH -e /work/11252/skulakis/projects/reslit/biomistral_filtering/logs/reslit_biomistral_abstract_filtering_%j.err
#SBATCH -p gpu-h100
#SBATCH -N 1
#SBATCH -n 1
#SBATCH -t 47:00:00
#SBATCH -A BCS25073

source /work/11252/skulakis/projects/reslit/venv_a100/bin/activate

cd /work/11252/skulakis/projects/reslit

bash /work/11252/skulakis/projects/reslit/screen_abstract.sh /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/300_600K_passed_cleaned_remaining_900K.txt /work/11252/skulakis/projects/reslit/biomistral_filtering_300_600 passed_cleaned_600000.csv
