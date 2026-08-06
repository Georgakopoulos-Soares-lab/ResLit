from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent

INPUT = HERE / "resfinder_pointMutations.xlsx"
OUTPUT = HERE / "resfinder_pointMutations_expanded.xlsx"

df = pd.read_excel(INPUT)

rows = []
for _, row in df.iterrows():
    res_codon = row["Res_codon"]
    if pd.isna(res_codon):
        rows.append(row)
        continue
    values = [v.strip() for v in str(res_codon).split(",")]
    for value in values:
        new_row = row.copy()
        new_row["Res_codon"] = value
        rows.append(new_row)

expanded = pd.DataFrame(rows).reset_index(drop=True)
expanded.to_excel(OUTPUT, index=False)

print(f"Original rows: {len(df)}")
print(f"Expanded rows: {len(expanded)}")
print(f"Saved to {OUTPUT}")
