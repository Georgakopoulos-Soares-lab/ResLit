'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { updateGeneStatus, updateMutationStatus } from '@/lib/actions/curator'
import { cn } from '@/lib/utils'

interface CurationActionsProps {
  type: 'gene' | 'mutation'
  id: string
  compact?: boolean
  onSuccess?: () => void
}

export function CurationActions({ type, id, compact = false, onSuccess }: CurationActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAction = (selectedAction: 'approve' | 'reject') => {
    setAction(selectedAction)
    setNote('')
    setError(null)
    setDialogOpen(true)
  }

  const executeAction = () => {
    if (!action) return
    
    startTransition(async () => {
      const status = action === 'approve' ? 'curated' : 'rejected'
      const updateFn = type === 'gene' ? updateGeneStatus : updateMutationStatus
      
      console.log('Executing curation action:', { type, id: String(id), status, action })
      
      const result = await updateFn(String(id), status, note || undefined)
      
      console.log('Curation result:', result)
      
      if (result.success) {
        setDialogOpen(false)
        setAction(null)
        setNote('')
        onSuccess?.()
      } else {
        console.error('Curation error:', result.error)
        setError(result.error || 'An error occurred')
      }
    })
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-success hover:text-success hover:bg-success/10"
            onClick={() => handleAction('approve')}
            disabled={isPending}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="sr-only">Approve</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => handleAction('reject')}
            disabled={isPending}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="sr-only">Reject</span>
          </Button>
          
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === 'approve' ? 'Approve' : 'Reject'} {type}
              </DialogTitle>
              <DialogDescription>
                {action === 'approve' 
                  ? `This will mark the ${type} as curated and visible to all users.`
                  : `This will mark the ${type} as rejected.`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="note">Add a note (optional)</Label>
                <Textarea
                  id="note"
                  placeholder={`Add any comments about this ${type}...`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={executeAction}
                disabled={isPending}
                className={cn(
                  action === 'approve' && 'bg-success hover:bg-success/90',
                  action === 'reject' && 'bg-destructive hover:bg-destructive/90'
                )}
              >
                {isPending ? <Spinner className="h-4 w-4" /> : action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="text-success border-success/50 hover:bg-success/10"
          onClick={() => handleAction('approve')}
          disabled={isPending}
        >
          <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Approve
        </Button>
        <Button
          variant="outline"
          className="text-destructive border-destructive/50 hover:bg-destructive/10"
          onClick={() => handleAction('reject')}
          disabled={isPending}
        >
          <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reject
        </Button>
      </div>
      
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action === 'approve' ? 'Approve' : 'Reject'} {type}
          </DialogTitle>
          <DialogDescription>
            {action === 'approve' 
              ? `This will mark the ${type} as curated and visible to all users.`
              : `This will mark the ${type} as rejected.`
            }
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="note-full">Add a note (optional)</Label>
            <Textarea
              id="note-full"
              placeholder={`Add any comments about this ${type}...`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={executeAction}
            disabled={isPending}
            className={cn(
              action === 'approve' && 'bg-success hover:bg-success/90',
              action === 'reject' && 'bg-destructive hover:bg-destructive/90'
            )}
          >
            {isPending ? <Spinner className="h-4 w-4" /> : action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
