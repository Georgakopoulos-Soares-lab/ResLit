import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PubMedLink } from '@/components/browse/pubmed-link'
import { ProposalStatusBadge } from '@/components/curator/proposal-status-badge'
import type { CurationProposal } from '@/lib/types'

const actionLabel: Record<CurationProposal['action'], string> = {
  edit: 'Edit',
  reassign: 'Reassign',
  approve: 'Approve',
  reject: 'Reject',
  create: 'New entry',
}

const actionStyle: Record<CurationProposal['action'], string> = {
  approve: 'bg-green-100 text-green-800 border-green-200',
  reject: 'bg-red-100 text-red-800 border-red-200',
  edit: 'bg-blue-100 text-blue-800 border-blue-200',
  reassign: 'bg-purple-100 text-purple-800 border-purple-200',
  create: 'bg-gray-100 text-gray-800 border-gray-200',
}

function toLabel(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function formatVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—'
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '—'
  return String(val)
}

function entryHref(p: CurationProposal): string | null {
  if (!p.entry) return null
  if (p.target_type === 'mutation') return `/browse/mutations/${p.entry.id}`
  return p.entry.gene_name ? `/browse/genes/${encodeURIComponent(p.entry.gene_name)}` : null
}

function ProposedChange({ p }: { p: CurationProposal }) {
  const changes = (p.changes ?? {}) as Record<string, unknown>

  if (p.action === 'approve') {
    return (
      <p className="text-sm">
        Mark as <span className="font-medium">curated</span> — the {p.target_type} becomes{' '}
        <span className="font-medium">Confirmed (curator-verified)</span>
      </p>
    )
  }
  if (p.action === 'reject') {
    return (
      <p className="text-sm">
        Mark as <span className="font-medium">rejected</span>
      </p>
    )
  }
  if (p.action === 'create') {
    const values = (changes.values ?? {}) as Record<string, unknown>
    const shown = Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        {shown.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-medium text-muted-foreground">{toLabel(key)}</dt>
            <dd className="break-words">{formatVal(value)}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <ul className="space-y-1">
      {Object.entries(changes as Record<string, { old: unknown; new: unknown }>).map(([key, diff]) => (
        <li key={key} className="text-xs">
          <span className="font-medium text-foreground">{toLabel(key)}:</span>{' '}
          <span className="text-muted-foreground line-through">{formatVal(diff?.old)}</span>
          {' → '}
          <span className="text-foreground">{formatVal(diff?.new)}</span>
        </li>
      ))}
    </ul>
  )
}

export function ProposalCard({ proposal: p, actions }: { proposal: CurationProposal; actions?: React.ReactNode }) {
  const href = entryHref(p)
  const result = (p.result ?? {}) as Record<string, unknown>

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${actionStyle[p.action]}`}>
                {actionLabel[p.action]}
              </Badge>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{p.target_type}</span>
              {href ? (
                <Link href={href} className="font-semibold hover:underline break-all">
                  {p.entry_label || `#${p.target_id}`}
                </Link>
              ) : (
                <span className="font-semibold break-all">{p.entry_label || (p.target_id ? `#${p.target_id}` : 'New entry')}</span>
              )}
              {p.entry && <span className="text-xs text-muted-foreground">(currently {p.entry.status})</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Proposed by <span className="font-medium text-foreground">{p.curator_name || p.curator_email || 'Unknown curator'}</span>
              {p.curator_affiliation && <> ({p.curator_affiliation})</>} on {new Date(p.created_at).toLocaleString()}
              {p.legacy_history_id !== null && <> · re-queued from earlier curation history</>}
            </p>
          </div>
          <ProposalStatusBadge status={p.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Source PMID:</span>
          <PubMedLink pmid={p.pmid} />
        </div>

        <div className="rounded-md bg-muted/40 p-3">
          <ProposedChange p={p} />
        </div>

        {p.note && (
          <p className="text-xs text-muted-foreground">
            Curator note: <span className="text-foreground">{p.note}</span>
          </p>
        )}

        {p.status !== 'pending' && (
          <div className="text-xs text-muted-foreground space-y-1 border-t border-border/60 pt-2">
            <p>
              {p.status === 'accepted' ? 'Accepted' : 'Declined'} by{' '}
              <span className="font-medium text-foreground">{p.reviewed_by_name ?? 'admin'}</span>
              {p.reviewed_at && <> on {new Date(p.reviewed_at).toLocaleString()}</>}
            </p>
            {typeof result.previous_tier === 'string' && typeof result.new_tier === 'string' && result.previous_tier !== result.new_tier && (
              <p>
                Validation: {result.previous_tier} → <span className="text-emerald-700 font-medium">{result.new_tier}</span>
              </p>
            )}
            {p.admin_comment && (
              <p>
                Admin comment: <span className="text-foreground">{p.admin_comment}</span>
              </p>
            )}
          </div>
        )}

        {actions}
      </CardContent>
    </Card>
  )
}
