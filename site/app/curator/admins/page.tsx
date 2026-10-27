import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AdminRoleButton } from '@/components/curator/admin-role-button'
import { getCurrentCurator } from '@/lib/actions/curator'
import { listCurators } from '@/lib/actions/admin'

export const dynamic = 'force-dynamic'

export default async function ManageAdminsPage() {
  const me = await getCurrentCurator()
  if (!me) redirect('/curator/login')
  if (me.role !== 'admin') redirect('/curator/dashboard')

  const curatorList = await listCurators()
  if (!curatorList) redirect('/curator/dashboard')

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/curator/dashboard">← Back to Dashboard</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Manage Admins</h1>
        <p className="mt-1 mb-6 text-muted-foreground">
          Admins can accept or decline curator proposals and grant or revoke admin rights. {curatorList.length} curator
          {curatorList.length === 1 ? '' : 's'} registered.
        </p>

        <Card className="border-border/60">
          <CardContent className="divide-y divide-border/60 p-0">
            {curatorList.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 p-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.name || '(no name)'}</span>
                    {c.role === 'admin' && <Badge variant="secondary">Admin</Badge>}
                    {c.id === me.id && <span className="text-xs text-muted-foreground">(you)</span>}
                    {!c.verified && (
                      <Badge variant="outline" className="text-xs">
                        email not verified
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground break-all">
                    {c.email}
                    {c.affiliation && <> · {c.affiliation}</>} · joined {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
                {c.id !== me.id && <AdminRoleButton curatorId={c.id} isAdmin={c.role === 'admin'} name={c.name || c.email} />}
              </div>
            ))}
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  )
}
