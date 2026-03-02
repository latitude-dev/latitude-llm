import { Effect } from "effect";
import type { Pool } from "pg";

interface PostgresHealth {
  readonly ok: boolean;
  readonly latencyMs: number;
}

export const healthcheckPostgres = (pool: Pool): Effect.Effect<PostgresHealth, unknown> => {
  return Effect.gen(function* () {
    const start = Date.now();
    yield* Effect.tryPromise(() => pool.query("select 1"));
    const latencyMs = Date.now() - start;

    return { ok: true, latencyMs };
  });
};
