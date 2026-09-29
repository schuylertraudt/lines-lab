import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import * as views from "./views";

export const fullSchema = { ...schema, ...views };
export type FullSchema = typeof fullSchema;

/** Driver-agnostic handle: postgres-js in the app, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, FullSchema>;

export { schema, views };
