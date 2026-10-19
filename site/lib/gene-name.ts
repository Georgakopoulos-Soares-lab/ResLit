const DOUBLE_PRIMES = ["''", '″', '′′', '’’']
const DOUBLE_PRIME_PLACEHOLDER = '\u0000'
const PRIME_CHARS = /[′ʹ‘’`´'"]/g

/** The one gene identity used for matching, everywhere: trim, lowercase,
 * drop prime/quote marks. So "OmpA" and "ompA" are one gene, as are
 * "aac(6)-Ib" and "aac(6')-Ib". Double primes are kept (as '') because
 * aph(3')-Ia and aph(3'')-Ia are different enzymes. Python twin:
 * normalize_gene_name() in
 * comparison_with_other_databases/genes/comparison_full_lists.ipynb —
 * keep the two identical. */
export function normalizeGeneName(name: string): string {
  let s = name.trim().toLowerCase()
  for (const dp of DOUBLE_PRIMES) s = s.split(dp).join(DOUBLE_PRIME_PLACEHOLDER)
  return s.replace(PRIME_CHARS, '').split(DOUBLE_PRIME_PLACEHOLDER).join("''")
}

/** Display name for each gene identity: its most frequent original
 * spelling, counted over `primary` (amr_genes rows), falling back to
 * `fallback` (amr_mutations rows) for genes that only have mutations. Ties
 * go to the code-point-smallest spelling, so the result is deterministic. */
export function pickGeneDisplayNames(
  primary: (string | null | undefined)[],
  fallback: (string | null | undefined)[] = []
): Map<string, string> {
  const display = new Map<string, string>()
  for (const names of [primary, fallback]) {
    const counts = new Map<string, Map<string, number>>()
    for (const name of names) {
      if (!name) continue
      const key = normalizeGeneName(name)
      if (display.has(key)) continue
      let spellings = counts.get(key)
      if (!spellings) counts.set(key, (spellings = new Map()))
      spellings.set(name, (spellings.get(name) ?? 0) + 1)
    }
    for (const [key, spellings] of counts) {
      let best = ''
      let bestCount = 0
      for (const [spelling, n] of spellings) {
        if (n > bestCount || (n === bestCount && spelling < best)) {
          best = spelling
          bestCount = n
        }
      }
      display.set(key, best)
    }
  }
  return display
}
