import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
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

const readOptionalNumberEnv = (name: string): number | undefined => {
  const value = process.env[name];

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a number`);
  }

  return parsed;
};

export const resolveDatabaseUrl = (databaseUrl?: string): string => {
  if (databaseUrl) {
    return databaseUrl;
  }

  const fromEnv = process.env.DATABASE_URL;

  if (!fromEnv) {
    throw new Error("DATABASE_URL is required");
  }

  return fromEnv;
};

export const createPostgresPool = (config: PostgresConfig = {}): Pool => {
  const poolConfig: PoolConfig = {
    connectionString: resolveDatabaseUrl(config.databaseUrl),
    max: config.maxConnections ?? readOptionalNumberEnv("PG_POOL_MAX"),
    idleTimeoutMillis: config.idleTimeoutMs ?? readOptionalNumberEnv("PG_IDLE_TIMEOUT_MS"),
    connectionTimeoutMillis:
      config.connectionTimeoutMs ?? readOptionalNumberEnv("PG_CONNECT_TIMEOUT_MS"),
  };

  return new Pool(poolConfig);
};

export const createPostgresClient = (config: PostgresConfig = {}): PostgresClient => {
  const pool = createPostgresPool(config);
  const db = drizzle(pool, { schema });

  return { db, pool };
};

export const closePostgres = async (pool: Pool): Promise<void> => {
  await pool.end();
};
