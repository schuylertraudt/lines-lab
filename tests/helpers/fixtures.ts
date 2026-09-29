import { schema, type Db } from "@/db";

const { sports, leagues, seasons, slates, teams, games, gameResults, lineSnapshots } = schema;

export async function seedLeague(db: Db, year = 2026) {
  const [sport] = await db.insert(sports).values({ key: "cfb", name: "College Football" }).returning();
  const [league] = await db
    .insert(leagues)
    .values({ sportId: sport!.id, key: "fbs", name: "FBS" })
    .returning();
  const [season] = await db
    .insert(seasons)
    .values({ leagueId: league!.id, year, label: String(year) })
    .returning();
  return { sport: sport!, league: league!, season: season! };
}

export async function addSlate(db: Db, seasonId: number, ordinal: number) {
  const startsAt = new Date(Date.UTC(2026, 7, 24 + ordinal * 7));
  const [row] = await db
    .insert(slates)
    .values({
      seasonId,
      ordinal,
      kind: "week",
      label: `Week ${ordinal}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 6 * 86_400_000),
    })
    .returning();
  return row!;
}

export async function addTeams(db: Db, leagueId: number, names: string[]) {
  const rows = await db
    .insert(teams)
    .values(names.map((name) => ({ leagueId, name })))
    .returning();
  return Object.fromEntries(rows.map((r) => [r.name, r])) as Record<string, (typeof rows)[number]>;
}

export async function addGame(
  db: Db,
  opts: {
    slateId: number;
    homeTeamId: number;
    awayTeamId: number;
    neutralSite?: boolean;
    score?: [home: number, away: number];
  },
) {
  const [game] = await db
    .insert(games)
    .values({
      slateId: opts.slateId,
      homeTeamId: opts.homeTeamId,
      awayTeamId: opts.awayTeamId,
      startAt: new Date("2026-09-12T19:00:00Z"),
      neutralSite: opts.neutralSite ?? false,
      status: opts.score ? "final" : "scheduled",
    })
    .returning();
  if (opts.score) {
    await db.insert(gameResults).values({
      gameId: game!.id,
      homeScore: opts.score[0],
      awayScore: opts.score[1],
      source: "test",
    });
  }
  return game!;
}

export async function addSpread(
  db: Db,
  gameId: number,
  book: string,
  homeValue: number,
  capturedAt = new Date("2026-09-10T12:00:00Z"),
) {
  await db.insert(lineSnapshots).values({
    gameId,
    providerKey: "test",
    book,
    market: "spread",
    homeValue,
    awayValue: -homeValue,
    capturedAt,
  });
}
