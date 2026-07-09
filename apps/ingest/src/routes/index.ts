import type { Hono } from "hono"
import type { IngestEnv } from "../types.ts"
import { registerElevenlabsWebhookRoute } from "./elevenlabs-webhook.ts"
import { registerHealthRoute } from "./health.ts"
import { registerTracesRoute } from "./traces.ts"

interface RoutesContext {
  app: Hono<IngestEnv>
}

export const registerRoutes = (context: RoutesContext) => {
  registerHealthRoute(context)
  registerTracesRoute(context)
  registerElevenlabsWebhookRoute(context)
}
