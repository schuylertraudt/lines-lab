# lines-lab

Sport-agnostic betting analytics. Phase 1: college football ATS tracking by user-defined tiers.

## Architecture map

```
drizzle/                     committed migrations (source of truth for DDL)
  0000_core.sql              tables (generated from src/db/schema.ts)
  0001_views_and_invariants  hand-written: append-only trigger, f_consensus_line, views
src/db/schema.ts             Drizzle table definitions
src/db/views.ts              typed read-only handles for the SQL views (.existing())
src/db/index.ts              Db type (driver-agnostic), schema exports
src/db/client.ts             getDb(): postgres-js client (Neon-compatible, prepare:false)
src/domain/markets.ts        market registry + value-column semantics
src/providers/               (step 2) provider adapters -> DTOs only
src/ingest/                  (step 2) DTO -> DB: alias resolution, upserts, flags
src/jobs/                    (step 2) idempotent jobs, each writes job_runs
src/app/                     Next.js App Router UI (step 4)
scripts/migrate.ts           applies drizzle/ to DATABASE_URL
tests/                       Vitest; runs against in-process Postgres (PGlite)
```

Data flow: provider adapter -> DTO (Zod-validated at the boundary) -> ingest service
(resolve aliases, upsert, append snapshots, raise validation_flags) -> tables ->
SQL views -> UI/export.

## Schema invariants

1. **No sport-specific columns in core tables.** Sport differences live in rows
   (`sports`, `leagues`, `slates.kind`) and in adapters. A column only meaningful for
   one sport is a design error.
2. **`line_snapshots` is append-only.** A `BEFORE UPDATE` trigger raises. A changed
   line is a new row. DELETE is permitted (cascade from `games`, manual cleanup) but
   never used to "edit" a line.
3. **Derived metrics live in views, not stored columns.** Consensus, ATS margin,
   cover/push/loss, tier-at-slate are computed in SQL views. Do not duplicate the math
   in TypeScript; query the views.
4. **Membership history is insert-only.** A tier change inserts a new
   `grouping_members` row with a later `effective_from_slate_id`. NULL effective slate
   = season start. Resolution = greatest effective slate ordinal <= game slate ordinal.
5. **Closed vocabularies are CHECK-constrained text** (`slates.kind`, `games.status`,
   `line_snapshots.snapshot_kind`, `job_runs.status`). **Open vocabularies are
   unconstrained text validated in code** (`market`, `provider_key`, `book`).
6. `games.provider_refs` (`{provider_key: provider_game_id}`) is the ingest idempotency
   key; GIN-indexed.

Any change that violates an invariant must update this file with the reason.

### Deliberate deviations from the original spec

- `grouping_members` has `id` and a denormalised `grouping_id`, pinned to the level's
  grouping by a composite FK `(grouping_level_id, grouping_id)`. Reason: enables
  `unique(grouping_id, team_id, coalesce(effective_from_slate_id,0))` so a team cannot
  hold two levels in one grouping at the same effective slate.
- `grouping_members.effective_from_slate_id` is nullable (= season start) so the seed
  can create tiers before slates are backfilled.
- `validation_flags.created_at` added for ordering.
- `slates` unique on `(season_id, ordinal)`.

## Views

| View / function | Meaning |
|---|---|
| `f_consensus_line(kinds text[] default null)` | per game+market: mean of each book's latest non-empty snapshot (by `captured_at`, tie `id`), `book_count`, sorted `books`. Filter by `snapshot_kind` e.g. `array['close']`. Prices are not averaged. |
| `v_consensus_line` | `f_consensus_line(NULL)` |
| `v_team_game` | one row per team per game. `team_spread` from team perspective (home: `home_value`, away: `away_value`, fallback `-home_value`). `ats_margin = (team_pts - opp_pts) + team_spread`. `result` cover/push/loss, NULL unless game is final and a spread exists. Scores NULL unless `status='final'`. Neutral site: math uses the designated home side. |
| `v_grouping_ats` | `v_team_game` x groupings of that season, level resolved at the game's slate. Only grouped teams appear. BYE = grouped team with no row for a slate (resolved in UI/validation). |

## Markets

`src/domain/markets.ts` defines accepted markets and what `home_value`/`away_value`/
`price_*` mean for each. **Adding a market:** add a registry entry, map it in each
adapter's `fetchLines`, and (if it needs one) add a view. No migration.

## How to add a provider (step 2 fills in details)

1. `src/providers/<key>/` implementing `Provider` with an explicit `capabilities` list.
2. Zod schemas for every response; adapters return DTOs only, never touch the DB.
3. Aliases: provider team names map via `team_aliases(provider_key, alias)`.
4. Register in the provider registry.

## How to add a sport

1. Insert `sports` + `leagues` rows (and `conferences` if applicable).
2. Pick a slate mapping: weekly -> `kind='week'`, daily -> `kind='date'`, playoffs ->
   `kind='round'`; `ordinal` must be monotonically increasing within a season.
3. Adapter that lists the sport in `sports` and implements the needed capabilities.

## Reserved for later phases (do not create yet)

- `bets` (user wagers: game, market, side, line, price, stake, result)
- `models` / `predictions` (model versions; per-game predicted line/prob)
- `bankroll` (ledger of deposits/withdrawals/settlements)

These must reference `games`/`line_snapshots` and follow the same invariants.

## Env vars

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres URL (Neon pooled in prod) |
| `CFBD_API_KEY` | (step 2) CollegeFootballData.com |
| `CRON_SECRET` | (step 2/5) bearer for `/api/jobs/[job]` |
| `ALLOWED_EMAILS`, `AUTH_SECRET`, email provider vars | (step 4) Auth.js magic link allowlist |

## Commands

```
pnpm install
pnpm db:generate            # after editing src/db/schema.ts -> new drizzle/ migration
pnpm drizzle-kit generate --custom --name <x>   # hand-written SQL (views, triggers)
pnpm db:migrate             # apply to DATABASE_URL
pnpm test                   # vitest (PGlite, no external DB needed)
pnpm typecheck
pnpm build
```

Notes: avoid `db.execute` in app code — its result shape differs between postgres-js
and PGlite. Use the query builder or typed view handles. When a view changes, add a new
custom migration with `CREATE OR REPLACE VIEW` (or drop/create) and update
`src/db/views.ts`.
