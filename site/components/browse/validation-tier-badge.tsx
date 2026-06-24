import { cn } from '@/lib/utils'
import type { ValidationTier, ConfirmationReason } from '@/lib/types'

interface ValidationTierBadgeProps {
  tier: ValidationTier
  reason?: ConfirmationReason
  className?: string
}

const tierConfig: Record<ValidationTier, { label: string; classes: string; description: string }> = {
  Confirmed: {
    label: 'Confirmed',
    classes: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: 'Reported in 2 or more databases, or curator-verified',
  },
  Established: {
    label: 'Established',
    classes: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'Present in external databases but not detected by ResLit',
  },
  Supported: {
    label: 'Supported',
    classes: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'Detected by ResLit in 3+ independent papers',
  },
  Candidate: {
    label: 'Candidate',
    classes: 'bg-slate-100 text-slate-700 border-slate-300',
    description: 'Detected by ResLit in fewer than 3 papers',
  },
}

const reasonLabels: Record<ConfirmationReason, string> = {
  'cross-database': '2+ databases',
  'curator-verified': 'Curator verified',
  'both': '2+ databases + Curator verified',
}

export function ValidationTierBadge({ tier, reason, className }: ValidationTierBadgeProps) {
  const config = tierConfig[tier]
  const reasonText = reason ? reasonLabels[reason] : null
  const tooltip = reasonText ? `${config.description} (${reasonText})` : config.description

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        title={tooltip}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
          config.classes,
        )}
      >
        {config.label}
      </span>
      {reason && tier === 'Confirmed' && (
        <span
          title={reasonText!}
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
            reason === 'curator-verified'
              ? 'bg-violet-50 text-violet-700 border-violet-200'
              : reason === 'both'
                ? 'bg-teal-50 text-teal-700 border-teal-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200',
          )}
        >
          {reason === 'cross-database' && '2+ DBs'}
          {reason === 'curator-verified' && 'Curator'}
          {reason === 'both' && '2+ DBs + Curator'}
        </span>
      )}
    </span>
  )
}
