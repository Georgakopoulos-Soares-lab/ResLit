#!/usr/bin/env -S npx tsx
/**
 * Grants the admin role (curators.role = 'admin') to an existing curator
 * account, so it can accept/decline proposals at /curator/review. The
 * account must already exist (sign up and verify the email first).
 * Changes only that curator's role column.
 *
 * Usage:
 *   npx tsx scripts/set-admin.mjs you@example.com
 *   npx tsx scripts/set-admin.mjs you@example.com --revoke
 */

import { eq, sql } from 'drizzle-orm'
import { db, sqlite } from '@/lib/db/client'
import { curators } from '@/lib/db/schema'

async function main() {
  const email = process.argv[2]
  const revoke = process.argv.includes('--revoke')
  if (!email) {
    console.error('Usage: npx tsx scripts/set-admin.mjs <email> [--revoke]')
    process.exit(1)
  }

  const [curator] = await db
    .select()
    .from(curators)
    .where(eq(sql`lower(${curators.email})`, email.trim().toLowerCase()))
    .limit(1)
  if (!curator) {
    console.error(`No curator account found for ${email} — sign up at /curator/signup first, then re-run.`)
    process.exit(1)
  }

  console.log(`Curator: ${curator.name || '(no name)'} <${curator.email}>, role ${curator.role ?? '(none)'}, verified ${curator.emailVerifiedAt ? 'yes' : 'no'}`)

  await db.update(curators).set({ role: revoke ? null : 'admin' }).where(eq(curators.id, curator.id))

  console.log(revoke ? `Revoked admin from ${curator.email}.` : `${curator.email} is now an admin.`)
  sqlite.close()
}

main()
