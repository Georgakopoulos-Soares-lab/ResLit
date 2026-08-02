import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'fs'
import path from 'path'
import * as schema from './schema'
import { normalizeAlnum } from './helpers'

const DATABASE_PATH = process.env.DATABASE_PATH || './data/reslit.db'

/**
 * Lazy singleton — the connection is only opened on first real use, not at
 * module-import time. This matters because Next.js's build ("Collecting
 * page data") imports every page's module graph across many parallel
 * worker processes; every page transitively imports this file, and an
 * eager `new Database(...)` here means all of them race to create/open the
 * same not-yet-existent SQLite file at once (SQLITE_BUSY / "database is
 * locked"). Deferring creation means only code paths that actually query
 * the database (e.g. the homepage's build-time static render) touch it.
 */
let _sqlite: Database.Database | null = null
let _db: BetterSQLite3Database<typeof schema> | null = null

function getSqlite(): Database.Database {
  if (!_sqlite) {
    fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true })
    _sqlite = new Database(DATABASE_PATH)
    _sqlite.pragma('journal_mode = WAL')
    _sqlite.pragma('foreign_keys = ON')
    _sqlite.pragma('busy_timeout = 5000')
    // Backs alnumLike() in ./helpers — punctuation-insensitive search
    // (e.g. "blaOXA14" matches "blaOXA-14").
    _sqlite.function('alnum', { deterministic: true }, (value: unknown) =>
      value == null ? null : normalizeAlnum(String(value))
    )
  }
  return _sqlite
}

function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) {
    _db = drizzle(getSqlite(), { schema })
  }
  return _db
}

function lazyProxy<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const real = getTarget()
      const value = Reflect.get(real, prop, receiver)
      return typeof value === 'function' ? value.bind(real) : value
    },
  })
}

export const db = lazyProxy(getDb)
export const sqlite = lazyProxy(getSqlite)
