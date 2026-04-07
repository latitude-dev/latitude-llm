import type { RedisClient } from "@platform/cache-redis"
import type { Hono } from "hono"
import type { IngestEnv } from "../types.ts"
import { registerHealthRoute } from "./health.ts"
import { registerTracesRoute } from "./traces.ts"

interface RoutesContext {
  app: Hono<IngestEnv>
  redis: RedisClient
}

export const registerRoutes = (context: RoutesContext) => {
  registerHealthRoute(context)
  registerTracesRoute(context)
}
