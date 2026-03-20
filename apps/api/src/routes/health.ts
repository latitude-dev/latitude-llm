import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi"

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

interface HealthRouteContext {
  app: OpenAPIHono
}

export const registerHealthRoute = (context: HealthRouteContext) => {
  context.app.openapi(healthRoute, (c) => {
    return c.json({ service: "api" as const, status: "ok" as const }, 200)
  })
}
