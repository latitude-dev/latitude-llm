import {
  FILTER_OPERATORS,
  isPercentileSessionFilterField,
  isPercentileTraceFilterField,
  SCORE_FILTER_FIELDS,
  SESSION_ID_LENGTH,
  SESSION_TELEMETRY_FILTER_FIELDS,
  SPAN_ID_LENGTH,
  SPAN_ROW_FILTER_GTE_PERCENTILE_MESSAGE,
  TRACE_ID_LENGTH,
  TRACE_TELEMETRY_FILTER_FIELDS,
  traceFilterGtePercentileMessage,
  unknownSessionFilterFields,
  unknownTraceFilterFields,
} from "@domain/shared"
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

export const FilterSetSchema = z
  .record(z.string(), z.array(FilterConditionSchema))
  .describe(
    "Filter set keyed by field name. Each entry holds an array of conditions ANDed together for that field; field-level groups are also ANDed across the set.",
  )
  .openapi("FilterSet")

export const SpanRowFilterSetSchema = FilterSetSchema.superRefine((filters, ctx) => {
  for (const [field, conditions] of Object.entries(filters)) {
    conditions.forEach((cond, index) => {
      if (cond.op === "gtePercentile") {
        ctx.addIssue({
          code: "custom",
          message: SPAN_ROW_FILTER_GTE_PERCENTILE_MESSAGE,
          path: [field, index, "op"],
        })
      }
    })
  }
})
  .describe(
    'Span row filter set. `gtePercentile` is not supported — use absolute `gte`/`lte` thresholds or `queryAnalytics` with `stream: "spans"` and a percentile metric.',
  )
  .openapi("SpanRowFilterSet")

export const TRACE_FILTER_SET_DESCRIPTION = `Filter set keyed by trace field. Each entry holds an array of conditions ANDed together for that field; field-level groups are ANDed across the set. Valid fields: ${TRACE_TELEMETRY_FILTER_FIELDS.join(", ")}; score-derived keys (${SCORE_FILTER_FIELDS.join(", ")}); and arbitrary metadata via \`metadata.<key>\`. \`startTime\`/\`endTime\` take ISO-8601 values (a trace's first span start / last span end). \`gtePercentile\` is only supported on duration/ttft/cost — not on time fields. Unknown fields are rejected rather than ignored.`

const traceFilterFieldIssue = (field: string): string =>
  `Unknown trace filter field "${field}". Valid fields: ${TRACE_TELEMETRY_FILTER_FIELDS.join(", ")}; score.* keys (e.g. ${SCORE_FILTER_FIELDS[0]}); or metadata.<key>.`

/** Flags every filter-set key/operator the trace query cannot apply, so callers get a 400 instead of silently unfiltered results or a 500. */
const addTraceFilterFieldIssues = (
  filters: Readonly<Record<string, unknown>>,
  ctx: z.RefinementCtx,
  basePath: readonly (string | number)[] = [],
): void => {
  for (const field of unknownTraceFilterFields(filters)) {
    ctx.addIssue({ code: "custom", message: traceFilterFieldIssue(field), path: [...basePath, field] })
  }

  // Percentile resolution only rewrites duration/ttft/cost; other gtePercentile ops would 500 in the filter builder.
  for (const [field, conditions] of Object.entries(filters)) {
    if (isPercentileTraceFilterField(field) || !Array.isArray(conditions)) continue
    conditions.forEach((cond, index) => {
      if (
        cond !== null &&
        typeof cond === "object" &&
        "op" in cond &&
        (cond as { op?: unknown }).op === "gtePercentile"
      ) {
        ctx.addIssue({
          code: "custom",
          message: traceFilterGtePercentileMessage(field),
          path: [...basePath, field, index, "op"],
        })
      }
    })
  }
}

export const TraceFilterSetSchema = FilterSetSchema.superRefine((filters, ctx) => {
  addTraceFilterFieldIssues(filters, ctx)
})
  .describe(TRACE_FILTER_SET_DESCRIPTION)
  .openapi("TraceFilterSet")

// Session filters mirror the web session filter dropdown, which — unlike traces —
// exposes the conversation-intelligence fields `moments` and `topics`.
export const SESSION_FILTER_SET_DESCRIPTION = `Filter set keyed by session field. Each entry holds an array of conditions ANDed together for that field; field-level groups are ANDed across the set. Valid fields: ${SESSION_TELEMETRY_FILTER_FIELDS.join(", ")}; score-derived keys (${SCORE_FILTER_FIELDS.join(", ")}); and arbitrary metadata via \`metadata.<key>\`. \`moments\` filters by conversation moment kind and \`topics\` by behavior topic id (a topic matches its whole subtree). \`startTime\`/\`endTime\` take ISO-8601 values (a session's first span start / last span end). \`gtePercentile\` is only supported on duration/ttft/cost. Unknown fields are rejected rather than ignored.`

