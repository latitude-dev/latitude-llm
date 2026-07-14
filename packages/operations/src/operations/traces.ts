import { getTraceAnnotationUseCase, listTraceAnnotationsUseCase } from "@domain/annotations"
import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { AnnotationScore } from "@domain/scores"
import { BadRequestError, cuidSchema, OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import { getTraceAnalyticsUseCase, SpanRepository, TraceRepository } from "@domain/spans"
import { createRoute, z } from "@hono/zod-openapi"
import { AIEmbedLive, withAi } from "@platform/ai"
import { SpanRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  MembershipRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { AnnotationSchema, toAnnotationResponse } from "../openapi/entities/annotation.ts"
import { SpanDetailSchema, SpanSchema, toSpanDetailResponse, toSpanResponse } from "../openapi/entities/span.ts"
import {
  decodeTraceCursor,
  encodeTraceCursor,
  fetchTraceIndicators,
  PaginatedTracesSchema,
  TRACE_SORT_FIELDS,
  TraceDetailSchema,
  toTraceDetailResponse,
  toTraceResponse,
} from "../openapi/entities/trace.ts"
import { TraceAnalyticsResponseSchema, toTraceAnalyticsResponse } from "../openapi/entities/trace-analytics.ts"
import { Paginated, PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import {
  addTraceFilterFieldIssues,
  jsonBody,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  spanIdSchema,
  TRACE_FILTER_SET_DESCRIPTION,
  TraceFilterSetSchema,
  TracesRefSchema,
  traceIdSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const ListBodySchema = z
  .object({
    cursor: z
      .string()
      .optional()
      .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
    limit: z.number().int().min(1).max(200).default(50).describe("Page size. Defaults to 50; max 200."),
    sortBy: z
      .enum(TRACE_SORT_FIELDS)
      .default("startTime")
      .describe(
        "Field to sort by. Defaults to `startTime`. Pass `relevance` together with `query` to rank by semantic match (best match first, then most recent).",
      ),
    sortDirection: z
      .enum(["asc", "desc"])
      .default("desc")
      .describe("Sort direction. Defaults to `desc` (most recent first)."),
    query: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Free-text semantic search across the trace's input and output messages. Combined with `filters` via AND.",
      ),
    filters: TraceFilterSetSchema.optional().describe(TRACE_FILTER_SET_DESCRIPTION),
  })
  .openapi("ListTracesBody")

const ExportBodySchema = z
  .object({
    traces: TracesRefSchema.describe("Which traces to include in the export — either explicit ids or a filter set."),
    recipient: z
      .email()
      .describe(
        "Email address the export download link is sent to. Must belong to a member of the requesting organization — otherwise the request is rejected with 400.",
      ),
  })
  .openapi("ExportTracesBody")
  .superRefine((body, ctx) => {
    if (body.traces.by === "filters") addTraceFilterFieldIssues(body.traces.filters, ctx, ["traces", "filters"])
  })

const ExportResponseSchema = z
  .object({
    status: z
      .literal("queued")
      .describe('Always `"queued"`. The CSV is built asynchronously and emailed to `recipient` when ready.'),
  })
  .openapi("ExportTracesResponse")

// Annotation cursor — base64url JSON of `{ offset: number }`. The underlying
// score-listing use-case is offset-based; encoding offset as an opaque cursor
// keeps the public API shape consistent with the rest of the surface
// (`{ items, nextCursor, hasMore }`).
const encodeAnnotationOffsetCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url")

const decodeAnnotationOffsetCursor = (raw: string): number | null => {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as unknown
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as { offset?: unknown }).offset !== "number" ||
      !Number.isInteger((parsed as { offset: number }).offset) ||
      (parsed as { offset: number }).offset < 0
    ) {
      return null
    }
    return (parsed as { offset: number }).offset
  } catch {
    return null
  }
}

const tracesPath = "/projects/:projectSlug/traces"

const traceEndpoint = defineOperation<OrganizationScopedEnv>(tracesPath)

