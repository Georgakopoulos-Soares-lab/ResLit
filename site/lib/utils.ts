import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Returns the gene family prefix if the name ends in -NUMBER (e.g. blaADC-30 → blaADC)
// Returns null for standalone genes (e.g. aac(2')-IIa)
export function extractGeneFamily(geneName: string): string | null {
  const match = /^(.+)-(\d+)$/.exec(geneName)
  return match ? match[1] : null
}

// Flattens drug/antibiotic lists whose entries may pack several values
// ("ciprofloxacin|ofloxacin, nalidixic acid") into unique single drugs.
// Dedupes case-insensitively, keeping the first spelling seen.
export function uniqueDrugs(values: Iterable<string | null | undefined>): string[] {
  const seen = new Map<string, string>()
  for (const value of values) {
    if (!value) continue
    for (const part of value.split(/[,|]/)) {
      const drug = part.trim()
      const key = drug.toLowerCase()
      if (drug && !seen.has(key)) seen.set(key, drug)
    }
  }
  return [...seen.values()]
}