const sessionFilterFieldIssue = (field: string): string =>
  `Unknown session filter field "${field}". Valid fields: ${SESSION_TELEMETRY_FILTER_FIELDS.join(", ")}; score.* keys (e.g. ${SCORE_FILTER_FIELDS[0]}); or metadata.<key>.`

/** Flags every filter-set key/operator the session query cannot apply, so callers get a 400 instead of silently unfiltered results or a 500. */
const addSessionFilterFieldIssues = (
  filters: Readonly<Record<string, unknown>>,
  ctx: z.RefinementCtx,
  basePath: readonly (string | number)[] = [],
): void => {
  for (const field of unknownSessionFilterFields(filters)) {
    ctx.addIssue({ code: "custom", message: sessionFilterFieldIssue(field), path: [...basePath, field] })
  }

  // Percentile resolution only rewrites duration/ttft/cost; other gtePercentile ops would 500 in the filter builder.
  for (const [field, conditions] of Object.entries(filters)) {
    if (isPercentileSessionFilterField(field) || !Array.isArray(conditions)) continue
    conditions.forEach((cond, index) => {
      if (
        cond !== null &&
        typeof cond === "object" &&
        "op" in cond &&
        (cond as { op?: unknown }).op === "gtePercentile"
      ) {
        ctx.addIssue({
          code: "custom",
          message: `gtePercentile is only supported on duration/ttft/cost; not on '${field}'. Use absolute gte/lte thresholds instead.`,
          path: [...basePath, field, index, "op"],
        })
      }
    })
  }
}

export const SessionFilterSetSchema = FilterSetSchema.superRefine((filters, ctx) => {
  addSessionFilterFieldIssues(filters, ctx)
})
  .describe(SESSION_FILTER_SET_DESCRIPTION)
  .openapi("SessionFilterSet")

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
  .superRefine((ref, ctx) => {
    // Same allow-list as TraceFilterSetSchema — the filters branch resolves
    // against the trace registry, which silently drops unknown keys.
    if (ref.by === "filters") addTraceFilterFieldIssues(ref.filters, ctx, ["filters"])
  })

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
  .superRefine((ref, ctx) => {
    if (ref.by === "filters") addTraceFilterFieldIssues(ref.filters, ctx, ["filters"])
  })

// All protected endpoints are already org-scoped via the Bearer API key
// (resolved by `createAuthMiddleware` + `createOrganizationContextMiddleware`),
// so the path schemas carry only resource identifiers — not the organization.

export const ProjectParamsSchema = z.object({
  projectSlug: z.string().describe("Project slug (human-readable identifier)"),
})

/** Security scheme applied to protected endpoints. */
export const PROTECTED_SECURITY = [{ ApiKeyAuth: [] }]

/** Security scheme override applied to public endpoints. */
export const PUBLIC_SECURITY = []

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
const openApiResponses = ({
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

type ErrorEntry = { content: { "application/json": { schema: typeof ErrorSchema } }; description: string }

/**
 * Literal-typed twin of {@link openApiResponses} with identical runtime output.
 * Execute-form operations need literal response keys so `OperationOutput` can
 * infer the status/body union; retyping `openApiResponses` itself would
 * suddenly strict-check every legacy handler, so the typed shape lives in this
 * separate helper and handler-form routes migrate to it with their conversion.
 *
 * Deliberately omits `openApiResponses`'s `extraErrors`: deriving the mapped
 * keys from an `extraErrors` type param collapses `OperationOutput`'s key
 * extraction to a number index under tsgo, so extra statuses would emit to the
 * spec but never reach the typed union — a silent foot-gun. An execute-form
 * operation that needs extra error statuses should use `openApiResponses` (and
 * forgo the typed output union) until this helper grows typed support.
 */
export const typedResponses = <S extends 200 | 201 | 202, T extends z.ZodType>(args: {
  status: S
  schema: T
  description: string
}) =>
  openApiResponses(args) as {
    [K in S | 400 | 401 | 404]: K extends S
      ? { content: { "application/json": { schema: T } }; description: string }
      : ErrorEntry
  }
