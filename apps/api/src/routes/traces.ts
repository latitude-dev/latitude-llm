import { getTraceAnnotationUseCase, listTraceAnnotationsUseCase } from "@domain/annotations"
import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { AnnotationScore } from "@domain/scores"
import { BadRequestError, cuidSchema, OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import { SpanRepository, TraceRepository } from "@domain/spans"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { SpanRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  MembershipRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import { AnnotationSchema, toAnnotationResponse } from "../openapi/entities/annotation.ts"
import { SpanDetailSchema, SpanSchema, toSpanDetailResponse, toSpanResponse } from "../openapi/entities/span.ts"
import {
  decodeTraceCursor,
  encodeTraceCursor,
  PaginatedTracesSchema,
  TRACE_SORT_FIELDS,
  TraceDetailSchema,
  toTraceDetailResponse,
  toTraceResponse,
} from "../openapi/entities/trace.ts"
import { Paginated, PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import {
  FilterSetSchema,
  jsonBody,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  spanIdSchema,
  TracesRefSchema,
  traceIdSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const tracesFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "traces",
    "x-fern-sdk-method-name": methodName,
  }) as const

const ListBodySchema = z
  .object({
    cursor: z
      .string()
      .optional()
      .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
    limit: z.number().int().min(1).max(200).default(50).describe("Page size. Defaults to 50; max 200."),
    sortBy: z.enum(TRACE_SORT_FIELDS).default("startTime").describe("Field to sort by. Defaults to `startTime`."),
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
    filters: FilterSetSchema.optional(),
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

export const tracesPath = "/projects/:projectSlug/traces"

const traceEndpoint = defineApiEndpoint<OrganizationScopedEnv>(tracesPath)

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
    ...tracesFernGroup("list"),
    summary: "List project traces",
    description:
      "Returns a cursor-paginated page of traces in the project. Combine `filters` with `query` (free-text semantic search) to narrow the result set. Trace list rows exclude per-message LLM content — use `getTrace` for the full conversation view.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(ListBodySchema),
    },
    responses: openApiResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
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

        const traceRepo = yield* TraceRepository
        return yield* traceRepo.listByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          options: {
            limit: body.limit,
            sortBy: body.sortBy,
            sortDirection: body.sortDirection,
            ...(cursor ? { cursor } : {}),
            ...(body.filters ? { filters: body.filters } : {}),
            ...(body.query ? { searchQuery: body.query } : {}),
          },
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(TraceRepositoryLive, c.var.clickhouse, organizationId),
        withAi(AIEmbedLive, c.var.redis),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.items.map(toTraceResponse),
        nextCursor: page.nextCursor ? encodeTraceCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
      },
      200,
    )
  },
})

const getTrace = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}",
    name: "getTrace",
    tags: ["Traces"],
    ...tracesFernGroup("get"),
    summary: "Get project trace",
    description:
      "Returns a single trace by id, including the captured system instructions and the conversation messages from the trace's last LLM-completion span.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema }),
    },
    responses: openApiResponses({ status: 200, schema: TraceDetailSchema, description: "Trace detail" }),
  }),
  handler: async (c) => {
    const { projectSlug, traceId } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const trace = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const traceRepo = yield* TraceRepository
        return yield* traceRepo.findByTraceId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          traceId: TraceId(traceId),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(TraceRepositoryLive, c.var.clickhouse, organizationId),
        withAi(AIEmbedLive, c.var.redis),
        withTracing,
      ),
    )

    return c.json(toTraceDetailResponse(trace), 200)
  },
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
    ...tracesFernGroup("listSpans"),
    summary: "List trace spans",
    description:
      "Returns every span belonging to the trace, ordered by `startTime` ascending. Spans carry the OpenTelemetry envelope (kind, status, attributes, resource) plus Latitude's GenAI enrichment (tokens, cost, operation, provider, model). Per-message LLM content is excluded for size; use a span point-lookup for the conversation payload.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema }),
    },
    responses: openApiResponses({ status: 200, schema: TraceSpansSchema, description: "Spans of the trace" }),
  }),
  handler: async (c) => {
    const { projectSlug, traceId } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const spans = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const spanRepo = yield* SpanRepository
        return yield* spanRepo.listByTraceId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          traceId: TraceId(traceId),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(SpanRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    // Sort here rather than at the repo layer so the response contract holds
    // regardless of the underlying ClickHouse query plan / ordering.
    const sorted = [...spans].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    return c.json({ items: sorted.map(toSpanResponse) }, 200)
  },
})

