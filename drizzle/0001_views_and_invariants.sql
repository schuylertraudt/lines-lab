-- Invariants and derived views. Derived metrics live here, never in stored columns.

-- line_snapshots is append-only: a changed line is a new row.
CREATE FUNCTION line_snapshots_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'line_snapshots is append-only; insert a new snapshot instead of updating id %', OLD.id;
END
$$;
--> statement-breakpoint
CREATE TRIGGER line_snapshots_no_update
  BEFORE UPDATE ON line_snapshots
  FOR EACH ROW EXECUTE FUNCTION line_snapshots_append_only();
--> statement-breakpoint

-- Consensus line per game+market: mean of each book's latest non-empty snapshot.
-- p_snapshot_kinds NULL = all kinds; e.g. ARRAY['close'] for a closing consensus.
-- Prices are deliberately not averaged (American odds are not linear).
CREATE FUNCTION f_consensus_line(p_snapshot_kinds text[] DEFAULT NULL)
RETURNS TABLE (
  game_id integer,
  market text,
  home_value numeric,
  away_value numeric,
  book_count integer,
  books text[],
  latest_captured_at timestamptz
)
LANGUAGE sql STABLE AS $$
  WITH latest AS (
    SELECT DISTINCT ON (s.game_id, s.market, s.book)
      s.game_id, s.market, s.book, s.home_value, s.away_value, s.captured_at
    FROM line_snapshots s
    WHERE (p_snapshot_kinds IS NULL OR s.snapshot_kind = ANY (p_snapshot_kinds))
      AND (s.home_value IS NOT NULL OR s.away_value IS NOT NULL
           OR s.price_home IS NOT NULL OR s.price_away IS NOT NULL)
    ORDER BY s.game_id, s.market, s.book, s.captured_at DESC, s.id DESC
  )
  SELECT
    l.game_id,
    l.market,
    round(avg(l.home_value), 2),
    round(avg(l.away_value), 2),
    count(*)::integer,
    array_agg(l.book ORDER BY l.book),
    max(l.captured_at)
  FROM latest l
  GROUP BY l.game_id, l.market
$$;
--> statement-breakpoint
CREATE VIEW v_consensus_line AS
  SELECT * FROM f_consensus_line(NULL);
--> statement-breakpoint

-- One row per team per game. team_spread is from the team's perspective
-- (negative = favourite). ats_margin = (team_pts - opp_pts) + team_spread.
-- neutral_site does not change the math: "home" is the designated home side,
-- which is also the side provider spreads are quoted against.
CREATE VIEW v_team_game AS
  WITH base AS (
    SELECT
      g.id AS game_id,
      g.slate_id,
      sl.season_id,
      sl.ordinal AS slate_ordinal,
      sl.label AS slate_label,
      g.start_at,
      g.neutral_site,
      g.status,
      g.home_team_id,
      g.away_team_id,
      CASE WHEN g.status = 'final' THEN r.home_score END AS home_score,
      CASE WHEN g.status = 'final' THEN r.away_score END AS away_score,
      c.home_value AS spread_home,
      coalesce(c.away_value, -c.home_value) AS spread_away,
      coalesce(c.book_count, 0) AS book_count
    FROM games g
    JOIN slates sl ON sl.id = g.slate_id
    LEFT JOIN game_results r ON r.game_id = g.id
    LEFT JOIN v_consensus_line c ON c.game_id = g.id AND c.market = 'spread'
  ),
  sided AS (
    SELECT game_id, slate_id, season_id, slate_ordinal, slate_label, start_at, neutral_site, status,
      home_team_id AS team_id, away_team_id AS opp_id, true AS is_home,
      home_score AS team_pts, away_score AS opp_pts, spread_home AS team_spread, book_count
    FROM base
    UNION ALL
    SELECT game_id, slate_id, season_id, slate_ordinal, slate_label, start_at, neutral_site, status,
      away_team_id, home_team_id, false,
      away_score, home_score, spread_away, book_count
    FROM base
  )
  SELECT
    s.*,
    (s.team_pts - s.opp_pts) + s.team_spread AS ats_margin,
    CASE
      WHEN s.team_pts IS NULL OR s.team_spread IS NULL THEN NULL
      WHEN (s.team_pts - s.opp_pts) + s.team_spread > 0 THEN 'cover'
      WHEN (s.team_pts - s.opp_pts) + s.team_spread = 0 THEN 'push'
      ELSE 'loss'
    END AS result
  FROM sided s;
--> statement-breakpoint

-- v_team_game joined to the grouping level in force at that game's slate:
-- the membership row with the greatest effective slate ordinal <= the game's
-- ordinal (NULL effective slate = season start). One row per grouping.
CREATE VIEW v_grouping_ats AS
  SELECT
    gr.id AS grouping_id,
    gl.id AS grouping_level_id,
    gl.rank AS level_rank,
    gl.label AS level_label,
    gl.color AS level_color,
    tg.*
  FROM v_team_game tg
  JOIN groupings gr ON gr.season_id = tg.season_id
  JOIN LATERAL (
    SELECT gm.grouping_level_id
    FROM grouping_members gm
    LEFT JOIN slates es ON es.id = gm.effective_from_slate_id
    WHERE gm.grouping_id = gr.id
      AND gm.team_id = tg.team_id
      AND (es.ordinal IS NULL OR es.ordinal <= tg.slate_ordinal)
    ORDER BY es.ordinal DESC NULLS LAST, gm.id DESC
    LIMIT 1
  ) m ON true
  JOIN grouping_levels gl ON gl.id = m.grouping_level_id;
