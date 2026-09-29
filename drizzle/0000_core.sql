CREATE TABLE "conferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"league_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_results" (
	"game_id" integer PRIMARY KEY NOT NULL,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"final_at" timestamp with time zone,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slate_id" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"neutral_site" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"provider_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "games_status_ck" CHECK (status in ('scheduled', 'final', 'canceled', 'postponed')),
	CONSTRAINT "games_distinct_teams_ck" CHECK (home_team_id <> away_team_id)
);
--> statement-breakpoint
CREATE TABLE "grouping_levels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grouping_levels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"grouping_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	CONSTRAINT "grouping_levels_id_grouping_uq" UNIQUE("id","grouping_id")
);
--> statement-breakpoint
CREATE TABLE "grouping_members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "grouping_members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"grouping_id" integer NOT NULL,
	"grouping_level_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"effective_from_slate_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groupings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "groupings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"summary" jsonb,
	"error" text,
	CONSTRAINT "job_runs_status_ck" CHECK (status in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leagues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sport_id" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_snapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "line_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" integer NOT NULL,
	"provider_key" text NOT NULL,
	"book" text NOT NULL,
	"market" text NOT NULL,
	"home_value" numeric(7, 2),
	"away_value" numeric(7, 2),
	"price_home" integer,
	"price_away" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot_kind" text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "line_snapshots_kind_ck" CHECK (snapshot_kind in ('open', 'close', 'intraday', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"league_id" integer NOT NULL,
	"year" integer NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "slates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"season_id" integer NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"ordinal" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "slates_kind_ck" CHECK (kind in ('week', 'date', 'round')),
	CONSTRAINT "slates_range_ck" CHECK (ends_at >= starts_at)
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "sports_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "team_aliases" (
	"team_id" integer NOT NULL,
	"provider_key" text NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "teams_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"league_id" integer NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"conference_id" integer
);
--> statement-breakpoint
CREATE TABLE "validation_flags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "validation_flags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_run_id" integer,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conferences" ADD CONSTRAINT "conferences_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_slate_id_slates_id_fk" FOREIGN KEY ("slate_id") REFERENCES "public"."slates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_levels" ADD CONSTRAINT "grouping_levels_grouping_id_groupings_id_fk" FOREIGN KEY ("grouping_id") REFERENCES "public"."groupings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_members" ADD CONSTRAINT "grouping_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_members" ADD CONSTRAINT "grouping_members_effective_from_slate_id_slates_id_fk" FOREIGN KEY ("effective_from_slate_id") REFERENCES "public"."slates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grouping_members" ADD CONSTRAINT "grouping_members_level_fk" FOREIGN KEY ("grouping_level_id","grouping_id") REFERENCES "public"."grouping_levels"("id","grouping_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groupings" ADD CONSTRAINT "groupings_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_snapshots" ADD CONSTRAINT "line_snapshots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slates" ADD CONSTRAINT "slates_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_aliases" ADD CONSTRAINT "team_aliases_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_conference_id_conferences_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_flags" ADD CONSTRAINT "validation_flags_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conferences_league_name_uq" ON "conferences" USING btree ("league_id","name");--> statement-breakpoint
CREATE INDEX "games_slate_idx" ON "games" USING btree ("slate_id");--> statement-breakpoint
CREATE INDEX "games_provider_refs_gin" ON "games" USING gin ("provider_refs");--> statement-breakpoint
CREATE UNIQUE INDEX "grouping_levels_grouping_rank_uq" ON "grouping_levels" USING btree ("grouping_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "grouping_members_effective_uq" ON "grouping_members" USING btree ("grouping_id","team_id",coalesce(effective_from_slate_id, 0));--> statement-breakpoint
CREATE UNIQUE INDEX "groupings_season_name_uq" ON "groupings" USING btree ("season_id","name");--> statement-breakpoint
CREATE INDEX "job_runs_started_idx" ON "job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_sport_key_uq" ON "leagues" USING btree ("sport_id","key");--> statement-breakpoint
CREATE INDEX "line_snapshots_latest_idx" ON "line_snapshots" USING btree ("game_id","market","book","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_league_year_uq" ON "seasons" USING btree ("league_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX "slates_season_ordinal_uq" ON "slates" USING btree ("season_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "team_aliases_provider_alias_uq" ON "team_aliases" USING btree ("provider_key","alias");--> statement-breakpoint
CREATE INDEX "team_aliases_team_idx" ON "team_aliases" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_league_name_uq" ON "teams" USING btree ("league_id","name");--> statement-breakpoint
CREATE INDEX "validation_flags_open_idx" ON "validation_flags" USING btree ("code","entity","entity_id") WHERE resolved_at is null;