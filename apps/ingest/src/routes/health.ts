import { LatitudeObservabilityTestError } from "@repo/utils"
import type { Hono } from "hono"
import type { IngestEnv } from "../types.ts"

interface HealthRouteContext {
  app: Hono<IngestEnv>
}

export const registerHealthRoute = (context: HealthRouteContext) => {
  context.app.get("/health", (c) => {
    return c.json({ service: "ingest", status: "ok" }, 200)
  })

  context.app.get("/health/observability-test", (c) => {
    return c.json({ service: "ingest", observabilityTest: "armed" as const }, 200)
  })

  context.app.get("/health/observability-test/error", () => {
    throw new LatitudeObservabilityTestError("ingest")
  })
}
