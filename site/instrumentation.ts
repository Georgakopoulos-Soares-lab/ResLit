export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const path = await import('path')
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
    const { db } = await import('@/lib/db/client')

    // Idempotent — applies any migrations not yet recorded in the DB's own
    // migrations table. Runs synchronously before cache warm-up so the
    // schema is guaranteed current before anything queries it, on every
    // deploy (a fresh Railway Volume starts with no schema at all).
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
    console.log('Database migrations applied')

    const { getValidationTiers, getMutationValidationTiers } = await import('@/lib/actions/browse')
    const { getCachedFilterOptions } = await import('@/lib/browse-cache')

    // Awaited (not fire-and-forget): Railway's healthcheck retries for
    // several minutes before routing real traffic to a deployment, so
    // paying the cache-computation cost here means it happens once per
    // restart, hidden behind that window — instead of whichever real
    // visitor's request happens to land first paying it synchronously.
    try {
      await Promise.all([getValidationTiers(), getMutationValidationTiers(), getCachedFilterOptions()])
      console.log('Cache warm-up complete')
    } catch (err) {
      console.error('Cache warm-up failed:', err)
    }
  }
}
