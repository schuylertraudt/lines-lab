import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { schema, views, type Db } from "@/db";
import { createTestDb } from "./helpers/db";
import { addGame, addSlate, addSpread, addTeams, seedLeague } from "./helpers/fixtures";

const { vConsensusLine, vTeamGame } = views;

let db: Db;
let close: () => Promise<void>;
let slateId: number;
let t: Awaited<ReturnType<typeof addTeams>>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const { league, season } = await seedLeague(db);
  slateId = (await addSlate(db, season.id, 1)).id;
  t = await addTeams(db, league.id, ["A", "B", "C", "D", "E", "F", "G", "H"]);
});
afterAll(() => close?.());

const d = (iso: string) => new Date(iso);

describe("v_consensus_line", () => {
  it("is the mean across books, with count and sorted book list", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.A!.id, awayTeamId: t.B!.id });
    await addSpread(db, g.id, "draftkings", -3);
    await addSpread(db, g.id, "bovada", -3.5);
    await addSpread(db, g.id, "fanduel", -4);

    const [c] = await db.select().from(vConsensusLine).where(eq(vConsensusLine.gameId, g.id));
    expect(c).toMatchObject({ market: "spread", homeValue: -3.5, awayValue: 3.5, bookCount: 3, books: ["bovada", "draftkings", "fanduel"] });
  });

  it("uses only the latest snapshot per book", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.C!.id, awayTeamId: t.D!.id });
    await addSpread(db, g.id, "draftkings", -7, d("2026-09-08T00:00:00Z"));
    await addSpread(db, g.id, "draftkings", -3, d("2026-09-11T00:00:00Z")); // latest
    await addSpread(db, g.id, "draftkings", -10, d("2026-09-09T00:00:00Z")); // inserted later, captured earlier
    await addSpread(db, g.id, "fanduel", -4, d("2026-09-10T00:00:00Z"));

    const [c] = await db.select().from(vConsensusLine).where(eq(vConsensusLine.gameId, g.id));
    expect(c).toMatchObject({ homeValue: -3.5, bookCount: 2 });
  });

  it("ignores empty snapshots and can be filtered by snapshot_kind", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.E!.id, awayTeamId: t.F!.id });
    await db.insert(schema.lineSnapshots).values([
      { gameId: g.id, providerKey: "test", book: "a", market: "spread", homeValue: -6, awayValue: 6, snapshotKind: "open", capturedAt: d("2026-09-07T00:00:00Z") },
      { gameId: g.id, providerKey: "test", book: "a", market: "spread", homeValue: -2, awayValue: 2, snapshotKind: "close", capturedAt: d("2026-09-12T00:00:00Z") },
      { gameId: g.id, providerKey: "test", book: "b", market: "spread", homeValue: null, awayValue: null, capturedAt: d("2026-09-13T00:00:00Z") },
    ]);

    const [all] = await db.select().from(vConsensusLine).where(eq(vConsensusLine.gameId, g.id));
    expect(all).toMatchObject({ homeValue: -2, bookCount: 1 });

    // PGlite result shape; app code should avoid db.execute (shape differs per driver).
    const opens = (await db.execute(
      sql`select home_value from f_consensus_line(array['open']) where game_id = ${g.id}`,
    )) as unknown as { rows: { home_value: string }[] };
    expect(Number(opens.rows[0]!.home_value)).toBe(-6);
  });

  it("feeds v_team_game with the consensus spread", async () => {
    const g = await addGame(db, { slateId, homeTeamId: t.G!.id, awayTeamId: t.H!.id, score: [30, 27] });
    await addSpread(db, g.id, "x", -2.5);
    await addSpread(db, g.id, "y", -3.5);
    const [r] = await db.select().from(vTeamGame).where(eq(vTeamGame.teamId, t.G!.id));
    expect(r).toMatchObject({ teamSpread: -3, bookCount: 2, atsMargin: 0, result: "push" });
  });
});

describe("line_snapshots invariants", () => {
  it("rejects UPDATE (append-only)", async () => {
    const err = await db
      .update(schema.lineSnapshots)
      .set({ homeValue: 99 })
      .where(sql`true`)
      .then(() => null, (e: Error) => e);
    expect(String((err?.cause as Error | undefined)?.message)).toMatch(/append-only/);
  });
});
