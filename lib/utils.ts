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
