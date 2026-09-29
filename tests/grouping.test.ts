import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { schema, views, type Db } from "@/db";
import { createTestDb } from "./helpers/db";
import { addGame, addSlate, addSpread, addTeams, seedLeague } from "./helpers/fixtures";

const { vGroupingAts } = views;

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close?.());

describe("v_grouping_ats membership resolution", () => {
  it("applies the membership in force at each game's slate", async () => {
    const { league, season } = await seedLeague(db);
    const w1 = await addSlate(db, season.id, 1);
    const w2 = await addSlate(db, season.id, 2);
    const w3 = await addSlate(db, season.id, 3);
    const t = await addTeams(db, league.id, ["Mover", "Opp1", "Opp2", "Opp3", "Ungrouped"]);

    const [grouping] = await db.insert(schema.groupings).values({ seasonId: season.id, name: "Tiers" }).returning();
    const [top, mid] = await db
      .insert(schema.groupingLevels)
      .values([
        { groupingId: grouping!.id, rank: 1, label: "Top", color: "#0a0" },
        { groupingId: grouping!.id, rank: 2, label: "Mid", color: "#aa0" },
      ])
      .returning();

    // Season start: Mid. Promoted to Top effective week 3.
    await db.insert(schema.groupingMembers).values([
      { groupingId: grouping!.id, groupingLevelId: mid!.id, teamId: t.Mover!.id, effectiveFromSlateId: null },
      { groupingId: grouping!.id, groupingLevelId: top!.id, teamId: t.Mover!.id, effectiveFromSlateId: w3.id },
    ]);

    for (const [slate, opp] of [[w1, t.Opp1!], [w2, t.Opp2!], [w3, t.Opp3!]] as const) {
      const g = await addGame(db, { slateId: slate.id, homeTeamId: t.Mover!.id, awayTeamId: opp.id, score: [21, 20] });
      await addSpread(db, g.id, "a", -3);
    }
    await addGame(db, { slateId: w1.id, homeTeamId: t.Ungrouped!.id, awayTeamId: t.Opp3!.id, score: [1, 0] });

    const rows = await db
      .select({ ordinal: vGroupingAts.slateOrdinal, label: vGroupingAts.levelLabel, result: vGroupingAts.result })
      .from(vGroupingAts)
      .where(and(eq(vGroupingAts.groupingId, grouping!.id), eq(vGroupingAts.teamId, t.Mover!.id)))
      .orderBy(asc(vGroupingAts.slateOrdinal));

    expect(rows).toEqual([
      { ordinal: 1, label: "Mid", result: "loss" },
      { ordinal: 2, label: "Mid", result: "loss" },
      { ordinal: 3, label: "Top", result: "loss" },
    ]);

    const all = await db.select().from(vGroupingAts).where(eq(vGroupingAts.groupingId, grouping!.id));
    expect(all.some((r) => r.teamId === t.Ungrouped!.id || r.teamId === t.Opp1!.id)).toBe(false);
  });

  it("rejects a level from another grouping (composite FK)", async () => {
    const [season] = await db.select().from(schema.seasons).limit(1);
    const [team] = await db.select().from(schema.teams).limit(1);
    const [g1, g2] = await db
      .insert(schema.groupings)
      .values([{ seasonId: season!.id, name: "G1" }, { seasonId: season!.id, name: "G2" }])
      .returning();
    const [lvl] = await db
      .insert(schema.groupingLevels)
      .values({ groupingId: g1!.id, rank: 1, label: "x", color: "#000" })
      .returning();
    await expect(
      db.insert(schema.groupingMembers).values({ groupingId: g2!.id, groupingLevelId: lvl!.id, teamId: team!.id }),
    ).rejects.toThrow();
  });
});
