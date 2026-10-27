# Raw LLM extraction output

`extraction_summary_batch1.json` … `extraction_summary_batch6.json`: the output of Qwen3-30B-A3B (via vLLM) on the retrieved full texts, as written by `../pipeline/04_read_papers/scripts/process_all_papers_vllm_final_gemini.py` (two-pass extraction with the field-by-field audit). The files are unchanged.

## Structure

```
{
  "model": "Qwen/Qwen3-30B-A3B", "total_papers": ..., "success": ..., "irrelevant": ..., ...
  "results": {
    "<PMID>": {
      "pmid": "<PMID>",
      "status": "success" | "irrelevant",
      "extracted_genes": [...],
      "full_output": {
        "relevant": true/false, "paper_title": ..., "publication_year": ..., "paper_type": ...,
        "genes":     { "<gene>": { "allele", "encodes", "mechanism", "confers_resistance_to", "organisms_tested_in",
                                   "role_in_paper", "validation_method", "evidence_level", ... } },
        "mutations": { "<gene>": { "encodes", "mutations_found": [ { "protein_change", "amino_acid_position",
                                   "nucleotide_change", "nucleotide_position", "confers_resistance_to",
                                   "organisms_observed_in", "validated_by", ... } ] } },
        "key_findings": ..., "methodology": ..., "geographic_location": [...], "sample_size": ...
      }
    }
  }
}
```

## Counts

| | Records |
|---|---|
| Total | 117,112 |
| `success` (relevant) | 64,276 |
| `irrelevant` | 52,836 |

Two records are not papers: `10103189 copy` (a duplicate of 10103189, `success`) and `papers_downloaded` (`irrelevant`). So 117,110 papers were processed: 64,275 relevant and 52,835 irrelevant (`../pmid_lists/`).

The converters from this output to the released tables are `../pipeline/05_harmonised_pipeline/reslit/genes/qwen3_to_csv.py` and `../pipeline/05_harmonised_pipeline/reslit/mutations/qwen3_mutations_to_csv.py`; the cleaning steps are listed in `bash_commands_for_genes.sh` / `bash_commands_for_mutations.sh` in the same folders. Note that the gene step keeps only rows whose `role_in_paper` is `experimentally_characterized`.
