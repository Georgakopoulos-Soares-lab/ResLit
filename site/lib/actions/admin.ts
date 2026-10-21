'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { curators } from '@/lib/db/schema'
import { getCurrentCurator } from '@/lib/auth/session'

export interface CuratorListItem {
  id: string
  email: string
  name: string | null
  affiliation: string | null
  role: string | null
  verified: boolean
  created_at: string
}

/** All curator accounts, for the admin-only /curator/admins page. */
export async function listCurators(): Promise<CuratorListItem[] | null> {
  const me = await getCurrentCurator()
  if (me?.role !== 'admin') return null

  const rows = await db
    .select({
      id: curators.id,
      email: curators.email,
      name: curators.name,
      affiliation: curators.affiliation,
      role: curators.role,
      emailVerifiedAt: curators.emailVerifiedAt,
      createdAt: curators.createdAt,
    })
    .from(curators)
    .orderBy(curators.createdAt)

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    affiliation: r.affiliation,
    role: r.role,
    verified: !!r.emailVerifiedAt,
    created_at: r.createdAt,
  }))
}

/** Grants or revokes the admin role. Admin-only; an admin can't revoke
 * themselves, so the site can't be left without an admin by accident. */
export async function setCuratorAdmin(curatorId: string, makeAdmin: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const me = await getCurrentCurator()
    if (me?.role !== 'admin') return { success: false, error: 'Only admins can change admin roles' }
    if (!makeAdmin && curatorId === me.id) return { success: false, error: "You can't remove your own admin role" }

    const res = await db
      .update(curators)
      .set({ role: makeAdmin ? 'admin' : null })
      .where(eq(curators.id, curatorId))
    if (res.changes !== 1) return { success: false, error: 'Curator not found' }

    revalidatePath('/curator/admins')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update role' }
  }
}
