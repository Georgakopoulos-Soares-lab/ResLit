'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

function FilterLabel({ label, tooltip, richTooltip }: { label: string; tooltip: string; richTooltip?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold leading-none hover:bg-primary/20 hover:scale-110 transition-all shrink-0"
          aria-label={`Info about ${label}`}
        >
          ?
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-2 w-64 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-3.5 text-xs text-foreground shadow-lg shadow-primary/10 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l-2 border-t-2 border-primary/20 bg-blue-50" />
          {richTooltip ? <div className="leading-relaxed">{richTooltip}</div> : <p className="leading-relaxed">{tooltip}</p>}
        </div>
      )}
    </div>
  )
}

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

  const currentMechanismClass = searchParams.get('mechanismClass') || ''
  const currentAntibiotic = searchParams.get('antibiotic') || ''
  const currentEncodes = searchParams.get('encodes') || ''
  const currentOrganism = searchParams.get('organism') || ''
  const currentCountry = searchParams.get('country') || ''
  const currentGeneName = searchParams.get('geneName') || ''
  const currentMutationType = searchParams.get('mutationType') || ''
  const currentSourceDatabases = searchParams.get('sourceDatabases') || ''
  const currentPmid = searchParams.get('pmid') || ''
  const currentValidationTier = searchParams.get('validationTier') || ''

  const hasActiveFilters = !!(
    currentMechanismClass ||
    currentAntibiotic ||
    currentEncodes ||
    currentGeneName ||
    currentMutationType ||
    currentCountry ||
    currentSourceDatabases ||
    currentPmid ||
    currentValidationTier ||
    (type === 'genes' && currentOrganism)
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Filters</h3>
      </div>

      {/* 1. Validation Status */}
      <div className="space-y-2">
        <FilterLabel
          label="Validation Status"
          tooltip=""
          richTooltip={
            <div className="space-y-2">
              <p className="font-medium text-foreground mb-2">Confidence tier based on evidence:</p>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 mt-0.5">Confirmed</span>
                <span>Reported in 2 or more databases, or expert-curated</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300 shrink-0 mt-0.5">Established</span>
                <span>Found in an external database only</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 shrink-0 mt-0.5">Supported</span>
                <span>Found in ResLit with 3+ papers</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 shrink-0 mt-0.5">Candidate</span>
                <span>Fewer evidence sources</span>
              </div>
            </div>
          }
        />
        <Select
          value={currentValidationTier || 'all'}
          onValueChange={(value) => updateFilter('validationTier', value)}
        >
          <SelectTrigger id="validation-tier">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Confirmed">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Confirmed
              </span>
            </SelectItem>
            <SelectItem value="Established">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Established
              </span>
            </SelectItem>
            <SelectItem value="Supported">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Supported
              </span>
            </SelectItem>
            <SelectItem value="Candidate">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Candidate
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 2. Resistance Mechanism (genes only) */}
      {type === 'genes' && (
        <div className="space-y-2">
          <FilterLabel
            label="Resistance Mechanism"
            tooltip="The biochemical mechanism by which the gene confers antimicrobial resistance (e.g. enzymatic inactivation, target modification, efflux pump)."
          />
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

      {/* 3. Antibiotic */}
      <div className="space-y-2">
        <FilterLabel
          label="Antibiotic"
          tooltip="Filter by the antibiotic or drug class that the gene or mutation confers resistance to."
        />
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

      {/* 4. Encodes (genes only) */}
      {type === 'genes' && filterOptions.encodes.length > 0 && (
        <div className="space-y-2">
          <FilterLabel
            label="Encodes"
            tooltip="The protein or enzyme product that the gene encodes (e.g. beta-lactamase, aminoglycoside acetyltransferase)."
          />
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

      {/* 5. Source Database */}
      {filterOptions.sourceDatabases.length > 0 && (
        <div className="space-y-2">
          <FilterLabel
            label="Source Database"
            tooltip="The database where this gene entry originates from (e.g. CARD, ResFinder, ResLit)."
          />
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

      {/* 6. Organism (genes only) */}
      {type === 'genes' && (
        <div className="space-y-2">
          <FilterLabel
            label="Organism"
            tooltip="The bacterial species or organism in which resistance was observed or tested."
          />
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

      {/* Gene Name (mutations only) */}
      {type === 'mutations' && !hideGeneName && (
        <div className="space-y-2">
          <FilterLabel
            label="Gene Name"
            tooltip="Filter mutations by the gene they belong to."
          />
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

      {/* Mutation Type (mutations only) */}
      {type === 'mutations' && (
        <div className="space-y-2">
          <FilterLabel
            label="Mutation Type"
            tooltip="The type of genetic change (e.g. substitution, insertion, deletion, frameshift)."
          />
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

      {/* 7. PMID */}
      <div className="space-y-2">
        <FilterLabel
          label="PMID"
          tooltip="Search by PubMed ID to find genes or mutations reported in a specific publication."
        />
        <Input
          id="pmid-filter"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 12345678"
          value={currentPmid}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '')
            updateFilter('pmid', val || null)
          }}
        />
      </div>

      {/* 8. Country */}
      <div className="space-y-2">
        <FilterLabel
          label="Country"
          tooltip="The geographic location or country where the resistant isolate was collected."
        />
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
