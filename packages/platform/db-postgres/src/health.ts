import type { Pool } from "pg";

export interface PostgresHealth {
  readonly ok: boolean;
  readonly latencyMs: number;
}

export const healthcheckPostgres = async (pool: Pool): Promise<PostgresHealth> => {
  const start = Date.now();
  await pool.query("select 1");
  const latencyMs = Date.now() - start;

  return { ok: true, latencyMs };
};
