#!/usr/bin/env python
"""
Regenerate extraction_summary.json from individual result files in results_vllm/
"""
import os
import json
from pathlib import Path
from typing import Dict, Any

RESULTS_DIR = "/work/11252/skulakis/projects/reslit/read_papers/fulltext_txt_50000/analyse_papers/batch_1/results"

def regenerate_summary():
    """Scan all .json files in results_vllm and build extraction_summary.json"""
    
    results: Dict[str, Any] = {}
    success = 0
    irrelevant = 0
    errors = 0
    reviews = 0
    total_genes = 0
    
    # Find all result JSON files (excluding summary files themselves)
    result_files = sorted([
        f for f in Path(RESULTS_DIR).glob("*.json")
        if f.name not in [
            "extraction_summary.json",
            "reviews_summary.json", 
            "irrelevant_summary.json",
            "errors_summary.json"
        ]
    ])
    
    print(f"Found {len(result_files)} result files in {RESULTS_DIR}")
    
    for result_file in result_files:
        try:
            with open(result_file, "r", encoding="utf-8") as f:
                result = json.load(f)
            
            # Each file contains one result object directly
            if isinstance(result, dict) and "pmid" in result:
                pmid = result["pmid"]
                results[pmid] = result
                
                # Count statistics
                status = result.get("status", "")
                if status == "success":
                    success += 1
                    total_genes += result.get("total_genes", 0)
                    paper_type = result.get("full_output", {}).get("paper_type")
                    if paper_type == "review":
                        reviews += 1
                elif status == "irrelevant":
                    irrelevant += 1
                elif status == "error":
                    errors += 1
                    
        except Exception as e:
            print(f"  ⚠️  Error reading {result_file.name}: {e}")
    
    print(f"\nAggregated statistics:")
    print(f"  Total entries: {len(results)}")
    print(f"  Success: {success}")
    print(f"  Reviews: {reviews}")
    print(f"  Irrelevant: {irrelevant}")
    print(f"  Errors: {errors}")
    print(f"  Total genes: {total_genes}")
    
    # Create summary
    summary = {
        "model": "Qwen/Qwen3-30B-A3B",
        "audit_enabled": True,
        "total_papers": len(results),
        "success": success,
        "reviews": reviews,
        "irrelevant": irrelevant,
        "errors": errors,
        "total_genes": total_genes,
        "elapsed_seconds": None,  # Can't reconstruct this
        "results": results,
    }
    
    # Write summary
    summary_path = os.path.join(RESULTS_DIR, "extraction_summary.json")
    with open(summary_path, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Regenerated: {summary_path}")
    
    # Also regenerate auxiliary summaries
    reviews_only = {p: r for p, r in results.items()
                    if r.get("full_output", {}).get("paper_type") == "review"}
    irrelevant_only = {p: r for p, r in results.items()
                       if r.get("status") == "irrelevant"}
    errors_only = {p: r for p, r in results.items()
                   if r.get("status") == "error"}
    
    with open(os.path.join(RESULTS_DIR, "reviews_summary.json"), "w") as fh:
        json.dump(reviews_only, fh, indent=2, ensure_ascii=False)
    print(f"✅ Regenerated: {os.path.join(RESULTS_DIR, 'reviews_summary.json')}")
    
    with open(os.path.join(RESULTS_DIR, "irrelevant_summary.json"), "w") as fh:
        json.dump(irrelevant_only, fh, indent=2, ensure_ascii=False)
    print(f"✅ Regenerated: {os.path.join(RESULTS_DIR, 'irrelevant_summary.json')}")
    
    with open(os.path.join(RESULTS_DIR, "errors_summary.json"), "w") as fh:
        json.dump(errors_only, fh, indent=2, ensure_ascii=False)
    print(f"✅ Regenerated: {os.path.join(RESULTS_DIR, 'errors_summary.json')}")

if __name__ == "__main__":
    regenerate_summary()
