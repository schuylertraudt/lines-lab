import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fullSchema, type Db } from "@/db";

/** Fresh in-process Postgres with all committed migrations applied. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema: fullSchema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db: db as unknown as Db, close: () => client.close() };
}
