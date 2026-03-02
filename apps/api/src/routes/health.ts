import type { ClickHouseClient } from "@clickhouse/client"
import { healthcheckClickhouse } from "@platform/db-clickhouse"
import { healthcheckPostgres } from "@platform/db-postgres"
import type { Effect as EffectType } from "effect"
import { Effect } from "effect"
import type { Hono } from "hono"
import type { ApiDatabaseDependencies } from "../db-deps.ts"

type HealthcheckFailure = {
  readonly ok: false
  readonly error: string
}

const withFailure = <TSuccess extends { readonly ok: boolean }>(
  effect: EffectType.Effect<TSuccess, unknown>,
): EffectType.Effect<TSuccess | HealthcheckFailure> => {
  return Effect.match(effect, {
    onFailure: (error) => ({ ok: false, error: String(error) }),
    onSuccess: (value) => value,
  })
}

interface HealthRouteContext {
  app: Hono
  database: ApiDatabaseDependencies
  clickhouse: ClickHouseClient
}

export const registerHealthRoute = (context: HealthRouteContext) => {
  context.app.get("/health", async (c) => {
    const health = await Effect.runPromise(
      Effect.all({
        postgres: withFailure(healthcheckPostgres(context.database.pool)),
        clickhouse: withFailure(healthcheckClickhouse(context.clickhouse)),
      }),
    )

    const ok = health.postgres.ok && health.clickhouse.ok

    return c.json(
      {
        service: "api",
        status: ok ? "ok" : "degraded",
        postgres: health.postgres,
        clickhouse: health.clickhouse,
      },
      ok ? 200 : 503,
    )
  })
}
