'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface ViewToggleProps {
  type: 'genes' | 'mutations'
}

export function ViewToggle({ type }: ViewToggleProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentView = searchParams.get('view') || 'table'

  const handleViewChange = (view: string) => {
    if (!view) return
    
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'table') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    
    router.push(`/browse/${type}${params.toString() ? `?${params.toString()}` : ''}`)
  }

  return (
    <ToggleGroup 
      type="single" 
      value={currentView} 
      onValueChange={handleViewChange}
      className="border rounded-lg p-1"
    >
      <ToggleGroupItem value="table" aria-label="Table view" className="px-3">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <span className="ml-2 hidden sm:inline">Table</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="cards" aria-label="Card view" className="px-3">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
        <span className="ml-2 hidden sm:inline">Cards</span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
