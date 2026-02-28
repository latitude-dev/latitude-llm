import {
  type InvalidEnvValueError,
  type MissingEnvValueError,
  parseEnv,
} from "@platform/env";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Effect } from "effect";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index.js";

export type PostgresDb = NodePgDatabase<typeof schema>;

export interface PostgresConfig {
  readonly databaseUrl?: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMs?: number;
  readonly connectionTimeoutMs?: number;
}

export interface PostgresClient {
  readonly pool: Pool;
  readonly db: PostgresDb;
}

export type ReadOptionalNumberEnvError =
  | MissingEnvValueError
  | InvalidEnvValueError;
export type ResolveDatabaseUrlError =
  | MissingEnvValueError
  | InvalidEnvValueError;
export type CreatePostgresPoolError =
  | ReadOptionalNumberEnvError
  | ResolveDatabaseUrlError;
export type CreatePostgresClientError = CreatePostgresPoolError;

const readOptionalNumberEnvEffect = (
  name: string,
): Effect.Effect<number | undefined, ReadOptionalNumberEnvError> => {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    return Effect.succeed(undefined);
  }

  return parseEnv(value, "number");
};

export const resolveDatabaseUrlEffect = (
  databaseUrl?: string,
): Effect.Effect<string, ResolveDatabaseUrlError> => {
  if (databaseUrl !== undefined && databaseUrl.length > 0) {
    return parseEnv(databaseUrl, "string");
  }

  return parseEnv(process.env.DATABASE_URL, "string");
};

export const resolveDatabaseUrl = (databaseUrl?: string): string => {
  return Effect.runSync(resolveDatabaseUrlEffect(databaseUrl));
};

export const createPostgresPoolEffect = (
  config: PostgresConfig = {},
): Effect.Effect<Pool, CreatePostgresPoolError> => {
  return Effect.all({
    connectionString: resolveDatabaseUrlEffect(config.databaseUrl),
    max: config.maxConnections
      ? Effect.succeed(config.maxConnections)
      : readOptionalNumberEnvEffect("PG_POOL_MAX"),
    idleTimeoutMillis: config.idleTimeoutMs
      ? Effect.succeed(config.idleTimeoutMs)
      : readOptionalNumberEnvEffect("PG_IDLE_TIMEOUT_MS"),
    connectionTimeoutMillis: config.connectionTimeoutMs
      ? Effect.succeed(config.connectionTimeoutMs)
      : readOptionalNumberEnvEffect("PG_CONNECT_TIMEOUT_MS"),
  }).pipe(
    Effect.map((poolConfig) => {
      const configWithTypes: PoolConfig = poolConfig;

      return new Pool(configWithTypes);
    }),
  );
};

export const createPostgresPool = (config: PostgresConfig = {}): Pool => {
  return Effect.runSync(createPostgresPoolEffect(config));
};

export const createPostgresClientEffect = (
  config: PostgresConfig = {},
): Effect.Effect<PostgresClient, CreatePostgresClientError> => {
  return createPostgresPoolEffect(config).pipe(
    Effect.map((pool) => {
      const db = drizzle(pool, { schema });

      return { db, pool };
    }),
  );
};

export const createPostgresClient = (
  config: PostgresConfig = {},
): PostgresClient => {
  return Effect.runSync(createPostgresClientEffect(config));
};

export const closePostgres = async (pool: Pool): Promise<void> => {
  await pool.end();
};
