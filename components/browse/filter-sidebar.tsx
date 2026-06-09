'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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

interface FilterSidebarProps {
  filterOptions: FilterOptions
  type: 'genes' | 'mutations'
  basePath?: string
  keepParams?: string[]
  hideGeneName?: boolean
}

export function FilterSidebar({ filterOptions, type, basePath, keepParams, hideGeneName }: FilterSidebarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const resolvedBasePath = basePath ?? `/browse/${type}`

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

      // Reset to page 1 when filters change
      params.delete('page')

      return params.toString()
    },
    [searchParams]
  )

  const updateFilter = (name: string, value: string | null) => {
    const queryString = createQueryString({ [name]: value })
    router.push(`${resolvedBasePath}${queryString ? `?${queryString}` : ''}`)
  }

  const clearFilters = () => {
    const params = new URLSearchParams()
    if (keepParams) {
      keepParams.forEach((key) => {
        const val = searchParams.get(key)
        if (val) params.set(key, val)
      })
    }
    const qs = params.toString()
    router.push(`${resolvedBasePath}${qs ? `?${qs}` : ''}`)
  }

  const curatedOnly = searchParams.get('curatedOnly') === 'true'
  const currentMechanismClass = searchParams.get('mechanismClass') || ''
  const currentAntibiotic = searchParams.get('antibiotic') || ''
  const currentEncodes = searchParams.get('encodes') || ''
  const currentOrganism = searchParams.get('organism') || ''
  const currentCountry = searchParams.get('country') || ''
  const currentGeneName = searchParams.get('geneName') || ''
  const currentMutationType = searchParams.get('mutationType') || ''
  const currentSourceDatabases = searchParams.get('sourceDatabases') || ''

  const hasActiveFilters = !!(
    currentMechanismClass ||
    currentAntibiotic ||
    currentEncodes ||
    currentGeneName ||
    currentMutationType ||
    curatedOnly ||
    currentCountry ||
    currentSourceDatabases ||
    (type === 'genes' && currentOrganism)
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Filters</h3>

        {/* Expert Reviewed Only Toggle */}
        <div className="flex items-center justify-between py-3 px-3 rounded-lg bg-accent/50">
          <div className="space-y-0.5">
            <Label htmlFor="curated-only" className="text-sm font-medium">
              Show only expert-reviewed entries
            </Label>
            <p className="text-xs text-muted-foreground">
              Display validated entries only
            </p>
          </div>
          <Switch
            id="curated-only"
            checked={curatedOnly}
            onCheckedChange={(checked) =>
              updateFilter('curatedOnly', checked ? 'true' : 'false')
            }
          />
        </div>
      </div>

      <Separator />

      {/* Gene Name - Only show for mutations (can be hidden when browsing by gene) */}
      {type === 'mutations' && !hideGeneName && (
        <div className="space-y-2">
          <Label htmlFor="gene-name">Gene Name</Label>
          <Select
            value={currentGeneName || 'all'}
            onValueChange={(value) => updateFilter('geneName', value)}
          >
            <SelectTrigger id="gene-name">
              <SelectValue placeholder="All genes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genes</SelectItem>
              {filterOptions.mutationGeneNames.map((gene) => (
                <SelectItem key={gene} value={gene}>
                  {gene}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Resistance Mechanism - Only for genes */}
      {type === 'genes' && (
        <div className="space-y-2">
          <Label htmlFor="mechanism-class">Resistance Mechanism</Label>
          <Select
            value={currentMechanismClass || 'all'}
            onValueChange={(value) => updateFilter('mechanismClass', value)}
          >
            <SelectTrigger id="mechanism-class">
              <SelectValue placeholder="All mechanisms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All mechanisms</SelectItem>
              {filterOptions.mechanismClasses.map((cls) => (
                <SelectItem key={cls} value={cls}>
                  {cls}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Encodes - Only for genes */}
      {type === 'genes' && filterOptions.encodes.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="encodes">Encodes</Label>
          <Select
            value={currentEncodes || 'all'}
            onValueChange={(value) => updateFilter('encodes', value)}
          >
            <SelectTrigger id="encodes">
              <SelectValue placeholder="All proteins" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All proteins</SelectItem>
              {filterOptions.encodes.map((enc) => (
                <SelectItem key={enc} value={enc}>
                  {enc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Mutation Type - Only for mutations */}
      {type === 'mutations' && (
        <div className="space-y-2">
          <Label htmlFor="mutation-type">Mutation Type</Label>
          <Select
            value={currentMutationType || 'all'}
            onValueChange={(value) => updateFilter('mutationType', value)}
          >
            <SelectTrigger id="mutation-type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {filterOptions.mutationTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
            {(type === 'mutations' ? filterOptions.mutationAntibiotics : filterOptions.antibiotics).map((ab) => (
              <SelectItem key={ab} value={ab}>
                {ab}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Organism - Only for genes */}
      {type === 'genes' && (
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
      )}

      {/* Country */}
      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <Select
          value={currentCountry || 'all'}
          onValueChange={(value) => updateFilter('country', value)}
        >
          <SelectTrigger id="country">
            <SelectValue placeholder="All countries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            <SelectItem value="__missing__">Missing</SelectItem>
            {(type === 'genes' ? filterOptions.countries : filterOptions.mutationCountries).map((country) => (
              <SelectItem key={country} value={country}>
                {country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
