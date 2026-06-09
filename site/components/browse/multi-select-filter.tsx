'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { ChevronDown } from 'lucide-react'

interface MultiSelectFilterProps {
  label: string
  paramName: string
  options: string[]
  basePath?: string
}

export function MultiSelectFilter({
  label,
  paramName,
  options,
  basePath = '/browse',
}: MultiSelectFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedValues = searchParams.get(paramName)?.split(',').filter(Boolean) || []
  const isAllSelected = selectedValues.length === 0 || selectedValues.length === options.length

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([name, value]) => {
        if (value === null || value === '') {
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

  const toggleSelection = (value: string) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]

    const queryValue = newSelected.length === options.length ? null : newSelected.length > 0 ? newSelected.join(',') : null
    const queryString = createQueryString({ [paramName]: queryValue })
    router.push(`${basePath}${queryString ? `?${queryString}` : ''}`)
  }

  const toggleAll = () => {
    const queryValue = isAllSelected ? null : options.join(',')
    const queryString = createQueryString({ [paramName]: queryValue })
    router.push(`${basePath}${queryString ? `?${queryString}` : ''}`)
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between">
            <span>{isAllSelected ? 'All' : `${selectedValues.length} selected`}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-full min-w-[180px]">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={isAllSelected}
            onCheckedChange={toggleAll}
            className="font-semibold"
          >
            All
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={isAllSelected || selectedValues.includes(option)}
              onCheckedChange={() => toggleSelection(option)}
            >
              {option}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

