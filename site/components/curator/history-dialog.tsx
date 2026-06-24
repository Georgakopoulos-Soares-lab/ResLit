'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { getCurationHistory } from '@/lib/actions/curator'
import type { CurationHistory, ConfirmationReason } from '@/lib/types'

interface HistoryDialogProps {
  targetType: 'gene' | 'mutation'
  targetId: string
  allTargetIds?: string[]
  compact?: boolean
  confirmationReason?: ConfirmationReason
}

function toLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '—'
  return String(val)
}

const actionStyle: Record<string, string> = {
  approve: 'bg-green-100 text-green-800 border-green-200',
  reject:  'bg-red-100 text-red-800 border-red-200',
  edit:    'bg-blue-100 text-blue-800 border-blue-200',
  create:  'bg-gray-100 text-gray-800 border-gray-200',
}

export function HistoryDialog({ targetType, targetId, allTargetIds, compact, confirmationReason }: HistoryDialogProps) {
  const hasCrossDb = confirmationReason === 'cross-database' || confirmationReason === 'both'
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<CurationHistory[] | null>(null)

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && history === null) {
      setLoading(true)
      const data = await getCurationHistory(targetType, targetId, allTargetIds)
      setHistory(data)
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Curation history">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="sr-only">History</span>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            View history
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Curation History</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[70vh] space-y-3 pr-1">
          {hasCrossDb && (
            <div className="border border-emerald-200 rounded-md p-3 space-y-2 bg-emerald-50/50">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200">
                  auto-confirmed
                </Badge>
                <span className="text-sm font-medium">Automated Validation</span>
              </div>
              <p className="text-xs text-muted-foreground">
                This {targetType} was automatically confirmed because it is reported in 2 or more databases.
              </p>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-5 w-5" />
            </div>
          ) : !history || history.length === 0 ? (
            !hasCrossDb && <p className="text-sm text-muted-foreground py-4">No history yet.</p>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="border border-border/60 rounded-md p-3 space-y-2">
                {/* Header row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${actionStyle[entry.action] ?? actionStyle.create}`}>
                    {entry.action}
                  </Badge>
                  <span className="text-sm font-medium">
                    {entry.curator_name ?? entry.curator?.name ?? entry.curator_email ?? entry.curator?.email ?? 'Unknown'}
                  </span>
                  {(entry.curator_affiliation || entry.curator?.affiliation) && (
                    <span className="text-xs text-muted-foreground">({entry.curator_affiliation ?? entry.curator?.affiliation})</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Allele info (stored in changes.allele) */}
                {entry.changes && (entry.changes as Record<string, unknown>).allele && (
                  <p className="text-xs text-muted-foreground">
                    Allele: <span className="font-medium text-foreground">{String((entry.changes as Record<string, unknown>).allele)}</span>
                  </p>
                )}

                {/* Status change */}
                {entry.previous_status !== entry.new_status && (
                  <p className="text-xs text-muted-foreground">
                    Status:{' '}
                    <span className="font-medium text-foreground">{entry.previous_status ?? '—'}</span>
                    {' → '}
                    <span className="font-medium text-foreground">{entry.new_status ?? '—'}</span>
                  </p>
                )}

                {/* Field-level diff */}
                {entry.action === 'edit' && entry.changes && Object.keys(entry.changes).length > 0 && (
                  <ul className="space-y-1">
                    {Object.entries(entry.changes as Record<string, { old: unknown; new: unknown }>).map(([key, diff]) => (
                      <li key={key} className="text-xs">
                        <span className="font-medium text-foreground">{toLabel(key)}:</span>{' '}
                        <span className="text-muted-foreground line-through">{formatVal(diff.old)}</span>
                        {' → '}
                        <span className="text-foreground">{formatVal(diff.new)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
