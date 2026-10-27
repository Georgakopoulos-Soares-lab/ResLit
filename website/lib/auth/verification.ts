import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { verificationTokens } from '@/lib/db/schema'
import { generateToken, hashToken } from './tokens'

type TokenType = 'verify' | 'reset'

const TTL_MS: Record<TokenType, number> = {
  verify: 24 * 60 * 60 * 1000, // 24h
  reset: 60 * 60 * 1000, // 1h
}

export async function createVerificationToken(curatorId: string, type: TokenType): Promise<string> {
  const token = generateToken()
  await db.insert(verificationTokens).values({
    tokenHash: hashToken(token),
    curatorId,
    type,
    expiresAt: new Date(Date.now() + TTL_MS[type]).toISOString(),
  })
  return token
}

interface ConsumeResult {
  success: boolean
  curatorId?: string
  error?: string
}

/** Non-destructive validity check — does NOT mark the token used. Use this for
 * upfront UI checks (e.g. "is this reset link still valid?" before showing the
 * form); use consumeVerificationToken at actual submit time. */
export async function peekVerificationToken(token: string, type: TokenType): Promise<{ valid: boolean }> {
  const tokenHash = hashToken(token)
  const rows = await db.select().from(verificationTokens).where(eq(verificationTokens.tokenHash, tokenHash)).limit(1)
  const row = rows[0]

  if (!row || row.type !== type || row.usedAt) return { valid: false }
  if (new Date(row.expiresAt).getTime() < Date.now()) return { valid: false }

  return { valid: true }
}

/** Validates + marks a token used. A token can only ever be consumed once. */
export async function consumeVerificationToken(token: string, type: TokenType): Promise<ConsumeResult> {
  const tokenHash = hashToken(token)
  const rows = await db.select().from(verificationTokens).where(eq(verificationTokens.tokenHash, tokenHash)).limit(1)
  const row = rows[0]

  if (!row || row.type !== type) return { success: false, error: 'Invalid or expired link' }
  if (row.usedAt) return { success: false, error: 'This link has already been used' }
  if (new Date(row.expiresAt).getTime() < Date.now()) return { success: false, error: 'This link has expired' }

  await db
    .update(verificationTokens)
    .set({ usedAt: new Date().toISOString() })
    .where(eq(verificationTokens.tokenHash, tokenHash))

  return { success: true, curatorId: row.curatorId }
}
