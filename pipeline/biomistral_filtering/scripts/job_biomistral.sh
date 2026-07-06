#!/bin/bash
#SBATCH -J reslit_biomistral_abstract_filtering
#SBATCH -o /work/11252/skulakis/projects/reslit/biomistral_filtering/logs/reslit_biomistral_abstract_filtering_%j.out
#SBATCH -e /work/11252/skulakis/projects/reslit/biomistral_filtering/logs/reslit_biomistral_abstract_filtering_%j.err
#SBATCH -p gpu-a100
#SBATCH -N 1
#SBATCH -n 1
#SBATCH -t 12:00:00
#SBATCH -A BCS25073

source /work/11252/skulakis/projects/reslit/venv_a100/bin/activate

cd /work/11252/skulakis/projects/reslit

bash /work/11252/skulakis/projects/reslit/screen_abstract.sh /work/11252/skulakis/projects/reslit/results_amr_pmids_genetics/passed_cleaned_test.txt /work/11252/skulakis/projects/reslit/biomistral_filtering genetics_test_50000.csv
