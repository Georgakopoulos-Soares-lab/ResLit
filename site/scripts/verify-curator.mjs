#!/usr/bin/env -S npx tsx
/**
 * Manually marks a curator's email as verified, bypassing the Resend email
 * flow. For unblocking accounts when RESEND_API_KEY is missing/misconfigured
 * and the confirmation email never arrived.
 *
 * Usage:
 *   npx tsx scripts/verify-curator.mjs you@example.com
 */

import { eq } from 'drizzle-orm'
import { db, sqlite } from '@/lib/db/client'
import { curators } from '@/lib/db/schema'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npx tsx scripts/verify-curator.mjs <email>')
    process.exit(1)
  }

  const [curator] = await db.select().from(curators).where(eq(curators.email, email)).limit(1)
  if (!curator) {
    console.error(`No curator account found for ${email}`)
    process.exit(1)
  }

  if (curator.emailVerifiedAt) {
    console.log(`${email} is already verified (since ${curator.emailVerifiedAt})`)
    sqlite.close()
    return
  }

  await db
    .update(curators)
    .set({ emailVerifiedAt: new Date().toISOString() })
    .where(eq(curators.id, curator.id))

  console.log(`Verified ${email} (curator id ${curator.id}). They can now log in.`)
  sqlite.close()
}

main()
