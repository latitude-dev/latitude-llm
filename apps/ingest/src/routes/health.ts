import type { Hono } from "hono"
import type { IngestEnv } from "../types.ts"

interface HealthRouteContext {
  app: Hono<IngestEnv>
}

export const registerHealthRoute = (context: HealthRouteContext) => {
  context.app.get("/health", (c) => {
    return c.json({ service: "ingest", status: "ok" }, 200)
  })
}
