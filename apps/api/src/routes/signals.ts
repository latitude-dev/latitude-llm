import { monitorSignalUseCase, unmonitorSignalUseCase } from "@domain/evaluations"
import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { WorkflowQuerier, WorkflowStarter } from "@domain/queue"
import { BadRequestError, cuidSchema, OrganizationId, ProjectId, SignalId, UserId } from "@domain/shared"
import {
  applySignalLifecycleCommandUseCase,
  embedSignalSearchQueryUseCase,
  getSignalAnalyticsUseCase,
  getSignalDetailsUseCase,
  getSignalTrendUseCase,
  listSignalsUseCase,
  listSignalTracesUseCase,
  type SignalLifecycleCommand,
  SignalRepository,
} from "@domain/signals"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { AIEmbedLive, withAi } from "@platform/ai"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  PaginatedSignalsSchema,
  SignalDetailSchema,
  SignalHistogramSchema,
  toSignalDetailResponse,
  toSignalHistogramResponse,
  toSignalResponse,
} from "../openapi/entities/signal.ts"
import { SignalAnalyticsResponseSchema, toSignalAnalyticsResponse } from "../openapi/entities/signal-analytics.ts"
import { fetchTraceIndicators, PaginatedTracesSchema, toTraceResponse } from "../openapi/entities/trace.ts"
import { PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import { jsonBody, openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const signalsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "signals",
    "x-fern-sdk-method-name": methodName,
  }) as const

const SignalSlugParamsSchema = ProjectParamsSchema.extend({
  signalSlug: z.string().describe("Signal slug."),
})

// Opaque cursor over the wire — base64url JSON of `{ offset: number }`.
const encodeSignalOffsetCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url")

const decodeSignalOffsetCursor = (raw: string): number | null => {
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

const SIGNAL_LIFECYCLE_GROUPS = ["active", "archived"] as const

const ExportBodySchema = z
  .object({
    recipient: z
      .email()
      .describe("Email address the download link is sent to. Must belong to a member of the requesting organization."),
    signalIds: z
      .array(cuidSchema)
      .optional()
      .describe("Restrict the export to this subset of issues. Omit to export every issue in the project."),
    lifecycleGroup: z
      .enum(SIGNAL_LIFECYCLE_GROUPS)
      .optional()
      .describe('`"active"` for unresolved/unignored issues; `"archived"` for the rest. Omit to include both.'),
  })
  .openapi("ExportSignalsBody")

const ExportResponseSchema = z
  .object({
    status: z.literal("queued").describe('Always `"queued"`. The CSV is emailed to `recipient` when ready.'),
  })
  .openapi("ExportSignalsResponse")

const LifecycleBodySchema = z
  .object({
    signalIds: z
      .array(cuidSchema)
      .min(1)
      .describe("Non-empty list of issue ids. Operations are idempotent — already-applied issues are unchanged."),
  })
  .openapi("SignalsLifecycleBody")

const ResolveBodySchema = LifecycleBodySchema.extend({
  keepMonitoring: z
    .boolean()
    .optional()
    .describe(
      "When `true`, monitoring continues after the issues are resolved. When `false`, monitoring stops. Defaults to the project setting.",
    ),
}).openapi("ResolveSignalsBody")

const LifecycleItemSchema = z
  .object({
    signalId: cuidSchema.describe("Signal this entry applies to."),
    resolvedAt: z.string().nullable().describe("ISO-8601 timestamp at which the issue was resolved, or `null`."),
    ignoredAt: z.string().nullable().describe("ISO-8601 timestamp at which the issue was ignored, or `null`."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
    changed: z
      .boolean()
      .describe("`true` when this call changed the issue, `false` when it was already in that state."),
  })
  .openapi("SignalLifecycleItem")

const LifecycleResponseSchema = z
  .object({
    items: z.array(LifecycleItemSchema).describe("Per-issue result, in the order requested."),
  })
  .openapi("SignalsLifecycleResponse")

export const signalsPath = "/projects/:projectSlug/signals"

const signalEndpoint = defineApiEndpoint<OrganizationScopedEnv>(signalsPath)

const buildLifecycleEndpoint = ({
  command,
  name,
  fernMethod,
  pathSuffix,
  summary,
  description,
  bodySchema,
}: {
  command: SignalLifecycleCommand
  name: string
  fernMethod: string
  pathSuffix: "/resolve" | "/unresolve" | "/ignore" | "/unignore"
  summary: string
  description: string
  bodySchema: typeof LifecycleBodySchema | typeof ResolveBodySchema
}) =>
  signalEndpoint({
    route: createRoute({
      method: "post",
      path: pathSuffix,
      name,
      tags: ["Signals"],
      ...signalsFernGroup(fernMethod),
      summary,
      description,
      security: PROTECTED_SECURITY,
      request: { params: ProjectParamsSchema, body: jsonBody(bodySchema) },
      responses: openApiResponses({ status: 200, schema: LifecycleResponseSchema, description: "Per-issue result" }),
    }),
    handler: async (c) => {
      const { projectSlug } = c.req.valid("param")
      const body = c.req.valid("json")
      const organizationId = c.var.organization.id

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const projectRepo = yield* ProjectRepository
          const project = yield* projectRepo.findBySlug(projectSlug)

          return yield* applySignalLifecycleCommandUseCase({
            projectId: project.id,
            signalIds: body.signalIds.map((id) => SignalId(id)),
            command,
            ...(command === "resolve" && "keepMonitoring" in body && body.keepMonitoring !== undefined
              ? { keepMonitoring: body.keepMonitoring }
              : {}),
          })
        }).pipe(
          withPostgres(
            Layer.mergeAll(
              ProjectRepositoryLive,
              SignalRepositoryLive,
              EvaluationRepositoryLive,
              OutboxEventWriterLive,
              SettingsReaderLive,
            ),
            c.var.postgresClient,
            organizationId,
          ),
          withTracing,
        ),
      )

      return c.json(
        {
          items: result.items.map((item) => ({
            signalId: item.signalId,
            resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
            ignoredAt: item.ignoredAt ? item.ignoredAt.toISOString() : null,
            updatedAt: item.updatedAt.toISOString(),
            changed: item.changed,
          })),
        },
        200,
      )
    },
  })

