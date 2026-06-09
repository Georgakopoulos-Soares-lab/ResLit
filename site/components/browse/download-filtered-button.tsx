"use client"

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, ChevronDown } from 'lucide-react'
import { downloadFilteredGenes, downloadFilteredMutations } from '@/lib/actions/download'
import type { BrowseFilters } from '@/lib/types'

interface DownloadFilteredButtonProps {
  type: 'genes' | 'mutations'
  totalItems: number
}

export function DownloadFilteredButton({ type, totalItems }: DownloadFilteredButtonProps) {
  const searchParams = useSearchParams()
  const [isDownloading, setIsDownloading] = useState(false)

  const getFiltersFromParams = (): BrowseFilters => {
    return {
      search: searchParams.get('search') || undefined,
      mechanismClass: searchParams.get('mechanismClass') || undefined,
      antibiotic: searchParams.get('antibiotic') || undefined,
      organism: searchParams.get('organism') || undefined,
      country: searchParams.get('country') || undefined,
      geneName: searchParams.get('geneName') || undefined,
      yearFrom: searchParams.get('yearFrom') ? parseInt(searchParams.get('yearFrom')!) : undefined,
      yearTo: searchParams.get('yearTo') ? parseInt(searchParams.get('yearTo')!) : undefined,
      curatedOnly: searchParams.get('curatedOnly') === 'true',
    }
  }

  const hasActiveFilters = (): boolean => {
    const filters = getFiltersFromParams()
    return !!(
      filters.search ||
      filters.mechanismClass ||
      filters.antibiotic ||
      filters.organism ||
      filters.country ||
      filters.geneName ||
      filters.yearFrom ||
      filters.yearTo
    )
  }

  const handleDownload = async (downloadType: 'filtered' | 'all' | 'curated') => {
    setIsDownloading(true)
    try {
      let filters: BrowseFilters = {}
      
      if (downloadType === 'filtered') {
        filters = getFiltersFromParams()
      } else if (downloadType === 'curated') {
        filters = { curatedOnly: true }
      } else {
        filters = { curatedOnly: false }
      }

      const result = type === 'genes'
        ? await downloadFilteredGenes(filters)
        : await downloadFilteredMutations(filters)

      if (result.csv) {
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        
        let filename = `reslit_${type}`
        if (downloadType === 'filtered') {
          filename += '_filtered'
        } else if (downloadType === 'curated') {
          filename += '_curated'
        } else {
          filename += '_all'
        }
        filename += `_${new Date().toISOString().split('T')[0]}.csv`
        
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Download failed:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isDownloading}>
          {isDownloading ? (
            <>
              <Spinner className="h-4 w-4 mr-2" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Download
              <ChevronDown className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {hasActiveFilters() && (
          <DropdownMenuItem onClick={() => handleDownload('filtered')}>
            <Download className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>Download Filtered Results</span>
              <span className="text-xs text-muted-foreground">
                {totalItems.toLocaleString()} {type}
              </span>
            </div>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => handleDownload('curated')}>
          <Download className="h-4 w-4 mr-2 text-green-600" />
          <div className="flex flex-col">
            <span>Download Curated Only</span>
            <span className="text-xs text-muted-foreground">
              Verified entries only
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload('all')}>
          <Download className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Download All {type === 'genes' ? 'Genes' : 'Mutations'}</span>
            <span className="text-xs text-muted-foreground">
              Including pending entries
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
