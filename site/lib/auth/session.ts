import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sessions, curators, publicCuratorColumns } from '@/lib/db/schema'
import { generateToken, hashToken } from './tokens'
import type { Curator } from '@/lib/types'

export const SESSION_COOKIE = 'reslit_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/** Issues a fresh session for the curator and sets the session cookie. Never reuses an existing token. */
export async function createSession(curatorId: string): Promise<void> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    curatorId,
    expiresAt,
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

/** Deletes the current session (if any) both from the DB and the browser cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  }
  cookieStore.delete(SESSION_COOKIE)
}

/**
 * The single authoritative auth check. Returns null unless there's a valid,
 * unexpired session for a curator whose email has been verified.
 */
export async function getCurrentCurator(): Promise<Curator | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const tokenHash = hashToken(token)

  const rows = await db
    .select({ ...publicCuratorColumns, expiresAt: sessions.expiresAt, emailVerifiedAt: curators.emailVerifiedAt })
    .from(sessions)
    .innerJoin(curators, eq(sessions.curatorId, curators.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
    return null
  }

  if (!row.emailVerifiedAt) return null

  const { expiresAt: _expiresAt, emailVerifiedAt: _emailVerifiedAt, ...curator } = row
  return curator
}
