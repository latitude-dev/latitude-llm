import { FILTER_OPERATORS, traceIdSchema } from "@domain/shared"
import { z } from "@hono/zod-openapi"

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error")

// Trace ref + filter sub-schemas are rebuilt here (with the same semantics as
// `@domain/shared.filterConditionSchema` / `filterSetSchema` and
// `@domain/annotations.traceRefSchema`) so each level carries an `.openapi(...)`
// component name. Without explicit names, Fern's TypeScript SDK generator
// inlines anonymous types inside `Record<string, Array<Object>>` underneath a
// discriminated union and emits broken `Item` references that fail typecheck.
// We can't reuse the domain schemas: `.openapi()` returns a new instance, so
// naming a top-level import doesn't propagate down to the un-named filter
// schemas referenced inside the domain's discriminated union — the entire
// chain has to be rebuilt with named instances.

// `FilterConditionSchema` and `FilterSetSchema` aren't exported because nothing
// imports them directly — they exist only as references in the `TraceRefSchema`
// chain so each level emits as a named OpenAPI component.
const FilterConditionSchema = z
  .object({
    op: z.enum(FILTER_OPERATORS),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  })
  .openapi("FilterCondition")

const FilterSetSchema = z.record(z.string(), z.array(FilterConditionSchema)).openapi("FilterSet")

export const TraceRefSchema = z
  .discriminatedUnion("by", [
    z.object({ by: z.literal("id"), id: traceIdSchema }),
    z.object({ by: z.literal("filters"), filters: FilterSetSchema }),
  ])
  .openapi("TraceRef")

// All protected endpoints are already org-scoped via the Bearer API key
// (resolved by `createAuthMiddleware` + `createOrganizationContextMiddleware`),
// so the path schemas carry only resource identifiers — not the organization.

export const IdParamsSchema = z.object({
  id: z.string().openapi({ description: "Resource ID" }),
})

export const ProjectParamsSchema = z.object({
  projectSlug: z.string().openapi({ description: "Project slug (human-readable identifier)" }),
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
  status: 200 | 201 | 202
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