// `list` is a POST so that `filters` can be a typed object in the request
// body rather than a URL-encoded JSON string. Clients (SDKs, MCP tool calls)
// see the full filter shape — fields, operators, value types — in their
// generated input schema instead of an opaque `filters: string`.
const listTraces = traceEndpoint({
  route: createRoute({
    method: "post",
    path: "/list",
    name: "listTraces",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "list",
    summary: "List project traces",
    description:
      "Returns a cursor-paginated page of traces in the project. Combine `filters` with `query` (free-text semantic search) to narrow the result set. Trace list rows exclude per-message LLM content — use `getTrace` for the full conversation view.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(ListBodySchema),
    },
    responses: typedResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const body = input.body

      let cursor: { sortValue: string; traceId: string } | undefined
      if (body.cursor) {
        const decoded = decodeTraceCursor(body.cursor)
        if (!decoded) {
          return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        }
        cursor = decoded
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)

      const traceRepo = yield* TraceRepository
      const page = yield* traceRepo.listByProjectId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId,
        options: {
          limit: body.limit,
          sortBy: body.sortBy,
          sortDirection: body.sortDirection,
          ...(cursor ? { cursor } : {}),
          ...(body.filters ? { filters: body.filters } : {}),
          ...(body.query ? { searchQuery: body.query } : {}),
        },
      })

      const indicators = yield* fetchTraceIndicators({
        projectId,
        traceIds: page.items.map((trace) => trace.traceId),
      })

      return {
        status: 200,
        body: {
          items: page.items.map((trace) => toTraceResponse(trace, indicators)),
          nextCursor: page.nextCursor ? encodeTraceCursor(page.nextCursor) : null,
          hasMore: page.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive), ctx.postgresClient, ctx.organization.id),
      withClickHouse(TraceRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withAi(AIEmbedLive, ctx.redis),
      withTracing,
    ),
})

const getTrace = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}",
    name: "getTrace",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "get",
    summary: "Get project trace",
    description:
      "Returns a single trace by id, including its `conversation`: the system instructions and the messages of the trace's last LLM-completion span, in OpenTelemetry GenAI format.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema }),
    },
    responses: typedResponses({ status: 200, schema: TraceDetailSchema, description: "Trace detail" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, traceId } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)

      const traceRepo = yield* TraceRepository
      const trace = yield* traceRepo.findByTraceId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId,
        traceId: TraceId(traceId),
      })

      const indicators = yield* fetchTraceIndicators({
        projectId,
        traceIds: [TraceId(traceId)],
      })

      return { status: 200, body: toTraceDetailResponse(trace, indicators) } as const
    }).pipe(
      withPostgres(Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive), ctx.postgresClient, ctx.organization.id),
      withClickHouse(TraceRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withAi(AIEmbedLive, ctx.redis),
      withTracing,
    ),
})

const TraceSpansSchema = z
  .object({
    items: z.array(SpanSchema).describe("All spans belonging to the trace, ordered by `startTime` ascending."),
  })
  .openapi("TraceSpans")

const listTraceSpans = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}/spans",
    name: "listTraceSpans",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "listSpans",
    summary: "List trace spans",
    description:
      "Returns every span belonging to the trace, ordered by `startTime` ascending. Spans carry the OpenTelemetry envelope (kind, status, attributes, resource) plus Latitude's GenAI enrichment (tokens, cost, operation, provider, model). Per-message LLM content is excluded for size; use a span point-lookup for the conversation payload.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema }),
    },
    responses: typedResponses({ status: 200, schema: TraceSpansSchema, description: "Spans of the trace" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, traceId } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const spanRepo = yield* SpanRepository
      const spans = yield* spanRepo.listByTraceId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        traceId: TraceId(traceId),
      })

      // Sort here rather than at the repo layer so the response contract holds
      // regardless of the underlying ClickHouse query plan / ordering.
      const sorted = [...spans].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      return { status: 200, body: { items: sorted.map(toSpanResponse) } } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(SpanRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getTraceSpan = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}/spans/{spanId}",
    name: "getTraceSpan",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "getSpan",
    summary: "Get trace span",
    description:
      "Returns one span by id, including the LLM conversation (system instructions, input messages, output messages), tool data (definitions, call id, input, output), and the full OpenTelemetry payload (attributes, resource, events, links) that's excluded from the lighter list shape.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema, spanId: spanIdSchema }),
    },
    responses: typedResponses({ status: 200, schema: SpanDetailSchema, description: "Span detail" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, traceId, spanId } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const spanRepo = yield* SpanRepository
      const span = yield* spanRepo.findBySpanId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        traceId: TraceId(traceId),
        spanId: SpanId(spanId),
      })

      return { status: 200, body: toSpanDetailResponse(span) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(SpanRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const PaginatedTraceAnnotationsSchema = Paginated(AnnotationSchema, "PaginatedTraceAnnotations")

const listTraceAnnotations = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}/annotations",
    name: "listTraceAnnotations",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "listAnnotations",
    summary: "List trace annotations",
    description:
      "Returns a cursor-paginated page of annotations pinned to the trace, including both published annotations and drafts.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema }),
      query: PaginatedQueryParamsSchema,
    },
    responses: typedResponses({
      status: 200,
      schema: PaginatedTraceAnnotationsSchema,
      description: "Annotations of the trace",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, traceId } = input.params
      const query = input.query

      let offset = 0
      if (query.cursor) {
        const decoded = decodeAnnotationOffsetCursor(query.cursor)
        if (decoded === null) {
          return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        }
        offset = decoded
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const result = yield* listTraceAnnotationsUseCase({
        projectId: project.id,
        traceId,
        limit: query.limit,
        offset,
        draftMode: "include",
      })
      // The use-case filters by `source: "annotation"` so every row is an
      // `AnnotationScore`, but its return type is the broader `Score` union.
      return {
        status: 200,
        body: {
          items: result.items.map((s) => toAnnotationResponse(s as AnnotationScore)),
          nextCursor: result.hasMore ? encodeAnnotationOffsetCursor(offset + result.items.length) : null,
          hasMore: result.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive), ctx.postgresClient, ctx.organization.id),
      withTracing,
    ),
})

