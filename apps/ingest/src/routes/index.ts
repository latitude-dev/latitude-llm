import type { Hono } from "hono"
import type { TracePayloadProtection } from "../trace-payload.ts"
import type { IngestEnv } from "../types.ts"
import { registerHealthRoute } from "./health.ts"
import { registerTracesRoute } from "./traces.ts"

interface RoutesContext {
  app: Hono<IngestEnv>
  tracePayloadProtection: TracePayloadProtection
}

export const registerRoutes = (context: RoutesContext) => {
  registerHealthRoute({ app: context.app })
  registerTracesRoute(context)
}
