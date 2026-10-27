'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { acceptProposal, declineProposal } from '@/lib/actions/proposals'

export function ProposalReviewActions({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  const run = (decision: 'accept' | 'decline') => {
    setError(null)
    setBusy(decision)
    startTransition(async () => {
      const fn = decision === 'accept' ? acceptProposal : declineProposal
      const result = await fn(id, comment || undefined)
      setBusy(null)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? 'An error occurred')
      }
    })
  }

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <Label htmlFor={`comment-${id}`} className="text-xs">
        Admin comment (optional)
      </Label>
      <Textarea
        id={`comment-${id}`}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Visible to the curator and in the entry's history"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-success border-success/50 hover:bg-success/10"
          onClick={() => run('accept')}
          disabled={isPending}
        >
          {busy === 'accept' ? <Spinner className="h-4 w-4" /> : 'Accept'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive border-destructive/50 hover:bg-destructive/10"
          onClick={() => run('decline')}
          disabled={isPending}
        >
          {busy === 'decline' ? <Spinner className="h-4 w-4" /> : 'Decline'}
        </Button>
      </div>
    </div>
  )
}
