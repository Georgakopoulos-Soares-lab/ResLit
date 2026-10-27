'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { MultiSelectFilter } from './multi-select-filter'
import { DatabaseFilter } from './database-filter'
import type { FilterOptions } from '@/lib/types'

interface PaperFilterSidebarProps {
  filterOptions: FilterOptions
}

export function PaperFilterSidebar({ filterOptions }: PaperFilterSidebarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([name, value]) => {
        if (value === null || value === '' || value === 'all') {
          params.delete(name)
        } else {
          params.set(name, value)
        }
      })
      params.delete('page')
      return params.toString()
    },
    [searchParams]
  )

  const updateFilter = (name: string, value: string | null) => {
    const queryString = createQueryString({ [name]: value })
    router.push(`/browse/papers${queryString ? `?${queryString}` : ''}`)
  }

  const clearFilters = () => {
    router.push('/browse/papers')
  }

  const currentLocation = searchParams.get('country') || ''
  const currentAntibiotic = searchParams.get('antibiotic') || ''
  const currentOrganism = searchParams.get('organism') || ''
  const currentYearFrom = searchParams.get('yearFrom') || ''
  const currentYearTo = searchParams.get('yearTo') || ''
  const currentSourceDatabases = searchParams.get('sourceDatabases') || ''

  const hasActiveFilters =
    currentLocation || currentAntibiotic || currentOrganism || currentYearFrom || currentYearTo || currentSourceDatabases

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Filters</h3>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Select
          value={currentLocation || 'all'}
          onValueChange={(value) => updateFilter('country', value)}
        >
          <SelectTrigger id="location">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            <SelectItem value="__missing__">Missing</SelectItem>
            {filterOptions.countries.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Antibiotic */}
      <div className="space-y-2">
        <Label htmlFor="antibiotic">Antibiotic</Label>
        <Select
          value={currentAntibiotic || 'all'}
          onValueChange={(value) => updateFilter('antibiotic', value)}
        >
          <SelectTrigger id="antibiotic">
            <SelectValue placeholder="All antibiotics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All antibiotics</SelectItem>
            {filterOptions.antibiotics.map((ab) => (
              <SelectItem key={ab} value={ab}>
                {ab}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Organism */}
      <div className="space-y-2">
        <Label htmlFor="organism">Organism</Label>
        <Select
          value={currentOrganism || 'all'}
          onValueChange={(value) => updateFilter('organism', value)}
        >
          <SelectTrigger id="organism">
            <SelectValue placeholder="All organisms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organisms</SelectItem>
            {filterOptions.organisms.map((org) => (
              <SelectItem key={org} value={org}>
                {org}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Year range */}
      <div className="space-y-3">
        <Label>Publication Year</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="From"
            value={currentYearFrom}
            onChange={(e) => updateFilter('yearFrom', e.target.value)}
            className="w-full"
            min={1990}
            max={new Date().getFullYear()}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="To"
            value={currentYearTo}
            onChange={(e) => updateFilter('yearTo', e.target.value)}
            className="w-full"
            min={1990}
            max={new Date().getFullYear()}
          />
        </div>
      </div>

      {/* Source Database - Clickable Chips */}
      {filterOptions.sourceDatabases.length > 0 && (
        <div className="space-y-2">
          <Label>Source Database</Label>
          <DatabaseFilter
            available={filterOptions.sourceDatabases}
            selected={currentSourceDatabases ? currentSourceDatabases.split(',').filter(Boolean) : []}
            onChange={(selected) => {
              if (selected.length === 0 || selected.length === filterOptions.sourceDatabases.length) {
                updateFilter('sourceDatabases', null)
              } else {
                updateFilter('sourceDatabases', selected.join(','))
              }
            }}
          />
        </div>
      )}

      {hasActiveFilters && (
        <>
          <Separator />
          <Button variant="outline" className="w-full" onClick={clearFilters}>
            Clear All Filters
          </Button>
        </>
      )}
    </div>
  )
}
