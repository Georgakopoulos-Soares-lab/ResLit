import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { curators } from '@/lib/db/schema'
import { hashPassword } from './password'

/**
 * Low-level curator row access for the auth module only. Rows returned here
 * include `passwordHash` — callers must strip it before returning anything
 * to a client component. lib/actions/curator.ts's getCurrentCurator() (via
 * lib/auth/session.ts) is the safe, public-column-only path for app code.
 */

export async function findCuratorByEmail(email: string) {
  const rows = await db.select().from(curators).where(eq(curators.email, email)).limit(1)
  return rows[0] ?? null
}

export async function findCuratorById(id: string) {
  const rows = await db.select().from(curators).where(eq(curators.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createCurator(params: {
  email: string
  password: string
  name: string
  affiliation: string
}) {
  const passwordHash = await hashPassword(params.password)
  const [row] = await db
    .insert(curators)
    .values({
      email: params.email,
      passwordHash,
      name: params.name,
      affiliation: params.affiliation,
    })
    .returning()
  return row
}

export async function markEmailVerified(curatorId: string): Promise<void> {
  await db
    .update(curators)
    .set({ emailVerifiedAt: new Date().toISOString() })
    .where(eq(curators.id, curatorId))
}

export async function updateCuratorPassword(curatorId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword)
  await db.update(curators).set({ passwordHash }).where(eq(curators.id, curatorId))
}

/** Emails listed in the ADMIN_EMAILS env var (comma-separated) are granted
 * the admin role when they verify their email or log in. This bootstraps the
 * first admin(s) without putting anyone's email in the repo; further admins
 * can then be granted from /curator/admins. */
function bootstrapAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

export async function ensureBootstrapAdmin(curator: { id: string; email: string; role: string | null }): Promise<void> {
  if (curator.role === 'admin') return
  if (!bootstrapAdminEmails().has(curator.email.trim().toLowerCase())) return
  await db.update(curators).set({ role: 'admin' }).where(eq(curators.id, curator.id))
}
