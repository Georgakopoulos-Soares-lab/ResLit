import { Badge } from '@/components/ui/badge'
import type { ProposalStatus } from '@/lib/types'

const style: Record<ProposalStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  accepted: 'bg-green-100 text-green-800 border-green-200',
  declined: 'bg-gray-100 text-gray-700 border-gray-300',
}

const label: Record<ProposalStatus, string> = {
  pending: 'Pending review — not applied',
  accepted: 'Accepted',
  declined: 'Declined — not applied',
}

export function ProposalStatusBadge({ status, short = false }: { status: ProposalStatus; short?: boolean }) {
  return (
    <Badge variant="outline" className={`text-xs ${style[status]}`}>
      {short ? status.charAt(0).toUpperCase() + status.slice(1) : label[status]}
    </Badge>
  )
}
