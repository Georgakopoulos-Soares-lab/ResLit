'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

interface BrowsePaginationProps {
  type: 'genes' | 'mutations' | 'papers'
  currentPage: number
  totalPages: number
  totalItems: number
}

export function BrowsePagination({ 
  type, 
  currentPage, 
  totalPages,
  totalItems 
}: BrowsePaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [goToValue, setGoToValue] = useState('')

  const createPageUrl = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page === 1) {
      params.delete('page')
    } else {
      params.set('page', String(page))
    }
    return `/browse/${type}${params.toString() ? `?${params.toString()}` : ''}`
  }

  const getVisiblePages = () => {
    const pages: (number | 'ellipsis')[] = []
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)
      
      if (currentPage > 3) {
        pages.push('ellipsis')
      }
      
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('ellipsis')
      }
      
      pages.push(totalPages)
    }
    
    return pages
  }

  if (totalPages <= 1) {
    return (
      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
        Showing {totalItems} {totalItems === 1 ? 'result' : 'results'}
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
      <p className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages} ({totalItems.toLocaleString()} results)
      </p>

      <div className="flex items-center gap-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={createPageUrl(Math.max(1, currentPage - 1))}
                aria-disabled={currentPage === 1}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>

            {getVisiblePages().map((page, index) => (
              <PaginationItem key={index}>
                {page === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href={createPageUrl(page)}
                    isActive={page === currentPage}
                  >
                    {page}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                href={createPageUrl(Math.min(totalPages, currentPage + 1))}
                aria-disabled={currentPage === totalPages}
                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            const page = parseInt(goToValue)
            if (page >= 1 && page <= totalPages) {
              router.push(createPageUrl(page))
              setGoToValue('')
            }
          }}
        >
          <label htmlFor="go-to-page" className="text-xs text-muted-foreground whitespace-nowrap">Go to</label>
          <input
            id="go-to-page"
            type="text"
            inputMode="numeric"
            value={goToValue}
            onChange={(e) => setGoToValue(e.target.value.replace(/\D/g, ''))}
            placeholder="#"
            className="w-12 h-8 rounded-md border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </form>
      </div>
    </div>
  )
}
