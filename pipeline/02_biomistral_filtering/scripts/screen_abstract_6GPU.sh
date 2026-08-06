#!/bin/bash
#source /work/11252/skulakis/projects/reslit/venv_a100/bin/activate
# Script to process PMIDs in batches of 1000 and run the screening analysis

set -e  # Exit on error

# Record start time
START_TIME=$(date '+%Y-%m-%d %H:%M:%S')
START_TIMESTAMP=$(date +%s)

# Parse command-line arguments
if [ $# -lt 3 ]; then
    echo "Usage: $0 <pmid_file> <output_folder> <final_csv_name>"
    echo "  pmid_file: Path to file containing PMIDs (one per line)"
    echo "  output_folder: Folder to save results"
    echo "  final_csv_name: Name of the final merged CSV file (e.g., final_results.csv)"
    exit 1
fi

PMID_FILE="$1"
OUTPUT_FOLDER="$2"
FINAL_CSV_NAME="$3"

# Validate input file exists
if [ ! -f "$PMID_FILE" ]; then
    echo "Error: PMID file not found: $PMID_FILE"
    exit 1
fi

# Create output folder if it doesn't exist
mkdir -p "$OUTPUT_FOLDER"

echo "=========================================="
echo "Starting PMIDanalysis..."
echo "Start time: $START_TIME"
echo "=========================================="
echo "Input file: $PMID_FILE"
echo "Output folder: $OUTPUT_FOLDER"
echo "Final CSV name: $FINAL_CSV_NAME"

# Count total PMIDs
TOTAL_PMIDS=$(wc -l < "$PMID_FILE")
echo "Total PMIDs to process: $TOTAL_PMIDS"

# Split the file into batches of 5000
BATCH_SIZE=5000
BATCH_NUM=0
BATCH_FILES=()
TEMP_DIR="$OUTPUT_FOLDER/.temp_batches"

mkdir -p "$TEMP_DIR"

echo "Splitting PMIDs into batches of $BATCH_SIZE..."
split -l $BATCH_SIZE "$PMID_FILE" "$TEMP_DIR/batch_"

# Process each batch
for BATCH_FILE in $(ls -v "$TEMP_DIR"/batch_*); do
    BATCH_NUM=$((BATCH_NUM + 1))
    BATCH_PMID_COUNT=$(wc -l < "$BATCH_FILE")
    
    # Create output CSV path for this batch
    OUTPUT_CSV="$OUTPUT_FOLDER/results_batch_${BATCH_NUM}.csv"
    
    echo ""
    echo "=========================================="
    echo "Processing Batch $BATCH_NUM ($BATCH_PMID_COUNT PMIDs)"
    echo "Output: $OUTPUT_CSV"
    echo "=========================================="
    
    # Run the Python script with this batch
    python /work/11252/skulakis/projects/reslit/screen_abstract_9GPU.py \
        --passed_file "$BATCH_FILE" \
        --output_csv "$OUTPUT_CSV"
    
    if [ $? -eq 0 ]; then
        echo "Batch $BATCH_NUM completed successfully"
        BATCH_FILES+=("$OUTPUT_CSV")
    else
        echo "Error processing batch $BATCH_NUM"
        exit 1
    fi
done

# Merge all results into a final CSV
FINAL_OUTPUT="$OUTPUT_FOLDER/$FINAL_CSV_NAME"

echo ""
echo "=========================================="
echo "Merging all batch results..."
echo "=========================================="

# Create the final output with headers from the first batch
if [ ${#BATCH_FILES[@]} -gt 0 ]; then
    # Get headers from the first file
    head -1 "${BATCH_FILES[0]}" > "$FINAL_OUTPUT"
    
    # Append all data rows from all batch files
    for BATCH_CSV in "${BATCH_FILES[@]}"; do
        tail -n +2 "$BATCH_CSV" >> "$FINAL_OUTPUT"
    done
    
    FINAL_COUNT=$(tail -n +2 "$FINAL_OUTPUT" | wc -l)
    echo "Successfully merged results!"
    echo "Final output: $FINAL_OUTPUT"
    echo "Total records in final output: $FINAL_COUNT"
else
    echo "No batch results to merge"
    exit 1
fi

# Cleanup temporary files
rm -rf "$TEMP_DIR"

# Record end time
END_TIME=$(date '+%Y-%m-%d %H:%M:%S')
END_TIMESTAMP=$(date +%s)
ELAPSED_SECONDS=$((END_TIMESTAMP - START_TIMESTAMP))
ELAPSED_MINUTES=$((ELAPSED_SECONDS / 60))
ELAPSED_HOURS=$((ELAPSED_MINUTES / 60))
REMAINING_MINUTES=$((ELAPSED_MINUTES % 60))

echo ""
echo "=========================================="
echo "Analysis complete!"
echo "=========================================="
echo "Start time: $START_TIME"
echo "End time: $END_TIME"
echo "Elapsed time: ${ELAPSED_HOURS}h ${REMAINING_MINUTES}m ${ELAPSED_SECONDS}s"
echo "=========================================="
echo "Results saved to: $OUTPUT_FOLDER"
echo "Final merged file: $FINAL_OUTPUT"