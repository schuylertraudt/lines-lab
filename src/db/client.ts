import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fullSchema, type Db } from "./index";

let cached: Db | undefined;

/** Lazily-created app DB. `prepare: false` keeps it compatible with Neon's pooler. */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: 5 });
  cached = drizzle(client, { schema: fullSchema }) as unknown as Db;
  return cached;
}
