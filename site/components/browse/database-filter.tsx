'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown } from 'lucide-react'

interface DatabaseFilterProps {
  available: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export function DatabaseFilter({ available, selected, onChange }: DatabaseFilterProps) {
  const [expanded, setExpanded] = useState(false)

  const toggleDatabase = (database: string) => {
    if (selected.includes(database)) {
      onChange(selected.filter((d) => d !== database))
    } else {
      onChange([...selected, database])
    }
  }

  const selectAll = () => {
    if (selected.length === available.length) {
      onChange([])
    } else {
      onChange(available)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between h-8"
      >
        <span className="text-sm">
          {selected.length === 0 ? 'All Databases' : `${selected.length} selected`}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </Button>

      {expanded && (
        <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="select-all"
              checked={selected.length === available.length && available.length > 0}
              onChange={selectAll}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="select-all" className="text-sm cursor-pointer flex-1">
              All Databases
            </label>
          </div>

          <div className="space-y-2">
            {available.map((database) => (
              <div key={database} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`db-${database}`}
                  checked={selected.includes(database)}
                  onChange={() => toggleDatabase(database)}
                  className="w-4 h-4 cursor-pointer"
                />
                <label htmlFor={`db-${database}`} className="text-sm cursor-pointer flex-1">
                  {database}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected.length > 0 && selected.length < available.length && (
        <div className="flex gap-1 flex-wrap">
          {selected.map((db) => (
            <Badge
              key={db}
              variant="secondary"
              className="text-xs px-2 py-0.5 cursor-pointer hover:opacity-80"
              onClick={() => toggleDatabase(db)}
            >
              {db} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
