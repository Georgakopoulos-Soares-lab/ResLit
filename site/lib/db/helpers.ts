import { sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/** Array-containment check for JSON-encoded array columns (the SQLite stand-in
 * for Postgres `.contains(col, [value])` on a TEXT[] column). Returns zero
 * rows against a NULL column — verified against SQLite's json_each semantics. */
export function jsonContains(column: SQLiteColumn, value: string): SQL {
  return sql`EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${value})`
}

/** Lowercases and strips everything but letters/digits — shared by the
 * `alnum` SQLite function (registered in lib/db/client.ts) and the JS-side
 * comparisons below, so a search for "blaOXA14" matches a stored "blaOXA-14"
 * regardless of hyphens/underscores/spaces on either side. */
export function normalizeAlnum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Punctuation-insensitive substring match for gene/allele/mutation
 * identifier columns. Relies on the `alnum` SQLite function registered on
 * the connection in lib/db/client.ts — plain SQL LIKE/REPLACE can't express
 * "strip all non-alphanumeric characters" in one shot. */
export function alnumLike(column: SQLiteColumn, term: string): SQL {
  return sql`alnum(${column}) LIKE ${'%' + normalizeAlnum(term) + '%'}`
}

/** better-sqlite3's compiled SQLITE_MAX_VARIABLE_NUMBER is 32766 — a single
 * query binding more parameters than that throws "too many SQL variables".
 * Any `inArray()` fed by an unbounded list (not a fixed-size page) must be
 * chunked below this. 25000 leaves headroom for other params in the same
 * query. */
const SQL_VARIABLE_CHUNK_SIZE = 25000

export function chunk<T>(arr: T[], size: number = SQL_VARIABLE_CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Converts a Drizzle row (camelCase keys, per lib/db/schema.ts) into the
 * snake_case shape lib/types.ts expects (matching what Supabase/PostgREST
 * returned directly from snake_case Postgres columns). Every camelCase
 * property in the schema is the literal camelCase form of its snake_case
 * column name, so this generic transform round-trips exactly. */
export function toSnakeCase<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())] = value
  }
  return out
}
