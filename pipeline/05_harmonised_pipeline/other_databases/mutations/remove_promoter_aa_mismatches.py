"""
Removes rows from full_list_mutations_enriched.csv where TypeGene is 'AA'
but the Gene column mentions a promoter (e.g. 'embA-promoter-size-115bp').
Removed rows are kept in removed_mutations.csv for inspection.
"""

from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
INPUT_FILE = HERE / "full_list_mutations_enriched.csv"
REMOVED_FILE = HERE / "removed_mutations.csv"


def main():
    df = pd.read_csv(INPUT_FILE)

    mask = (df["TypeGene"] == "AA") & (
        df["Gene"].astype(str).str.contains("promoter", case=False, na=False)
    )
    removed = df[mask]
    kept = df[~mask]

    removed.to_csv(REMOVED_FILE, index=False)
    kept.to_csv(INPUT_FILE, index=False)

    print(f"Removed: {len(removed)} rows -> {REMOVED_FILE.name}")
    print(f"Kept:    {len(kept)} rows -> {INPUT_FILE.name} (overwritten)")
    print()
    print("Removed rows by Database:")
    print(removed["Database"].value_counts())
    print()
    print("Removed rows by Gene (top 15):")
    print(removed["Gene"].value_counts().head(15))


if __name__ == "__main__":
    main()
