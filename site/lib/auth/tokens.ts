import { randomBytes, createHash } from 'crypto'

/** Generates an opaque, high-entropy token for sessions/verification/reset links. */
export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/** Only the hash is ever stored — the raw token exists solely in the cookie/email link. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