const resolveSignals = buildLifecycleEndpoint({
  command: "resolve",
  name: "resolveSignals",
  fernMethod: "resolve",
  pathSuffix: "/resolve",
  summary: "Resolve issues",
  description:
    "Marks each issue in `signalIds` as resolved. When `keepMonitoring` is `false`, monitoring is also stopped for each resolved issue; when omitted, the project's default applies.",
  bodySchema: ResolveBodySchema,
})

const unresolveSignals = buildLifecycleEndpoint({
  command: "unresolve",
  name: "unresolveSignals",
  fernMethod: "unresolve",
  pathSuffix: "/unresolve",
  summary: "Unresolve issues",
  description: "Reverts each issue in `signalIds` to the unresolved state.",
  bodySchema: LifecycleBodySchema,
})

const ignoreSignals = buildLifecycleEndpoint({
  command: "ignore",
  name: "ignoreSignals",
  fernMethod: "ignore",
  pathSuffix: "/ignore",
  summary: "Ignore issues",
  description: "Marks each issue in `signalIds` as ignored. Monitoring is also stopped for each ignored issue.",
  bodySchema: LifecycleBodySchema,
})

const unignoreSignals = buildLifecycleEndpoint({
  command: "unignore",
  name: "unignoreSignals",
  fernMethod: "unignore",
  pathSuffix: "/unignore",
  summary: "Unignore issues",
  description: "Reverts each issue in `signalIds` to a non-ignored state.",
  bodySchema: LifecycleBodySchema,
})

const SIGNAL_LIFECYCLE_GROUP_VALUES = ["active", "archived"] as const
const ISSUES_SORT_FIELDS = ["lastSeen", "occurrences", "state"] as const

