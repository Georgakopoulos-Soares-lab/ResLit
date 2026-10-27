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

// Same as uniqueDrugs, but for organism lists, whose entries may pack several
// comma-separated names ("Escherichia coli, Klebsiella pneumoniae").
export function uniqueOrganisms(values: Iterable<string | null | undefined>): string[] {
  const seen = new Map<string, string>()
  for (const value of values) {
    if (!value) continue
    for (const part of value.split(',')) {
      const organism = part.trim().replace(/\s+/g, ' ')
      const key = organism.toLowerCase()
      if (organism && !seen.has(key)) seen.set(key, organism)
    }
  }
  return [...seen.values()]
}

// "AMINOGLYCOSIDE ANTIBIOTIC" / "tobramycin" → "Aminoglycoside antibiotic" / "Tobramycin"
export function sentenceCase(value: string): string {
  const lower = value.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
