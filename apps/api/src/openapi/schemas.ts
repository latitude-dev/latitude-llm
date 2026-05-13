import { FILTER_OPERATORS, SESSION_ID_LENGTH, SPAN_ID_LENGTH, TRACE_ID_LENGTH } from "@domain/shared"
import { z } from "@hono/zod-openapi"

// Plain (non-transformed) telemetry-id schemas for use in request / response
// bodies exposed via OpenAPI + MCP. The domain's branded variants
// (`traceIdSchema = z.string().length(...).transform(TraceId)`, etc.) can't be
// serialized to JSON Schema — transforms have no JSON-Schema representation,
// and the MCP SDK fails when registering a tool whose inputSchema contains one.
// We keep the same length validation as the domain schemas but drop the brand
// transform; handlers cast to the branded type at the boundary where needed.
export const traceIdSchema = z.string().length(TRACE_ID_LENGTH).describe("32-character trace identifier.")
export const spanIdSchema = z.string().length(SPAN_ID_LENGTH).describe("16-character span identifier.")
export const sessionIdSchema = z
  .string()
  .max(SESSION_ID_LENGTH)
  .describe(`Session identifier lifted from instrumentation. Up to ${SESSION_ID_LENGTH} characters.`)

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
    op: z
      .enum(FILTER_OPERATORS)
      .describe(
        "Comparison operator applied to the field's value (e.g. `eq`, `neq`, `in`). The full operator list lives in the API reference.",
      ),
    value: z
      .union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])
      .describe("Right-hand value compared against the field. Arrays are required for `in` / `notIn`-style operators."),
  })
  .openapi("FilterCondition")

const FilterSetSchema = z
  .record(z.string(), z.array(FilterConditionSchema))
  .describe(
    "Filter set keyed by field name. Each entry holds an array of conditions ANDed together for that field; field-level groups are also ANDed across the set.",
  )
  .openapi("FilterSet")

export const TraceRefSchema = z
  .discriminatedUnion("by", [
    z.object({
      by: z.literal("id").describe("Match a single trace by its identifier. Pair with `id`."),
      id: traceIdSchema,
    }),
    z.object({
      by: z
        .literal("filters")
        .describe("Match a single trace by a filter set. Pair with `filters`; exactly one trace must match."),
      filters: FilterSetSchema,
    }),
  ])
  .openapi("TraceRef")

/**
 * Plural sibling of {@link TraceRefSchema} for bulk endpoints (export traces,
 * import-from-traces into a dataset, etc). Mirrors `tracesRefSchema` from
 * `@domain/spans` but rebuilt with `.openapi(...)` names — same Fern-generator
 * workaround as `TraceRefSchema` above.
 *
 * @public Public API surface for the API expansion plan; consumed by bulk
 * route definitions in subsequent PRs. Marked `@public` so knip doesn't flag
 * it as unused while it's waiting for its first consumer.
 */
export const TracesRefSchema = z
  .discriminatedUnion("by", [
    z.object({
      by: z.literal("ids").describe("Match an explicit list of traces by their identifiers. Pair with `ids`."),
      ids: z.array(traceIdSchema).min(1).describe("Non-empty list of trace identifiers."),
    }),
    z.object({
      by: z
        .literal("filters")
        .describe("Match every trace produced by a filter set. Pair with `filters`; result count is not bounded."),
      filters: FilterSetSchema,
    }),
  ])
  .openapi("TracesRef")

// All protected endpoints are already org-scoped via the Bearer API key
// (resolved by `createAuthMiddleware` + `createOrganizationContextMiddleware`),
// so the path schemas carry only resource identifiers — not the organization.

export const IdParamsSchema = z.object({
  id: z.string().describe("Resource ID"),
})

export const ProjectParamsSchema = z.object({
  projectSlug: z.string().describe("Project slug (human-readable identifier)"),
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
