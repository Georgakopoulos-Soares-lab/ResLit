import { cn } from '@/lib/utils'
import type { CurationStatus } from '@/lib/types'

interface StatusBadgeProps {
  status: CurationStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  // Default to 'pending' if status is undefined
  const displayStatus = status || 'pending'

  const getStatusLabel = () => {
    switch (displayStatus) {
      case 'curated':
        return 'Validated'
      case 'pending':
        return 'Not Validated'
      case 'rejected':
        return 'Rejected'
      default:
        return displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        displayStatus === 'curated' && 'bg-success/15 text-success',
        displayStatus === 'pending' && 'bg-blue-100 text-blue-700',
        displayStatus === 'rejected' && 'bg-destructive/15 text-destructive',
        className
      )}
    >
      {displayStatus === 'curated' && (
        <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
      {getStatusLabel()}
    </span>
  )
}
