/**
 * Core schema. Sport-agnostic by construction: no table may carry a column that
 * only makes sense for one sport. See CLAUDE.md "Schema invariants".
 *
 * Closed vocabularies (status, kinds) are text + CHECK so the DB rejects junk.
 * Open vocabularies (market, provider_key, book) are plain text validated in
 * code (src/domain/*), so adding a market or provider needs no migration.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const line = (name: string) => numeric(name, { precision: 7, scale: 2, mode: "number" });

export const SLATE_KINDS = ["week", "date", "round"] as const;
export const GAME_STATUSES = ["scheduled", "final", "canceled", "postponed"] as const;
export const SNAPSHOT_KINDS = ["open", "close", "intraday", "unknown"] as const;
export const JOB_STATUSES = ["running", "succeeded", "failed"] as const;

const inList = (col: string, values: readonly string[]) =>
  sql.raw(`${col} in (${values.map((v) => `'${v}'`).join(", ")})`);

// ---------------------------------------------------------------- reference

export const sports = pgTable("sports", {
  id: id(),
  key: text().notNull().unique(),
  name: text().notNull(),
});

export const leagues = pgTable(
  "leagues",
  {
    id: id(),
    sportId: integer("sport_id").notNull().references(() => sports.id),
    key: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("leagues_sport_key_uq").on(t.sportId, t.key)],
);

export const conferences = pgTable(
  "conferences",
  {
    id: id(),
    leagueId: integer("league_id").notNull().references(() => leagues.id),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("conferences_league_name_uq").on(t.leagueId, t.name)],
);

export const seasons = pgTable(
  "seasons",
  {
    id: id(),
    leagueId: integer("league_id").notNull().references(() => leagues.id),
    year: integer().notNull(),
    label: text().notNull(),
  },
  (t) => [uniqueIndex("seasons_league_year_uq").on(t.leagueId, t.year)],
);

/** A slate is the unit a sport's schedule is bucketed into: week, date or round. */
export const slates = pgTable(
  "slates",
  {
    id: id(),
    seasonId: integer("season_id").notNull().references(() => seasons.id),
    label: text().notNull(),
    kind: text().notNull().$type<(typeof SLATE_KINDS)[number]>(),
    ordinal: integer().notNull(),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
  },
  (t) => [
    uniqueIndex("slates_season_ordinal_uq").on(t.seasonId, t.ordinal),
    check("slates_kind_ck", inList("kind", SLATE_KINDS)),
    check("slates_range_ck", sql`ends_at >= starts_at`),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: id(),
    leagueId: integer("league_id").notNull().references(() => leagues.id),
    name: text().notNull(),
    shortName: text("short_name"),
    conferenceId: integer("conference_id").references(() => conferences.id),
  },
  (t) => [uniqueIndex("teams_league_name_uq").on(t.leagueId, t.name)],
);

export const teamAliases = pgTable(
  "team_aliases",
  {
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    alias: text().notNull(),
  },
  (t) => [
    uniqueIndex("team_aliases_provider_alias_uq").on(t.providerKey, t.alias),
    index("team_aliases_team_idx").on(t.teamId),
  ],
);

// ---------------------------------------------------------------- games

export const games = pgTable(
  "games",
  {
    id: id(),
    slateId: integer("slate_id").notNull().references(() => slates.id),
    homeTeamId: integer("home_team_id").notNull().references(() => teams.id),
    awayTeamId: integer("away_team_id").notNull().references(() => teams.id),
    startAt: tstz("start_at").notNull(),
    neutralSite: boolean("neutral_site").notNull().default(false),
    status: text().notNull().default("scheduled").$type<(typeof GAME_STATUSES)[number]>(),
    /** { [provider_key]: provider's game id } — the idempotency key for ingest. */
    providerRefs: jsonb("provider_refs").notNull().default({}).$type<Record<string, string>>(),
  },
  (t) => [
    check("games_status_ck", inList("status", GAME_STATUSES)),
    check("games_distinct_teams_ck", sql`home_team_id <> away_team_id`),
    index("games_slate_idx").on(t.slateId),
    index("games_provider_refs_gin").using("gin", t.providerRefs),
  ],
);

