import type { ClickHouseClient } from "@clickhouse/client"
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import { healthcheckClickhouse } from "@platform/db-clickhouse"
import { healthcheckPostgres, type PostgresClient } from "@platform/db-postgres"
import type { Effect as EffectType } from "effect"
import { Effect } from "effect"

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

const HealthCheckResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

const HealthResponseSchema = z
  .object({
    service: z.literal("api"),
    status: z.enum(["ok", "degraded"]),
    postgres: HealthCheckResultSchema,
    clickhouse: HealthCheckResultSchema,
  })
  .openapi("HealthResponse")

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
  description: "Checks connectivity to Postgres and ClickHouse. Returns 503 if any dependency is degraded.",
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "Service is healthy",
    },
    503: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "Service is degraded",
    },
  },
})

interface HealthRouteContext {
  app: OpenAPIHono
  database: PostgresClient
  clickhouse: ClickHouseClient
}

export const registerHealthRoute = (context: HealthRouteContext) => {
  context.app.openapi(healthRoute, async (c) => {
    const health = await Effect.runPromise(
      Effect.all({
        postgres: withFailure(healthcheckPostgres(context.database.pool)),
        clickhouse: withFailure(healthcheckClickhouse(context.clickhouse)),
      }),
    )

    const ok = health.postgres.ok && health.clickhouse.ok

    const toHealthResult = (result: { ok: boolean; error?: string }) =>
      result.ok ? ({ ok: true } as const) : ({ ok: false, error: (result as { error: string }).error } as const)

    const body = {
      service: "api" as const,
      status: (ok ? "ok" : "degraded") as "ok" | "degraded",
      postgres: toHealthResult(health.postgres),
      clickhouse: toHealthResult(health.clickhouse),
    }

    if (ok) {
      return c.json(body, 200)
    }
    return c.json(body, 503)
  })
}