const ListSignalsQuerySchema = PaginatedQueryParamsSchema.extend({
  query: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("Free-text semantic search across the issues' names and descriptions."),
  lifecycleGroup: z
    .enum(SIGNAL_LIFECYCLE_GROUP_VALUES)
    .optional()
    .describe('`"active"` for unresolved/unignored issues; `"archived"` for the rest. Omit to include both.'),
  sortBy: z
    .enum(ISSUES_SORT_FIELDS)
    .default("lastSeen")
    .describe(
      "Sort field. `lastSeen` orders by most recent occurrence; `occurrences` by total count in the time window; `state` by lifecycle priority.",
    ),
  sortDirection: z.enum(["asc", "desc"]).default("desc").describe("Sort direction. Defaults to `desc`."),
  fromIso: z.iso.datetime().optional().describe("Lower bound (inclusive) of the time window. Defaults to ~6 days ago."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive) of the time window. Defaults to now."),
})

const listSignals = signalEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listSignals",
    tags: ["Signals"],
    ...signalsFernGroup("list"),
    summary: "List project issues",
    description:
      "Returns a cursor-paginated page of issues in the project. Each item includes lifecycle `states` plus time-window stats: `firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedTracesPercent`, `trend`, and `tags`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListSignalsQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedSignalsSchema, description: "Page of issues" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id
    const orgId = OrganizationId(organizationId as string)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        let offset = 0
        if (query.cursor) {
          const decoded = decodeSignalOffsetCursor(query.cursor)
          if (decoded === null) {
            return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          }
          offset = decoded
        }

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const timeRange =
          query.fromIso || query.toIso
            ? {
                ...(query.fromIso ? { from: new Date(query.fromIso) } : {}),
                ...(query.toIso ? { to: new Date(query.toIso) } : {}),
              }
            : undefined

        const search = query.query
          ? yield* embedSignalSearchQueryUseCase({
              organizationId: orgId,
              projectId: project.id,
              query: query.query,
            })
          : undefined

        const result = yield* listSignalsUseCase({
          organizationId: orgId,
          projectId: project.id,
          limit: query.limit,
          offset,
          sort: { field: query.sortBy, direction: query.sortDirection },
          ...(query.lifecycleGroup ? { lifecycleGroup: query.lifecycleGroup } : {}),
          ...(timeRange ? { timeRange } : {}),
          ...(search ? { search } : {}),
        })
        return { result, offset }
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
          c.var.clickhouse,
          organizationId,
        ),
        withAi(AIEmbedLive, c.var.redis),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.result.items.map((item) => toSignalResponse(item, organizationId as string)),
        nextCursor: page.result.hasMore ? encodeSignalOffsetCursor(page.offset + page.result.items.length) : null,
        hasMore: page.result.hasMore,
      },
      200,
    )
  },
})

const SignalAnalyticsQuerySchema = z.object({
  fromIso: z.iso
    .datetime()
    .optional()
    .describe("Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive) of the time range. Defaults to now."),
})

const getSignalAnalytics = signalEndpoint({
  route: createRoute({
    method: "get",
    path: "/analytics",
    name: "getSignalAnalytics",
    tags: ["Signals"],
    ...signalsFernGroup("analytics"),
    summary: "Get project issue analytics",
    description:
      "Returns issue analytics for the project: counts of ongoing, new, escalating, regressed, and resolved issues, plus total occurrences and a per-bucket occurrence series. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: SignalAnalyticsQuerySchema },
    responses: openApiResponses({
      status: 200,
      schema: SignalAnalyticsResponseSchema,
      description: "Signal analytics",
    }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const { fromIso, toIso } = c.req.valid("query")
    const organizationId = c.var.organization.id

    if (fromIso && toIso && Date.parse(toIso) < Date.parse(fromIso)) {
      return c.json({ error: "`toIso` must be greater than or equal to `fromIso`." }, 400)
    }

    const analytics = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        return yield* getSignalAnalyticsUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          ...(fromIso ? { from: new Date(fromIso) } : {}),
          ...(toIso ? { to: new Date(toIso) } : {}),
        })
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive), c.var.postgresClient, organizationId),
        withClickHouse(ScoreAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toSignalAnalyticsResponse(analytics), 200)
  },
})