export const gameResults = pgTable("game_results", {
  gameId: integer("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  finalAt: tstz("final_at"),
  source: text().notNull(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

/**
 * Append-only. A trigger (see migration 0001) rejects UPDATE. Market value
 * semantics live in src/domain/markets.ts.
 */
export const lineSnapshots = pgTable(
  "line_snapshots",
  {
    id: id(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    book: text().notNull(),
    market: text().notNull(),
    homeValue: line("home_value"),
    awayValue: line("away_value"),
    priceHome: integer("price_home"),
    priceAway: integer("price_away"),
    capturedAt: tstz("captured_at").notNull().defaultNow(),
    snapshotKind: text("snapshot_kind")
      .notNull()
      .default("unknown")
      .$type<(typeof SNAPSHOT_KINDS)[number]>(),
  },
  (t) => [
    check("line_snapshots_kind_ck", inList("snapshot_kind", SNAPSHOT_KINDS)),
    index("line_snapshots_latest_idx").on(t.gameId, t.market, t.book, t.capturedAt),
  ],
);

// ---------------------------------------------------------------- groupings

export const groupings = pgTable(
  "groupings",
  {
    id: id(),
    seasonId: integer("season_id").notNull().references(() => seasons.id),
    name: text().notNull(),
    description: text(),
  },
  (t) => [uniqueIndex("groupings_season_name_uq").on(t.seasonId, t.name)],
);

export const groupingLevels = pgTable(
  "grouping_levels",
  {
    id: id(),
    groupingId: integer("grouping_id")
      .notNull()
      .references(() => groupings.id, { onDelete: "cascade" }),
    rank: integer().notNull(),
    label: text().notNull(),
    color: text().notNull(),
  },
  (t) => [
    uniqueIndex("grouping_levels_grouping_rank_uq").on(t.groupingId, t.rank),
    // Target for the composite FK from grouping_members.
    unique("grouping_levels_id_grouping_uq").on(t.id, t.groupingId),
  ],
);

/**
 * Membership history. A tier change inserts a new row with a later
 * effective_from_slate_id; rows are never rewritten. NULL effective slate =
 * from the start of the season. grouping_id is denormalised (and pinned to the
 * level's grouping by a composite FK) so one team has at most one membership
 * per grouping per effective slate.
 */
export const groupingMembers = pgTable(
  "grouping_members",
  {
    id: id(),
    groupingId: integer("grouping_id").notNull(),
    groupingLevelId: integer("grouping_level_id").notNull(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    effectiveFromSlateId: integer("effective_from_slate_id").references(() => slates.id),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "grouping_members_level_fk",
      columns: [t.groupingLevelId, t.groupingId],
      foreignColumns: [groupingLevels.id, groupingLevels.groupingId],
    }).onDelete("cascade"),
    uniqueIndex("grouping_members_effective_uq")
      .on(t.groupingId, t.teamId, sql`coalesce(effective_from_slate_id, 0)`),
  ],
);

// ---------------------------------------------------------------- ops

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    job: text().notNull(),
    params: jsonb().notNull().default({}).$type<Record<string, unknown>>(),
    startedAt: tstz("started_at").notNull().defaultNow(),
    finishedAt: tstz("finished_at"),
    status: text().notNull().default("running").$type<(typeof JOB_STATUSES)[number]>(),
    summary: jsonb().$type<Record<string, unknown>>(),
    error: text(),
  },
  (t) => [
    check("job_runs_status_ck", inList("status", JOB_STATUSES)),
    index("job_runs_started_idx").on(t.startedAt),
  ],
);

export const validationFlags = pgTable(
  "validation_flags",
  {
    id: id(),
    jobRunId: integer("job_run_id").references(() => jobRuns.id, { onDelete: "set null" }),
    entity: text().notNull(),
    entityId: text("entity_id").notNull(),
    code: text().notNull(),
    message: text().notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    resolvedAt: tstz("resolved_at"),
  },
  (t) => [
    index("validation_flags_open_idx")
      .on(t.code, t.entity, t.entityId)
      .where(sql`resolved_at is null`),
  ],
);
