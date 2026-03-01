import { createClickhouseClientEffect } from "@platform/db-clickhouse";
import { createPostgresPool } from "@platform/db-postgres";
import { Effect } from "effect";

export const postgresPool = createPostgresPool();
export const clickhouse = Effect.runSync(createClickhouseClientEffect());
