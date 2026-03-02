import { healthcheckClickhouse } from "@platform/db-clickhouse";
import { healthcheckPostgres } from "@platform/db-postgres";
import type { Effect as EffectType } from "effect";
import { Effect } from "effect";
import type { Hono } from "hono";
import { getClickhouseClient, getPostgresPool } from "../clients.js";

type HealthcheckFailure = {
  readonly ok: false;
  readonly error: string;
};

const withFailure = <TSuccess extends { readonly ok: boolean }>(
  effect: EffectType.Effect<TSuccess, unknown>,
): EffectType.Effect<TSuccess | HealthcheckFailure> => {
  return Effect.match(effect, {
    onFailure: (error) => ({ ok: false, error: String(error) }),
    onSuccess: (value) => value,
  });
};

interface HealthRouteContext {
  app: Hono;
}

export const registerHealthRoute = (context: HealthRouteContext) => {
  context.app.get("/health", async (c) => {
    const health = await Effect.runPromise(
      Effect.all({
        postgres: withFailure(healthcheckPostgres(getPostgresPool())),
        clickhouse: withFailure(healthcheckClickhouse(getClickhouseClient())),
      }),
    );

    const ok = health.postgres.ok && health.clickhouse.ok;

    return c.json(
      {
        service: "ingest",
        status: ok ? "ok" : "degraded",
        postgres: health.postgres,
        clickhouse: health.clickhouse,
      },
      ok ? 200 : 503,
    );
  });
};
