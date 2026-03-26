import { z } from "@hono/zod-openapi"

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error")

export const OrgParamsSchema = z.object({
  organizationId: z.string().openapi({ description: "Organization ID" }),
})

export const OrgAndIdParamsSchema = z.object({
  organizationId: z.string().openapi({ description: "Organization ID" }),
  id: z.string().openapi({ description: "Resource ID" }),
})

export const OrgAndProjectParamsSchema = z.object({
  organizationId: z.string().openapi({ description: "Organization ID" }),
  projectId: z.string().openapi({ description: "Project ID" }),
})

/** Security scheme applied to protected endpoints. */
export const PROTECTED_SECURITY = [{ ApiKeyAuth: [] }]
