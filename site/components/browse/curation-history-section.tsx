import { getCurationHistory } from '@/lib/actions/curator'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ConfirmationReason } from '@/lib/types'

interface Props {
  targetType: 'gene' | 'mutation'
  targetId: string
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
  'auto-confirmed': 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

export async function CurationHistorySection({ targetType, targetId, confirmationReason }: Props) {
  const history = await getCurationHistory(targetType, targetId)

  const hasManualApproval = history.some((e) => e.action === 'approve')
  const hasCrossDb = confirmationReason === 'cross-database' || confirmationReason === 'both'

  if (history.length === 0 && !confirmationReason) return null

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Curation History
          <span className="text-xs font-normal text-muted-foreground">({history.length + (hasCrossDb ? 1 : 0)} {(history.length + (hasCrossDb ? 1 : 0)) === 1 ? 'entry' : 'entries'})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasCrossDb && (
          <div className="border border-emerald-200 rounded-md p-3 space-y-2 bg-emerald-50/50">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200">
                auto-confirmed
              </Badge>
              <span className="text-sm font-medium">
                Automated Validation
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              This {targetType} was automatically confirmed because it is reported in 2 or more databases.
            </p>
          </div>
        )}
        {history.map((entry) => (
          <div key={entry.id} className="border border-border/60 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${actionStyle[entry.action] ?? actionStyle.create}`}>
                {entry.action}
              </Badge>
              <span className="text-sm font-medium">
                {entry.curator?.name ?? entry.curator?.email ?? 'Collaborator'}
              </span>
              <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                {new Date(entry.created_at).toLocaleString()}
              </span>
            </div>

            {entry.previous_status !== entry.new_status && (
              <p className="text-xs text-muted-foreground">
                Status:{' '}
                <span className="font-medium text-foreground">{entry.previous_status ?? '—'}</span>
                {' → '}
                <span className="font-medium text-foreground">{entry.new_status ?? '—'}</span>
              </p>
            )}

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
        ))}
      </CardContent>
    </Card>
  )
}
