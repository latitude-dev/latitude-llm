import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"
import type { AppEnv } from "../types.ts"

const HealthResponseSchema = z
  .object({
    service: z.literal("api"),
    status: z.literal("ok"),
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
  },
})

export const registerHealthRoute = ({ app }: { app: OpenAPIHono<AppEnv> }) => {
  app.openapi(healthRoute, (c) => {
    return c.json({ service: "api" as const, status: "ok" as const }, 200)
  })
}
