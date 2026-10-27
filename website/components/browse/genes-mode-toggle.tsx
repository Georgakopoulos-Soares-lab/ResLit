'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface GenesModeToggleProps {
  currentMode: string
}

export function GenesModeToggle({ currentMode }: GenesModeToggleProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const switchMode = (mode: string) => {
    const params = new URLSearchParams()
    if (mode !== 'genes') params.set('mode', mode)
    router.push(`/browse/genes${params.toString() ? `?${params.toString()}` : ''}`)
  }

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 gap-1">
      <button
        onClick={() => switchMode('genes')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
          currentMode === 'genes'
            ? 'bg-white shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        By Gene
      </button>
      <button
        onClick={() => switchMode('alleles')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
          currentMode === 'alleles'
            ? 'bg-white shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        By Allele
      </button>
    </div>
  )
}
