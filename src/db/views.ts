/**
 * Typed handles for the SQL views defined in drizzle/0001_views_and_invariants.sql.
 * `.existing()` means drizzle-kit never generates DDL for them; the SQL file is
 * the source of truth. Keep these column lists in sync with it.
 */
import {
  boolean,
  integer,
  numeric,
  pgView,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const num = (name: string) => numeric(name, { mode: "number" });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const vConsensusLine = pgView("v_consensus_line", {
  gameId: integer("game_id").notNull(),
  market: text().notNull(),
  homeValue: num("home_value"),
  awayValue: num("away_value"),
  bookCount: integer("book_count").notNull(),
  books: text().array().notNull(),
  latestCapturedAt: tstz("latest_captured_at").notNull(),
}).existing();

const teamGameColumns = {
  gameId: integer("game_id").notNull(),
  slateId: integer("slate_id").notNull(),
  seasonId: integer("season_id").notNull(),
  slateOrdinal: integer("slate_ordinal").notNull(),
  slateLabel: text("slate_label").notNull(),
  startAt: tstz("start_at").notNull(),
  neutralSite: boolean("neutral_site").notNull(),
  status: text().notNull(),
  teamId: integer("team_id").notNull(),
  oppId: integer("opp_id").notNull(),
  isHome: boolean("is_home").notNull(),
  teamPts: integer("team_pts"),
  oppPts: integer("opp_pts"),
  teamSpread: num("team_spread"),
  bookCount: integer("book_count").notNull(),
  atsMargin: num("ats_margin"),
  result: text().$type<"cover" | "push" | "loss">(),
};

export const vTeamGame = pgView("v_team_game", teamGameColumns).existing();

export const vGroupingAts = pgView("v_grouping_ats", {
  groupingId: integer("grouping_id").notNull(),
  groupingLevelId: integer("grouping_level_id").notNull(),
  levelRank: integer("level_rank").notNull(),
  levelLabel: text("level_label").notNull(),
  levelColor: text("level_color").notNull(),
  ...teamGameColumns,
}).existing();