const getSignal = signalEndpoint({
  route: createRoute({
    method: "get",
    path: "/{signalSlug}",
    name: "getSignal",
    tags: ["Signals"],
    ...signalsFernGroup("get"),
    summary: "Get project issue",
    description:
      "Returns the full-history detail view of one issue: lifecycle `states`, lifetime activity stats (`firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedTracesPercent`, `tags`), a 14-day occurrence `trend`, the active `evaluations` monitoring it, and the current `monitoringState`.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: SignalDetailSchema, description: "Signal" }),
  }),
  handler: async (c) => {
    const { projectSlug, signalSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const details = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const signalRepo = yield* SignalRepository
        const issue = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

        return yield* getSignalDetailsUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: project.id,
          signalId: SignalId(issue.id as string),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
          c.var.clickhouse,
          organizationId,
        ),
        Effect.provide(Layer.succeed(WorkflowQuerier, c.var.workflowQuerier)),
        withTracing,
      ),
    )

    return c.json(toSignalDetailResponse(details, organizationId as string), 200)
  },
})

const TimeRangeQuerySchema = z.object({
  fromIso: z.iso.datetime().optional().describe("Lower bound (inclusive). Defaults to ~14 days before `toIso`."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive). Defaults to now."),
})

const getSignalTrend = signalEndpoint({
  route: createRoute({
    method: "get",
    path: "/{signalSlug}/trend",
    name: "getSignalTrend",
    tags: ["Signals"],
    ...signalsFernGroup("trend"),
    summary: "Get issue occurrence histogram",
    description:
      "Returns the occurrence histogram for one issue over `[fromIso, toIso]`. The default range is the trailing 14 days. Buckets are 12-hour wide and UTC-aligned.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema, query: TimeRangeQuerySchema },
    responses: openApiResponses({ status: 200, schema: SignalHistogramSchema, description: "Occurrence histogram" }),
  }),
  handler: async (c) => {
    const { projectSlug, signalSlug } = c.req.valid("param")
    const { fromIso, toIso } = c.req.valid("query")
    const organizationId = c.var.organization.id

    const trend = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const signalRepo = yield* SignalRepository
        const issue = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

        return yield* getSignalTrendUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: project.id,
          signalId: SignalId(issue.id as string),
          ...(fromIso ? { from: new Date(fromIso) } : {}),
          ...(toIso ? { to: new Date(toIso) } : {}),
        })
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive), c.var.postgresClient, organizationId),
        withClickHouse(ScoreAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toSignalHistogramResponse(trend), 200)
  },
})

const ListSignalTracesQuerySchema = PaginatedQueryParamsSchema

const listSignalTraces = signalEndpoint({
  route: createRoute({
    method: "get",
    path: "/{signalSlug}/traces",
    name: "listSignalTraces",
    tags: ["Signals"],
    ...signalsFernGroup("listTraces"),
    summary: "List issue traces",
    description:
      "Returns the page of distinct traces that contributed at least one occurrence of the issue, ordered by most recent activity first.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema, query: ListSignalTracesQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  handler: async (c) => {
    const { projectSlug, signalSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        let offset = 0
        if (query.cursor) {
          const decoded = decodeSignalOffsetCursor(query.cursor)
          if (decoded === null) {
            return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          }
          offset = decoded
        }

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const signalRepo = yield* SignalRepository
        const issue = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

        const result = yield* listSignalTracesUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: project.id,
          signalId: SignalId(issue.id as string),
          limit: query.limit,
          offset,
        })

        const indicators = yield* fetchTraceIndicators({
          projectId: project.id,
          traceIds: result.items.map((trace) => trace.traceId),
        })

        return { result, offset, indicators }
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, ScoreRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
          c.var.clickhouse,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.result.items.map((trace) => toTraceResponse(trace, page.indicators)),
        nextCursor: page.result.hasMore ? encodeSignalOffsetCursor(page.offset + page.result.items.length) : null,
        hasMore: page.result.hasMore,
      },
      200,
    )
  },
})

