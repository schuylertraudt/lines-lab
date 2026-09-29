import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { views, type Db } from "@/db";
import { createTestDb } from "./helpers/db";
import { addGame, addSlate, addSpread, addTeams, seedLeague } from "./helpers/fixtures";

const { vTeamGame } = views;

let db: Db;
let close: () => Promise<void>;
let slateId: number;
let t: Awaited<ReturnType<typeof addTeams>>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const { league, season } = await seedLeague(db);
  slateId = (await addSlate(db, season.id, 3)).id;
  t = await addTeams(db, league.id, ["Home", "Away", "Fav", "Dog", "PushH", "PushA", "NeutH", "NeutA", "NoLineH", "NoLineA", "LiveH", "LiveA"]);
});
afterAll(() => close?.());

async function row(gameId: number, teamId: number) {
  const [r] = await db
    .select()
    .from(vTeamGame)
    .where(and(eq(vTeamGame.gameId, gameId), eq(vTeamGame.teamId, teamId)));
  return r!;
}

describe("v_team_game ATS", () => {
  it("home favourite covers", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.Home!.id, awayTeamId: t.Away!.id, score: [28, 14] });
    await addSpread(db, g.id, "bookA", -7);

    const home = await row(g.id, t.Home!.id);
    expect(home).toMatchObject({ isHome: true, oppId: t.Away!.id, teamPts: 28, oppPts: 14, teamSpread: -7, atsMargin: 7, result: "cover", slateOrdinal: 3 });
    const away = await row(g.id, t.Away!.id);
    expect(away).toMatchObject({ isHome: false, teamSpread: 7, atsMargin: -7, result: "loss" });
  });

  it("away underdog covers while losing outright", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.Fav!.id, awayTeamId: t.Dog!.id, score: [24, 20] });
    await addSpread(db, g.id, "bookA", -10);

    expect(await row(g.id, t.Dog!.id)).toMatchObject({ teamSpread: 10, atsMargin: 6, result: "cover" });
    expect(await row(g.id, t.Fav!.id)).toMatchObject({ teamSpread: -10, atsMargin: -6, result: "loss" });
  });

  it("push when the margin equals the spread", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.PushH!.id, awayTeamId: t.PushA!.id, score: [24, 21] });
    await addSpread(db, g.id, "bookA", -3);

    expect(await row(g.id, t.PushH!.id)).toMatchObject({ atsMargin: 0, result: "push" });
    expect(await row(g.id, t.PushA!.id)).toMatchObject({ atsMargin: 0, result: "push" });
  });

  it("neutral site uses the designated home side's line", async () => {
    // Designated home team is a 2.5-point underdog at a neutral venue and loses by 1.
    const g = await addGame(db, { slateId, homeTeamId: t.NeutH!.id, awayTeamId: t.NeutA!.id, neutralSite: true, score: [20, 21] });
    await addSpread(db, g.id, "bookA", 2.5);

    expect(await row(g.id, t.NeutH!.id)).toMatchObject({ neutralSite: true, teamSpread: 2.5, atsMargin: 1.5, result: "cover" });
    expect(await row(g.id, t.NeutA!.id)).toMatchObject({ neutralSite: true, teamSpread: -2.5, atsMargin: -1.5, result: "loss" });
  });

  it("no line → no ATS result, book_count 0", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.NoLineH!.id, awayTeamId: t.NoLineA!.id, score: [10, 3] });
    expect(await row(g.id, t.NoLineH!.id)).toMatchObject({ teamPts: 10, teamSpread: null, atsMargin: null, result: null, bookCount: 0 });
  });

  it("non-final game → no scores, no ATS result", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.LiveH!.id, awayTeamId: t.LiveA!.id });
    await addSpread(db, g.id, "bookA", -1);
    expect(await row(g.id, t.LiveH!.id)).toMatchObject({ status: "scheduled", teamPts: null, teamSpread: -1, atsMargin: null, result: null });
  });
});