const getTraceAnnotation = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}/annotations/{annotationId}",
    name: "getTraceAnnotation",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "getAnnotation",
    summary: "Get trace annotation",
    description: "Returns one annotation by id pinned to the trace.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({
        traceId: traceIdSchema,
        annotationId: cuidSchema.describe("Stable annotation identifier."),
      }),
    },
    responses: typedResponses({ status: 200, schema: AnnotationSchema, description: "Annotation" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, traceId, annotationId } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const annotation = yield* getTraceAnnotationUseCase({
        projectId: project.id,
        traceId: TraceId(traceId),
        annotationId,
      })
      return { status: 200, body: toAnnotationResponse(annotation) } as const
    }).pipe(
      withPostgres(Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive), ctx.postgresClient, ctx.organization.id),
      withTracing,
    ),
})

const exportTraces = traceEndpoint({
  route: createRoute({
    method: "post",
    path: "/export",
    name: "exportTraces",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "export",
    summary: "Export project traces (async)",
    description:
      'Enqueues a CSV export of the traces matched by `traces`. The export runs asynchronously; a download link is emailed to `recipient` when the file is ready. The response returns immediately with `status = "queued"`. The recipient must already be a member of the requesting organization.',
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(ExportBodySchema),
    },
    responses: typedResponses({ status: 202, schema: ExportResponseSchema, description: "Export enqueued" }),
  }),
  access: "write",
  rateLimitTier: "ultra",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const body = input.body

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const membershipRepo = yield* MembershipRepository
      const isMember = yield* membershipRepo.findMemberByEmail(body.recipient)
      if (!isMember) {
        return yield* new BadRequestError({
          message: "`recipient` must belong to a member of this organization.",
        })
      }

      yield* ctx.queuePublisher.publish("exports", "generate", {
        kind: "traces",
        organizationId: ctx.organization.id as string,
        projectId: project.id as string,
        recipientEmail: body.recipient,
        ...(body.traces.by === "ids"
          ? { selection: { mode: "selected" as const, rowIds: body.traces.ids as readonly string[] } }
          : { filters: body.traces.filters }),
      })
      return { status: 202, body: { status: "queued" as const } } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, MembershipRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const AnalyticsQuerySchema = z.object({
  fromIso: z.iso
    .datetime()
    .optional()
    .describe("Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive) of the time range. Defaults to now."),
})

const getTraceAnalytics = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/analytics",
    name: "getTraceAnalytics",
    tags: ["Traces"],
    group: "traces",
    sdkMethod: "analytics",
    summary: "Get project trace analytics",
    description:
      "Returns trace analytics for the project: a total (or median) per metric over the requested range, plus a per-bucket series for each metric. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: AnalyticsQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: TraceAnalyticsResponseSchema,
      description: "Trace analytics",
    }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const { fromIso, toIso } = input.query

      if (fromIso && toIso && Date.parse(toIso) < Date.parse(fromIso)) {
        return { status: 400, body: { error: "`toIso` must be greater than or equal to `fromIso`." } } as const
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const analytics = yield* getTraceAnalyticsUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        ...(fromIso ? { from: new Date(fromIso) } : {}),
        ...(toIso ? { to: new Date(toIso) } : {}),
      })
      return { status: 200, body: toTraceAnalyticsResponse(analytics) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(TraceRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

export const tracesModule: OperationModule = {
  path: tracesPath,
  operations: [
    listTraces,
    getTraceAnalytics,
    getTrace,
    listTraceSpans,
    getTraceSpan,
    listTraceAnnotations,
    getTraceAnnotation,
    exportTraces,
  ],
}