const getTraceSpan = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}/spans/{spanId}",
    name: "getTraceSpan",
    tags: ["Traces"],
    ...tracesFernGroup("getSpan"),
    summary: "Get trace span",
    description:
      "Returns one span by id, including the LLM conversation (system instructions, input messages, output messages), tool data (definitions, call id, input, output), and the full OpenTelemetry payload (attributes, resource, events, links) that's excluded from the lighter list shape.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema, spanId: spanIdSchema }),
    },
    responses: openApiResponses({ status: 200, schema: SpanDetailSchema, description: "Span detail" }),
  }),
  handler: async (c) => {
    const { projectSlug, traceId, spanId } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const span = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const spanRepo = yield* SpanRepository
        return yield* spanRepo.findBySpanId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          traceId: TraceId(traceId),
          spanId: SpanId(spanId),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(SpanRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toSpanDetailResponse(span), 200)
  },
})

const PaginatedTraceAnnotationsSchema = Paginated(AnnotationSchema, "PaginatedTraceAnnotations")

const listTraceAnnotations = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}/annotations",
    name: "listTraceAnnotations",
    tags: ["Traces"],
    ...tracesFernGroup("listAnnotations"),
    summary: "List trace annotations",
    description:
      "Returns a cursor-paginated page of annotations pinned to the trace, including both published annotations and drafts.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({ traceId: traceIdSchema }),
      query: PaginatedQueryParamsSchema,
    },
    responses: openApiResponses({
      status: 200,
      schema: PaginatedTraceAnnotationsSchema,
      description: "Annotations of the trace",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, traceId } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
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
        return { result, offset }
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive), c.var.postgresClient, organizationId),
        withTracing,
      ),
    )

    // The use-case filters by `source: "annotation"` so every row is an
    // `AnnotationScore`, but its return type is the broader `Score` union.
    return c.json(
      {
        items: page.result.items.map((s) => toAnnotationResponse(s as AnnotationScore)),
        nextCursor: page.result.hasMore ? encodeAnnotationOffsetCursor(page.offset + page.result.items.length) : null,
        hasMore: page.result.hasMore,
      },
      200,
    )
  },
})

const getTraceAnnotation = traceEndpoint({
  route: createRoute({
    method: "get",
    path: "/{traceId}/annotations/{annotationId}",
    name: "getTraceAnnotation",
    tags: ["Traces"],
    ...tracesFernGroup("getAnnotation"),
    summary: "Get trace annotation",
    description: "Returns one annotation by id pinned to the trace.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema.extend({
        traceId: traceIdSchema,
        annotationId: cuidSchema.describe("Stable annotation identifier."),
      }),
    },
    responses: openApiResponses({ status: 200, schema: AnnotationSchema, description: "Annotation" }),
  }),
  handler: async (c) => {
    const { projectSlug, traceId, annotationId } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const annotation = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        return yield* getTraceAnnotationUseCase({
          projectId: project.id,
          traceId: TraceId(traceId),
          annotationId,
        })
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive), c.var.postgresClient, organizationId),
        withTracing,
      ),
    )

    return c.json(toAnnotationResponse(annotation), 200)
  },
})

const exportTraces = traceEndpoint({
  route: createRoute({
    method: "post",
    path: "/export",
    name: "exportTraces",
    tags: ["Traces"],
    ...tracesFernGroup("export"),
    summary: "Export project traces (async)",
    description:
      'Enqueues a CSV export of the traces matched by `traces`. The export runs asynchronously; a download link is emailed to `recipient` when the file is ready. The response returns immediately with `status = "queued"`. The recipient must already be a member of the requesting organization.',
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(ExportBodySchema),
    },
    responses: openApiResponses({ status: 202, schema: ExportResponseSchema, description: "Export enqueued" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const body = c.req.valid("json")
    const organizationId = c.var.organization.id

    await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const membershipRepo = yield* MembershipRepository
        const isMember = yield* membershipRepo.findMemberByEmail(body.recipient)
        if (!isMember) {
          return yield* new BadRequestError({
            message: "`recipient` must belong to a member of this organization.",
          })
        }

        yield* c.var.queuePublisher.publish("exports", "generate", {
          kind: "traces",
          organizationId: organizationId as string,
          projectId: project.id as string,
          recipientEmail: body.recipient,
          ...(body.traces.by === "ids"
            ? { selection: { mode: "selected" as const, rowIds: body.traces.ids as readonly string[] } }
            : { filters: body.traces.filters }),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, MembershipRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json({ status: "queued" as const }, 202)
  },
})

export const createTracesRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listTraces.mountHttp(app, createTierRateLimiter("medium"))
  getTrace.mountHttp(app, createTierRateLimiter("low"))
  listTraceSpans.mountHttp(app, createTierRateLimiter("low"))
  getTraceSpan.mountHttp(app, createTierRateLimiter("low"))
  listTraceAnnotations.mountHttp(app, createTierRateLimiter("low"))
  getTraceAnnotation.mountHttp(app, createTierRateLimiter("low"))
  exportTraces.mountHttp(app, createTierRateLimiter("critical"))
  return app
}
