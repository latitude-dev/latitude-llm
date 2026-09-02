import { computeSessionMemoryDiffUseCase, computeSessionMemorySummaryUseCase } from "@domain/memories"
import { ProjectRepository } from "@domain/projects"
import {
  BadRequestError,
  type FilterSet,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SessionId,
  TraceId,
} from "@domain/shared"
import { listSessionSignalsUseCase, SignalRepository } from "@domain/signals"
import { getSessionAnalyticsUseCase, SessionRepository, SpanRepository, TraceRepository } from "@domain/spans"
import { expandTopicFilterSetUseCase } from "@domain/taxonomy"
import { createRoute, z } from "@hono/zod-openapi"
import { AIEmbedLive, withAi } from "@platform/ai"
import {
  MemoryRepositoryLive,
  ScoreAnalyticsRepositoryLive,
  SessionRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SignalRepositoryLive,
  TaxonomyClusterRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import {
  SessionMemoryChangesSchema,
  SessionMemorySummarySchema,
  toSessionMemoryChangesResponse,
  toSessionMemorySummaryResponse,
} from "../openapi/entities/memory.ts"
import {
  decodeSessionCursor,
  encodeSessionCursor,
  PaginatedSessionsSchema,
  SESSION_SORT_FIELDS,
  SessionDetailSchema,
  toSessionDetailResponse,
  toSessionResponse,
} from "../openapi/entities/session.ts"
import { SessionAnalyticsResponseSchema, toSessionAnalyticsResponse } from "../openapi/entities/session-analytics.ts"
import {
  SessionSignalSchema,
  SessionSignalsSchema,
  toSessionSignalResponse,
} from "../openapi/entities/session-signal.ts"
import {
  decodeTraceCursor,
  encodeTraceCursor,
  fetchTraceIndicators,
  PaginatedTracesSchema,
  toTraceResponse,
} from "../openapi/entities/trace.ts"
import { PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import {
  jsonBody,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  SESSION_FILTER_SET_DESCRIPTION,
  SessionFilterSetSchema,
  sessionIdSchema,
  traceIdSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const sessionsPath = "/projects/:projectSlug/sessions"

const sessionEndpoint = defineOperation<OrganizationScopedEnv>(sessionsPath)

const SessionParamsSchema = ProjectParamsSchema.extend({ sessionId: sessionIdSchema })

// Traces of a session are ordered by these fields. `relevance` is omitted: this
// endpoint has no free-text query to rank against.
const SESSION_TRACE_SORT_FIELDS = ["startTime", "endTime", "durationNs", "tokensTotal", "costTotalMicrocents"] as const

const ListBodySchema = z
  .object({
    cursor: z
      .string()
      .optional()
      .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
    limit: z.number().int().min(1).max(200).default(50).describe("Page size. Defaults to 50; max 200."),
    sortBy: z
      .enum(SESSION_SORT_FIELDS)
      .default("lastActivity")
      .describe("Field to sort by. Defaults to `lastActivity` (most recently active first)."),
    sortDirection: z
      .enum(["asc", "desc"])
      .default("desc")
      .describe("Sort direction. Defaults to `desc` (most recent first)."),
    query: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Free-text semantic search across the sessions' traces (input and output messages). Combined with `filters` via AND.",
      ),
    filters: SessionFilterSetSchema.optional().describe(SESSION_FILTER_SET_DESCRIPTION),
  })
  .openapi("ListSessionsBody")

// `list` is a POST so that `filters` can be a typed object in the request body
// rather than a URL-encoded JSON string. Clients (SDKs, MCP tool calls) see the
// full filter shape in their generated input schema instead of `filters: string`.
const listSessions = sessionEndpoint({
  route: createRoute({
    method: "post",
    path: "/list",
    name: "listSessions",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "list",
    summary: "List project sessions",
    description:
      "Returns a cursor-paginated page of sessions in the project. A session groups the traces of one conversation. Combine `filters` with `query` (free-text semantic search) to narrow the result set. Session list rows exclude per-message LLM content — use `getSession` for the conversation view.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(ListBodySchema),
    },
    responses: typedResponses({ status: 200, schema: PaginatedSessionsSchema, description: "Page of sessions" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const body = input.body

      let cursor: { sortValue: string; secondaryValue?: string; sessionId: string } | undefined
      if (body.cursor) {
        const decoded = decodeSessionCursor(body.cursor)
        if (!decoded) {
          return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        }
        cursor = decoded
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)

      // `topics` selects a taxonomy subtree, not a single node — expand before CH.
      const filters = body.filters
        ? yield* expandTopicFilterSetUseCase({ projectId, filters: body.filters })
        : undefined

      const sessionRepo = yield* SessionRepository
      const page = yield* sessionRepo.listByProjectId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId,
        options: {
          limit: body.limit,
          sortBy: body.sortBy,
          sortDirection: body.sortDirection,
          ...(cursor ? { cursor } : {}),
          ...(filters ? { filters } : {}),
          ...(body.query ? { searchQuery: body.query } : {}),
        },
      })

      return {
        status: 200,
        body: {
          items: page.items.map((session) => toSessionResponse(session)),
          nextCursor: page.nextCursor ? encodeSessionCursor(page.nextCursor) : null,
          hasMore: page.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, TaxonomyClusterRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(SessionRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withAi(AIEmbedLive, ctx.redis),
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

const getSessionAnalytics = sessionEndpoint({
  route: createRoute({
    method: "get",
    path: "/analytics",
    name: "getSessionAnalytics",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "analytics",
    summary: "Get project session analytics",
    description:
      "Returns session analytics for the project: a total (or median) per metric over the requested range, plus a per-bucket series for each metric. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: AnalyticsQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: SessionAnalyticsResponseSchema,
      description: "Session analytics",
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

      const analytics = yield* getSessionAnalyticsUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        ...(fromIso ? { from: new Date(fromIso) } : {}),
        ...(toIso ? { to: new Date(toIso) } : {}),
      })
      return { status: 200, body: toSessionAnalyticsResponse(analytics) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(SessionRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getSession = sessionEndpoint({
  route: createRoute({
    method: "get",
    path: "/{sessionId}",
    name: "getSession",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "get",
    summary: "Get project session",
    description:
      "Returns a single session by id, including its `conversation`: the system instructions and the messages of the session's latest LLM completion, in OpenTelemetry GenAI format.",
    security: PROTECTED_SECURITY,
    request: { params: SessionParamsSchema },
    responses: typedResponses({ status: 200, schema: SessionDetailSchema, description: "Session detail" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, sessionId } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)
      const orgId = OrganizationId(ctx.organization.id as string)

      const sessionRepo = yield* SessionRepository
      const detail = yield* sessionRepo.findBySessionId({
        organizationId: orgId,
        projectId,
        sessionId: SessionId(sessionId),
      })

      const spanRepo = yield* SpanRepository
      const latestTraceId = yield* spanRepo.findLatestOutputTraceId({
        organizationId: orgId,
        projectId,
        traceIds: detail.traceIds.map((traceId) => TraceId(traceId)),
      })

      return {
        status: 200,
        body: toSessionDetailResponse(detail, latestTraceId ? (latestTraceId as string) : null),
      } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(Layer.mergeAll(SessionRepositoryLive, SpanRepositoryLive), ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const ListSessionTracesQuerySchema = PaginatedQueryParamsSchema.extend({
  sortBy: z.enum(SESSION_TRACE_SORT_FIELDS).default("startTime").describe("Field to sort by. Defaults to `startTime`."),
  sortDirection: z
    .enum(["asc", "desc"])
    .default("desc")
    .describe("Sort direction. Defaults to `desc` (most recent first)."),
})

const listSessionTraces = sessionEndpoint({
  route: createRoute({
    method: "get",
    path: "/{sessionId}/traces",
    name: "listSessionTraces",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "listTraces",
    summary: "List session traces",
    description:
      "Returns a cursor-paginated page of the traces that belong to the session. Rows match the trace list shape and exclude per-message LLM content — use `getTrace` for the full conversation view.",
    security: PROTECTED_SECURITY,
    request: { params: SessionParamsSchema, query: ListSessionTracesQuerySchema },
    responses: typedResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, sessionId } = input.params
      const query = input.query

      let cursor: { sortValue: string; traceId: string } | undefined
      if (query.cursor) {
        const decoded = decodeTraceCursor(query.cursor)
        if (!decoded) {
          return yield* new BadRequestError({ message: "Invalid `cursor` value." })
        }
        cursor = decoded
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)

      const filters: FilterSet = { sessionId: [{ op: "eq", value: sessionId }] }

      const traceRepo = yield* TraceRepository
      const page = yield* traceRepo.listByProjectId({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId,
        options: {
          limit: query.limit,
          sortBy: query.sortBy,
          sortDirection: query.sortDirection,
          filters,
          ...(cursor ? { cursor } : {}),
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

// `listBySessionIds` keeps the heavy message payloads off this path.
const resolveSessionTraceIds = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: string
}) =>
  Effect.gen(function* () {
    const sessionRepo = yield* SessionRepository
    const sessions = yield* sessionRepo.listBySessionIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionIds: [SessionId(input.sessionId)],
    })
    const session = sessions[0]
    if (!session) return yield* new NotFoundError({ entity: "Session", id: input.sessionId })
    return session.traceIds.map((traceId) => TraceId(traceId))
  })

const listSessionSignals = sessionEndpoint({
  route: createRoute({
    method: "get",
    path: "/{sessionId}/signals",
    name: "listSessionSignals",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "listSignals",
    summary: "List session signals",
    description:
      "Returns the signals that occurred in the session, including each signal's `scoreEvidence` and occurrence stats scoped to the session's traces. Ordered by most recent occurrence first.",
    security: PROTECTED_SECURITY,
    request: { params: SessionParamsSchema },
    responses: typedResponses({ status: 200, schema: SessionSignalsSchema, description: "Signals of the session" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, sessionId } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)
      const orgId = OrganizationId(ctx.organization.id as string)

      const traceIds = yield* resolveSessionTraceIds({ organizationId: orgId, projectId, sessionId })

      const signals = yield* listSessionSignalsUseCase({ organizationId: orgId, projectId, traceIds })

      return {
        status: 200,
        body: { items: signals.map((s) => toSessionSignalResponse(s, ctx.organization.id as string)) },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(
        Layer.mergeAll(SessionRepositoryLive, ScoreAnalyticsRepositoryLive),
        ctx.clickhouse,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const getSessionSignal = sessionEndpoint({
  route: createRoute({
    method: "get",
    path: "/{sessionId}/signals/{signalSlug}",
    name: "getSessionSignal",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "getSignal",
    summary: "Get session signal",
    description:
      "Returns one signal by slug, including its `scoreEvidence` and occurrence stats scoped to the session. Returns 404 when the signal has no occurrences in the session.",
    security: PROTECTED_SECURITY,
    request: {
      params: SessionParamsSchema.extend({ signalSlug: z.string().describe("Signal slug.") }),
    },
    responses: typedResponses({ status: 200, schema: SessionSignalSchema, description: "Session signal" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, sessionId, signalSlug } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)
      const orgId = OrganizationId(ctx.organization.id as string)

      const traceIds = yield* resolveSessionTraceIds({ organizationId: orgId, projectId, sessionId })

      const signalRepo = yield* SignalRepository
      const signal = yield* signalRepo.findBySlug({ projectId, slug: signalSlug })

      const signals = yield* listSessionSignalsUseCase({ organizationId: orgId, projectId, traceIds })
      const match = signals.find((s) => s.id === (signal.id as string))
      if (!match) return yield* new NotFoundError({ entity: "Session signal", id: signalSlug })

      return { status: 200, body: toSessionSignalResponse(match, ctx.organization.id as string) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(
        Layer.mergeAll(SessionRepositoryLive, ScoreAnalyticsRepositoryLive),
        ctx.clickhouse,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const SessionMemoryQuerySchema = z.object({
  traceId: traceIdSchema
    .optional()
    .describe("Restrict the memory footprint to this trace of the session. Omit for the whole session."),
})

const SessionMemoryChangesQuerySchema = z.object({
  traceId: traceIdSchema
    .optional()
    .describe("Restrict the memory changes to this trace of the session. Omit for the whole session."),
})

const getSessionMemory = sessionEndpoint({
  route: createRoute({
    method: "get",
    path: "/{sessionId}/memory",
    name: "getSessionMemory",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "getMemory",
    summary: "Get session memory footprint",
    description:
      "Returns the session's memory footprint: per-record read, added, and removed token metrics plus session-wide totals. Pass `traceId` to restrict the footprint to a single trace of the session.",
    security: PROTECTED_SECURITY,
    request: { params: SessionParamsSchema, query: SessionMemoryQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: SessionMemorySummarySchema,
      description: "Session memory footprint",
    }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, sessionId } = input.params
      const { traceId } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const summary = yield* computeSessionMemorySummaryUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        sessionId: SessionId(sessionId),
        ...(traceId ? { traceId: TraceId(traceId) } : {}),
      })
      return { status: 200, body: toSessionMemorySummaryResponse(summary) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getSessionMemoryChanges = sessionEndpoint({
  route: createRoute({
    method: "get",
    path: "/{sessionId}/memory/changes",
    name: "getSessionMemoryChanges",
    tags: ["Sessions"],
    group: "sessions",
    sdkMethod: "getMemoryChanges",
    summary: "Get session memory changes",
    description:
      "Returns the memory writes the session made as per-record before/after diffs. Pass `traceId` to restrict to a single trace of the session.",
    security: PROTECTED_SECURITY,
    request: { params: SessionParamsSchema, query: SessionMemoryChangesQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: SessionMemoryChangesSchema,
      description: "Session memory changes",
    }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, sessionId } = input.params
      const { traceId } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const diff = yield* computeSessionMemoryDiffUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        sessionId: SessionId(sessionId),
        ...(traceId ? { traceId: TraceId(traceId) } : {}),
      })
      return { status: 200, body: toSessionMemoryChangesResponse(diff) } as const
    }).pipe(
      withPostgres(ProjectRepositoryLive, ctx.postgresClient, ctx.organization.id),
      withClickHouse(MemoryRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

export const sessionsModule: OperationModule = {
  path: sessionsPath,
  operations: [
    listSessions,
    getSessionAnalytics,
    getSession,
    listSessionTraces,
    listSessionSignals,
    getSessionSignal,
    getSessionMemory,
    getSessionMemoryChanges,
  ],
}
