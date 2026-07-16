# ResLit

A curated database of antimicrobial resistance (AMR) genes and mutations, extracted from the literature and cross-referenced against CARD, ResFinder, and the NCBI Reference Gene Catalog.

## Architecture

Next.js 16 (App Router), deployed on Railway as a single-instance Docker container.

**Database**: embedded SQLite (`better-sqlite3` + Drizzle ORM), not Supabase/Postgres. The database
lives at `DATABASE_PATH` (defaults to `./data/reslit.db` locally; a Railway Volume in production) and is
queried in-process — no network hop for reads or writes, which is why this was chosen over a hosted
Postgres service.

**Auth**: hand-rolled curator auth (`lib/auth/`), not Supabase Auth. Passwords are hashed with Node's
`crypto.scrypt`; sessions are opaque tokens (SHA-256-hashed at rest) in a `sessions` table; email
verification and password reset use single-use tokens sent via [Resend](https://resend.com). Without a
`RESEND_API_KEY`, verification/reset links are logged to the console instead of emailed — useful for local
dev.

This replaced a prior Supabase-based backend (Postgres + Supabase Auth), migrated off after the Supabase
project hit its free-tier egress quota. See `lib/db/schema.ts` for the full schema and `git log` for the
migration history.

## Local setup

```bash
pnpm install
pnpm db:migrate   # create/update the local SQLite schema
pnpm db:seed      # populate genes/mutations/papers from scripts/seed-data/*.csv
pnpm dev
```

Visit `http://localhost:3000`. Curator signup/login works out of the box — without `RESEND_API_KEY` set,
verification and password-reset links are printed to the terminal running `pnpm dev` instead of emailed.

### Re-seeding data

`scripts/seed-sqlite.mjs` reads the two CSVs in `scripts/seed-data/` and loads them into `papers`,
`amr_genes`, and `amr_mutations`. **Running `pnpm db:seed` again always clears and replaces those three
tables first** — safe to edit the CSVs and re-run as many times as needed while iterating on the data.
It does *not* touch curator accounts, comments, or curation history (those are live app state, not
seed data).

### Useful scripts

- `pnpm db:generate` — generate a new Drizzle migration after editing `lib/db/schema.ts`
- `pnpm db:migrate` — apply pending migrations
- `pnpm db:studio` — browse the local database (Drizzle Studio)
- `pnpm db:seed` — clear and reload genes/mutations/papers from `scripts/seed-data/`

## Deployment (Railway)

Not yet wired up — the SQLite migration has been verified locally only so far. Remaining work: a Railway
Volume for the database file, `better-sqlite3`'s native build in the Alpine Docker stage, and a one-time
production seed via `railway ssh`. See the migration plan for the full checklist.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_PATH` | no (defaults to `./data/reslit.db`) | SQLite file location |
| `RESEND_API_KEY` | no locally, yes in production | sends verification/password-reset email |
| `RESEND_FROM_EMAIL` | no | overrides the default `onboarding@resend.dev` sender |
