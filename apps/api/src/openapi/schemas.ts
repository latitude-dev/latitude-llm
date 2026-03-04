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

/** Security scheme applied to protected endpoints. */
export const PROTECTED_SECURITY = [{ ApiKeyAuth: [] }]
