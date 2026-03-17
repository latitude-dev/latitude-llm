import { OrganizationId, ProjectId } from "@domain/shared"
import type { Trace } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { Effect } from "effect"
import { ErrorSchema, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// ---------------------------------------------------------------------------
// Allowed filterable fields for traces
// Must stay in sync with TRACE_FILTER_SCHEMA in the trace repository.
// ---------------------------------------------------------------------------

const TRACE_FILTER_FIELDS = new Set([
  "traceId",
  "status",
  "startTime",
  "endTime",
  "spanCount",
  "errorCount",
  "durationNs",
  "tokensInput",
  "tokensOutput",
  "tokensCacheRead",
  "tokensCacheCreate",
  "tokensReasoning",
  "tokensTotal",
  "costInputMicrocents",
  "costOutputMicrocents",
  "costTotalMicrocents",
  "tags",
  "models",
  "providers",
  "serviceNames",
  "rootSpanName",
] as const)

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const StringFilterSchema = z.object({
  type: z.literal("string"),
  field: z.string(),
  op: z.enum(["eq", "like"]),
  value: z.string(),
  negated: z.boolean().optional(),
})

const NumberFilterSchema = z.union([
  z.object({
    type: z.literal("number"),
    field: z.string(),
    op: z.enum(["eq", "gt", "gte", "lt", "lte"]),
    value: z.number(),
    negated: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("number"),
    field: z.string(),
    op: z.literal("between"),
    min: z.number(),
    max: z.number(),
    negated: z.boolean().optional(),
  }),
])

const DateFilterSchema = z.union([
  z.object({
    type: z.literal("date"),
    field: z.string(),
    op: z.enum(["eq", "gt", "gte", "lt", "lte"]),
    value: z.string().datetime({ offset: true }),
    negated: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("date"),
    field: z.string(),
    op: z.literal("between"),
    min: z.string().datetime({ offset: true }),
    max: z.string().datetime({ offset: true }),
    negated: z.boolean().optional(),
  }),
])

const ArrayFilterSchema = z.object({
  type: z.literal("array"),
  field: z.string(),
  op: z.literal("contains"),
  value: z.string(),
  negated: z.boolean().optional(),
})

const FieldFilterSchema = z
  .union([StringFilterSchema, NumberFilterSchema, DateFilterSchema, ArrayFilterSchema])
  .openapi("FieldFilter")

const QueryTracesBodySchema = z
  .object({
    filters: z
      .array(FieldFilterSchema)
      .optional()
      .default([])
      .openapi({
        description:
          "Filters to apply. String fields support op: eq | like (use * as wildcard). " +
          "Number and date fields support op: eq | gt | gte | lt | lte | between. " +
          "Array fields support op: contains. Any filter can be negated: true. " +
          "status values: 0=unset, 1=ok, 2=error.",
      }),
    limit: z.number().int().min(1).max(1000).optional().openapi({ description: "Max results (default 50)" }),
    offset: z.number().int().min(0).optional().openapi({ description: "Pagination offset (default 0)" }),
  })
  .openapi("QueryTracesBody")

const TraceSchema = z
  .object({
    organizationId: z.string(),
    projectId: z.string(),
    traceId: z.string(),
    spanCount: z.number(),
    errorCount: z.number(),
    startTime: z.string(),
    endTime: z.string(),
    durationNs: z.number(),
    status: z.enum(["unset", "ok", "error"]),
    tokensInput: z.number(),
    tokensOutput: z.number(),
    tokensCacheRead: z.number(),
    tokensCacheCreate: z.number(),
    tokensReasoning: z.number(),
    tokensTotal: z.number(),
    costInputMicrocents: z.number(),
    costOutputMicrocents: z.number(),
    costTotalMicrocents: z.number(),
    tags: z.array(z.string()),
    models: z.array(z.string()),
    providers: z.array(z.string()),
    serviceNames: z.array(z.string()),
    rootSpanId: z.string(),
    rootSpanName: z.string(),
  })
  .openapi("Trace")

const OrgAndProjectParamsSchema = z.object({
  organizationId: z.string().openapi({ description: "Organization ID" }),
  projectId: z.string().openapi({ description: "Project ID" }),
})

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const toTraceResponse = (trace: Trace) => ({
  organizationId: trace.organizationId as string,
  projectId: trace.projectId as string,
  traceId: trace.traceId as string,
  spanCount: trace.spanCount,
  errorCount: trace.errorCount,
  startTime: trace.startTime.toISOString(),
  endTime: trace.endTime.toISOString(),
  durationNs: trace.durationNs,
  status: trace.status,
  tokensInput: trace.tokensInput,
  tokensOutput: trace.tokensOutput,
  tokensCacheRead: trace.tokensCacheRead,
  tokensCacheCreate: trace.tokensCacheCreate,
  tokensReasoning: trace.tokensReasoning,
  tokensTotal: trace.tokensTotal,
  costInputMicrocents: trace.costInputMicrocents,
  costOutputMicrocents: trace.costOutputMicrocents,
  costTotalMicrocents: trace.costTotalMicrocents,
  tags: [...trace.tags],
  models: [...trace.models],
  providers: [...trace.providers],
  serviceNames: [...trace.serviceNames],
  rootSpanId: trace.rootSpanId as string,
  rootSpanName: trace.rootSpanName,
})

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const queryTracesRoute = createRoute({
  method: "post",
  path: "/query",
  tags: ["Traces"],
  summary: "Query traces",
  description:
    "Query traces for a project with optional filters. " +
    "Filters support exact match, wildcards, ranges, and array containment. Any filter can be negated.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndProjectParamsSchema,
    body: {
      content: { "application/json": { schema: QueryTracesBodySchema } },
      required: false,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ traces: z.array(TraceSchema) }).openapi("QueryTracesResponse"),
        },
      },
      description: "Matching traces",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unknown filter field",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
})

export const createTracesRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>({
    defaultHook(result, c) {
      if (!result.success) {
        const error = result.error.issues.map((i) => i.message).join(", ")
        return c.json({ error }, 400)
      }
    },
  })

  app.openapi(queryTracesRoute, async (c) => {
    const { projectId } = c.req.valid("param")
    const body = c.req.valid("json") ?? { filters: [], limit: undefined, offset: undefined }
    const filters = body.filters ?? []

    // Validate filter fields before hitting ClickHouse
    const unknownFields = filters.filter((f) => !TRACE_FILTER_FIELDS.has(f.field as never))
    if (unknownFields.length > 0) {
      const fields = unknownFields.map((f) => f.field).join(", ")
      return c.json({ error: `Unknown filter fields: ${fields}` }, 400)
    }

    const organizationId = OrganizationId(c.var.organization.id as string)

    const traces = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* TraceRepository
        return yield* repo.findByProjectId({
          organizationId,
          projectId: ProjectId(projectId),
          options: {
            filters,
            ...(body.limit !== undefined ? { limit: body.limit } : {}),
            ...(body.offset !== undefined ? { offset: body.offset } : {}),
          },
        })
      }).pipe(withClickHouse(TraceRepositoryLive, c.var.clickhouse, organizationId)),
    )

    return c.json({ traces: traces.map(toTraceResponse) }, 200)
  })

  return app
}
