'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface MutationsModeToggleProps {
  currentMode: string
}

export function MutationsModeToggle({ currentMode }: MutationsModeToggleProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const switchMode = (mode: string) => {
    const params = new URLSearchParams()
    params.set('mode', mode)
    router.push(`/browse/mutations?${params.toString()}`)
  }

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 gap-1">
      <button
        onClick={() => switchMode('mutations')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
          currentMode === 'mutations'
            ? 'bg-white shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        All Mutations
      </button>
      <button
        onClick={() => switchMode('genes')}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
          currentMode === 'genes'
            ? 'bg-white shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Browse by Gene
      </button>
    </div>
  )
}
