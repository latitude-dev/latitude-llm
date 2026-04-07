import type { RedisClient } from "@platform/cache-redis"
import { checkRedisHealth } from "@platform/cache-redis"
import type { Hono } from "hono"
import type { IngestEnv } from "../types.ts"

interface HealthRouteContext {
  app: Hono<IngestEnv>
  redis: RedisClient
}

export const registerHealthRoute = (context: HealthRouteContext) => {
  context.app.get("/health", async (c) => {
    const redisReport = await checkRedisHealth(context.redis)
    const redisOk = redisReport.ping === "ok"
    return c.json(
      {
        service: "ingest" as const,
        status: redisOk ? ("ok" as const) : ("degraded" as const),
        redis: redisReport,
      },
      redisOk ? 200 : 503,
    )
  })
}
