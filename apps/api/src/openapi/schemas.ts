import { z } from "@hono/zod-openapi"

const ErrorSchema = z
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

/** Single error response entry for OpenAPI spec. */
export const errorResponse = (description?: string) => ({
  content: { "application/json": { schema: ErrorSchema } },
  description: description ?? "Error",
})

/** Single JSON success response entry for OpenAPI spec. */
export const jsonResponse = (schema: z.ZodType, description: string) => ({
  content: { "application/json": { schema } },
  description,
})

/**
 * Wraps a Zod schema into the OpenAPI JSON body shape that `createRoute` expects.
 * Generic to preserve the concrete schema type for Hono's inference.
 */
export const jsonBody = <T extends z.ZodType>(schema: T) =>
  ({ content: { "application/json": { schema } }, required: true }) as const

/**
 * Standard OpenAPI responses for protected endpoints.
 * Includes the success response + 400/401/404 error responses by default.
 * Extra error codes can be added via `extraErrors`.
 */
export const openApiResponses = ({
  status,
  schema,
  description,
  extraErrors,
}: {
  status: 200 | 201
  schema: z.ZodType
  description: string
  extraErrors?: Record<number, { description?: string }>
}) => {
  const responses: Record<number, { content?: Record<string, { schema: z.ZodType }>; description: string }> = {
    [status]: jsonResponse(schema, description),
    400: errorResponse("Validation error"),
    401: errorResponse("Unauthorized"),
    404: errorResponse("Not found"),
  }

  if (extraErrors) {
    for (const [code, config] of Object.entries(extraErrors)) {
      responses[Number(code)] = errorResponse(config.description)
    }
  }

  return responses
}

/**
 * Standard OpenAPI responses for 204 (no body) endpoints.
 */
export const openApiNoContentResponses = ({ description }: { description: string }) => ({
  204: { description },
  401: errorResponse("Unauthorized"),
  404: errorResponse("Not found"),
})