const exportSignals = signalEndpoint({
  route: createRoute({
    method: "post",
    path: "/export",
    name: "exportSignals",
    tags: ["Signals"],
    ...signalsFernGroup("export"),
    summary: "Export project issues (async)",
    description:
      "Enqueues an asynchronous CSV export. The response returns immediately; the download link is emailed to `recipient` when the file is ready. The recipient must be a member of the requesting organization.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(ExportBodySchema) },
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
          kind: "issues",
          organizationId: organizationId as string,
          projectId: project.id as string,
          recipientEmail: body.recipient,
          ...(body.signalIds && body.signalIds.length > 0
            ? { selection: { mode: "selected" as const, rowIds: body.signalIds as readonly string[] } }
            : {}),
          ...(body.lifecycleGroup ? { lifecycleGroup: body.lifecycleGroup } : {}),
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

const MonitorResponseSchema = z
  .object({
    jobId: cuidSchema.describe("Identifier of the monitor job."),
    evaluationId: cuidSchema
      .nullable()
      .describe("The id of the evaluation being realigned, or `null` when a brand-new evaluation is being generated."),
  })
  .openapi("MonitorSignalResponse")

const monitorSignal = signalEndpoint({
  route: createRoute({
    method: "post",
    path: "/{signalSlug}/monitor",
    name: "monitorSignal",
    tags: ["Signals"],
    ...signalsFernGroup("monitor"),
    summary: "Monitor issue",
    description:
      "Starts (or realigns) monitoring for the issue. When the issue has no active evaluation, a new one is generated. When an active evaluation exists, the call realigns it. The work runs asynchronously and the response returns immediately. Returns 400 when monitoring is already in progress for this issue.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema },
    responses: openApiResponses({ status: 202, schema: MonitorResponseSchema, description: "Monitor job enqueued" }),
  }),
  handler: async (c) => {
    const { projectSlug, signalSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id
    const actorUserId = c.var.auth?.method === "oauth" ? UserId(c.var.auth.userId as string) : undefined

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const signalRepo = yield* SignalRepository
        const issue = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

        return yield* monitorSignalUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          signalId: SignalId(issue.id as string),
          isAutomaticallyMonitored: issue.source === "flagger",
          ...(actorUserId !== undefined ? { actorUserId } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          organizationId,
        ),
        Effect.provide(Layer.succeed(WorkflowStarter, c.var.workflowStarter)),
        Effect.provide(Layer.succeed(WorkflowQuerier, c.var.workflowQuerier)),
        withTracing,
      ),
    )

    return c.json({ jobId: result.jobId, evaluationId: result.evaluationId }, 202)
  },
})

const unmonitorSignal = signalEndpoint({
  route: createRoute({
    method: "post",
    path: "/{signalSlug}/unmonitor",
    name: "unmonitorSignal",
    tags: ["Signals"],
    ...signalsFernGroup("unmonitor"),
    summary: "Unmonitor issue",
    description:
      "Stops monitoring the issue. Idempotent — issues that aren't being monitored return 204 without changing anything.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema },
    responses: { 204: { description: "Signal unmonitored" } },
  }),
  handler: async (c) => {
    const { projectSlug, signalSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const signalRepo = yield* SignalRepository
        const issue = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

        yield* unmonitorSignalUseCase({
          projectId: ProjectId(project.id as string),
          signalId: SignalId(issue.id as string),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.body(null, 204)
  },
})

export const createSignalsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listSignals.mountHttp(app, createTierRateLimiter("low"))
  getSignalAnalytics.mountHttp(app, createTierRateLimiter("medium"))
  getSignal.mountHttp(app, createTierRateLimiter("low"))
  getSignalTrend.mountHttp(app, createTierRateLimiter("medium"))
  listSignalTraces.mountHttp(app, createTierRateLimiter("medium"))
  resolveSignals.mountHttp(app, createTierRateLimiter("medium"))
  unresolveSignals.mountHttp(app, createTierRateLimiter("medium"))
  ignoreSignals.mountHttp(app, createTierRateLimiter("medium"))
  unignoreSignals.mountHttp(app, createTierRateLimiter("medium"))
  monitorSignal.mountHttp(app, createTierRateLimiter("critical"))
  unmonitorSignal.mountHttp(app, createTierRateLimiter("medium"))
  exportSignals.mountHttp(app, createTierRateLimiter("critical"))
  return app
}
