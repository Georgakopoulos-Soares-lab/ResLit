'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  allLabel: string
  id?: string
  /** Fixed entries (e.g. a "Missing" sentinel) always shown above the searchable list. */
  specialOptions?: { value: string; label: string }[]
}

// Options lists here can run into the thousands (e.g. free-text "encodes"
// values extracted from the literature) — a plain <Select> would render
// every single one as a real DOM node up front, which is what was actually
// causing the browse pages to feel slow (confirmed via profiling: one
// dropdown alone was creating 14,000+ <option>-equivalent elements on every
// page load, unrelated to the database). Capping rendered matches keeps DOM
// node count constant regardless of how large the underlying list is.
const MAX_VISIBLE_OPTIONS = 100

export function SearchableSelect({ value, onChange, options, placeholder, allLabel, id, specialOptions }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, MAX_VISIBLE_OPTIONS)
    const matches: string[] = []
    for (const opt of options) {
      if (opt.toLowerCase().includes(q)) {
        matches.push(opt)
        if (matches.length >= MAX_VISIBLE_OPTIONS) break
      }
    }
    return matches
  }, [options, query])

  return (
    <div className="relative" ref={containerRef}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus:ring-2 focus:ring-ring/50"
      >
        <span className={cn('truncate text-left', !value && 'text-muted-foreground')}>
          {value ? (specialOptions?.find((o) => o.value === value)?.label ?? value) : placeholder}
        </span>
        <svg className="h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="p-2 border-b border-border">
            <Input
              autoFocus
              placeholder="Type to search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent"
              onClick={() => {
                onChange('')
                setOpen(false)
                setQuery('')
              }}
            >
              {allLabel}
            </button>
            {specialOptions?.map((special) => (
              <button
                key={special.value}
                type="button"
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent',
                  special.value === value && 'bg-accent font-medium'
                )}
                onClick={() => {
                  onChange(special.value)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {special.label}
              </button>
            ))}
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent',
                  opt === value && 'bg-accent font-medium'
                )}
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                  setQuery('')
                }}
              >
                {opt}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">No matches</div>
            )}
            {filtered.length === MAX_VISIBLE_OPTIONS && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Showing first {MAX_VISIBLE_OPTIONS} matches — keep typing to narrow down
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
