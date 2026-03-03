import type { Hono } from "hono"
import type { getClickhouseClient, getPostgresPool } from "../clients.ts"
import { registerHealthRoute } from "./health.ts"

interface RoutesContext {
  app: Hono
  postgresPool?: ReturnType<typeof getPostgresPool>
  clickhouseClient?: ReturnType<typeof getClickhouseClient>
}

export const registerRoutes = (context: RoutesContext) => {
  registerHealthRoute(context)
  // Additional routes can be registered here
}
