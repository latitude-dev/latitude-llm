import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import type { RedisClient } from "@platform/cache-redis"
import { checkRedisHealth } from "@platform/cache-redis"
import type { AppEnv } from "../types.ts"

const redisHealthSchema = z
  .object({
    status: z.string(),
    ping: z.enum(["ok", "error", "skipped"]),
    error: z.string().optional(),
  })
  .openapi("RedisHealth")

const HealthResponseSchema = z
  .object({
    service: z.literal("api"),
    status: z.enum(["ok", "degraded"]),
    redis: redisHealthSchema,
  })
  .openapi("HealthResponse")

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "Service is healthy",
    },
    503: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "Service unhealthy (e.g. Redis unreachable)",
    },
  },
})

export const registerHealthRoute = ({ app, redis }: { app: OpenAPIHono<AppEnv>; redis: RedisClient }) => {
  app.openapi(healthRoute, async (c) => {
    const redisReport = await checkRedisHealth(redis)
    const redisOk = redisReport.ping === "ok"
    const overallOk = redisOk
    const body = {
      service: "api" as const,
      status: overallOk ? ("ok" as const) : ("degraded" as const),
      redis: redisReport,
    }
    return c.json(body, overallOk ? 200 : 503)
  })
}
