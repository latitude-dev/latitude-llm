import { updateOrganizationUseCase } from "@domain/organizations"
import { organizationSettingsSchema } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { OrganizationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect } from "effect"
import { jsonBody, jsonResponse, OrgParamsSchema, openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const SettingsSchema = z
  .object({
    keepMonitoring: z.boolean().optional().openapi({
      description:
        "Organization-wide default for post-resolution monitoring behavior. When true, issue-linked evaluations stay active after resolution to detect regressions.",
    }),
  })
  .openapi("OrganizationSettings")

const ResponseSchema = z
  .object({
    settings: SettingsSchema.nullable(),
  })
  .openapi("OrganizationSettingsResponse")

const UpdateRequestSchema = z
  .object({
    keepMonitoring: z.boolean().optional().openapi({
      description:
        "Organization-wide default for post-resolution monitoring behavior. When true, issue-linked evaluations stay active after resolution.",
    }),
  })
  .openapi("UpdateOrganizationSettingsBody")

const getSettingsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Organization Settings"],
  summary: "Get organization settings",
  description: "Returns the reliability settings for the organization.",
  security: PROTECTED_SECURITY,
  request: { params: OrgParamsSchema },
  responses: {
    200: jsonResponse(ResponseSchema, "Organization settings"),
    401: { description: "Unauthorized" },
  },
})

const updateSettingsRoute = createRoute({
  method: "patch",
  path: "/",
  tags: ["Organization Settings"],
  summary: "Update organization settings",
  description: "Updates the reliability settings for the organization. Only provided fields are changed.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgParamsSchema,
    body: jsonBody(UpdateRequestSchema),
  },
  responses: openApiResponses({ status: 200, schema: ResponseSchema, description: "Updated organization settings" }),
})

export const createOrganizationSettingsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()

  app.openapi(getSettingsRoute, async (c) => {
    const settings = c.var.organization.settings ?? null
    return c.json({ settings }, 200)
  })

  app.openapi(updateSettingsRoute, async (c) => {
    const body = c.req.valid("json")
    const settings = organizationSettingsSchema.parse(body)

    const updated = await Effect.runPromise(
      updateOrganizationUseCase({ settings }).pipe(
        withPostgres(OrganizationRepositoryLive, c.var.postgresClient, c.var.organization.id),
      ),
    )

    return c.json({ settings: updated.settings ?? null }, 200)
  })

  return app
}
