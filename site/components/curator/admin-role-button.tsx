'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { setCuratorAdmin } from '@/lib/actions/admin'

export function AdminRoleButton({ curatorId, isAdmin, name }: { curatorId: string; isAdmin: boolean; name: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const toggle = () => {
    const question = isAdmin
      ? `Remove admin rights from ${name}?`
      : `Make ${name} an admin? They will be able to accept/decline proposals and manage admins.`
    if (!window.confirm(question)) return
    setError(null)
    startTransition(async () => {
      const result = await setCuratorAdmin(curatorId, !isAdmin)
      if (result.success) router.refresh()
      else setError(result.error ?? 'An error occurred')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={toggle}
        disabled={isPending}
        className={isAdmin ? 'text-destructive border-destructive/50 hover:bg-destructive/10' : ''}
      >
        {isPending ? <Spinner className="h-4 w-4" /> : isAdmin ? 'Revoke admin' : 'Make admin'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
