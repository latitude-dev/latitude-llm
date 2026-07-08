import { monitorSignalUseCase, unmonitorSignalUseCase } from "@domain/evaluations"
import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { WorkflowQuerier, WorkflowStarter } from "@domain/queue"
import {
  BadRequestError,
  cuidSchema,
  evaluationSettingsSchema,
  OrganizationId,
  ProjectId,
  SignalId,
  UserId,
} from "@domain/shared"
import {
  applySignalLifecycleCommandUseCase,
  createSignalUseCase,
  deleteSignalUseCase,
  embedSignalSearchQueryUseCase,
  getSignalAnalyticsUseCase,
  getSignalDetailsUseCase,
  getSignalTrendUseCase,
  listSignalsUseCase,
  listSignalTracesUseCase,
  SIGNAL_PRIORITIES,
  type SignalLifecycleCommand,
  SignalRepository,
  updateSignalUseCase,
} from "@domain/signals"
import { createRoute, z } from "@hono/zod-openapi"
import { AIEmbedLive, withAi } from "@platform/ai"
import {
  ScoreAnalyticsRepositoryLive,
  SessionRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
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
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation, type RateLimitTier } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
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
import {
  FilterSetSchema,
  jsonBody,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  typedResponses,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

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
      .describe("Restrict the export to this subset of signals. Omit to export every signal in the project."),
    lifecycleGroup: z
      .enum(SIGNAL_LIFECYCLE_GROUPS)
      .optional()
      .describe('`"active"` for unmuted signals; `"archived"` for muted signals. Omit to include both.'),
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
      .describe("Non-empty list of signal ids. Operations are idempotent — already-applied signals are unchanged."),
  })
  .openapi("SignalsLifecycleBody")

const LifecycleItemSchema = z
  .object({
    signalId: cuidSchema.describe("Signal this entry applies to."),
    mutedAt: z.string().nullable().describe("ISO-8601 timestamp at which the signal was muted, or `null`."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
    changed: z
      .boolean()
      .describe("`true` when this call changed the signal, `false` when it was already in that state."),
  })
  .openapi("SignalLifecycleItem")

const LifecycleResponseSchema = z
  .object({
    items: z.array(LifecycleItemSchema).describe("Per-signal result, in the order requested."),
  })
  .openapi("SignalsLifecycleResponse")

const signalsPath = "/projects/:projectSlug/signals"

const signalEndpoint = defineOperation<OrganizationScopedEnv>(signalsPath)

const buildLifecycleEndpoint = ({
  command,
  name,
  fernMethod,
  pathSuffix,
  summary,
  description,
  bodySchema,
  rateLimitTier,
}: {
  command: SignalLifecycleCommand
  name: string
  fernMethod: string
  pathSuffix: "/mute" | "/unmute"
  summary: string
  description: string
  bodySchema: typeof LifecycleBodySchema
  rateLimitTier: RateLimitTier
}) =>
  signalEndpoint({
    route: createRoute({
      method: "post",
      path: pathSuffix,
      name,
      tags: ["Signals"],
      group: "signals",
      sdkMethod: fernMethod,
      summary,
      description,
      security: PROTECTED_SECURITY,
      request: { params: ProjectParamsSchema, body: jsonBody(bodySchema) },
      responses: typedResponses({ status: 200, schema: LifecycleResponseSchema, description: "Per-signal result" }),
    }),
    access: "write",
    rateLimitTier,
    execute: (input, ctx) =>
      Effect.gen(function* () {
        const { projectSlug } = input.params
        const body = input.body

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const result = yield* applySignalLifecycleCommandUseCase({
          projectId: project.id,
          signalIds: body.signalIds.map((id) => SignalId(id)),
          command,
        })
        return {
          status: 200,
          body: {
            items: result.items.map((item) => ({
              signalId: item.signalId,
              mutedAt: item.mutedAt ? item.mutedAt.toISOString() : null,
              updatedAt: item.updatedAt.toISOString(),
              changed: item.changed,
            })),
          },
        } as const
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            ProjectRepositoryLive,
            SignalRepositoryLive,
            EvaluationRepositoryLive,
            OutboxEventWriterLive,
            SettingsReaderLive,
          ),
          ctx.postgresClient,
          ctx.organization.id,
        ),
        withTracing,
      ),
  })

const muteSignals = buildLifecycleEndpoint({
  command: "mute",
  name: "muteSignals",
  fernMethod: "mute",
  pathSuffix: "/mute",
  summary: "Mute signals",
  description: "Mutes each signal in `signalIds`.",
  bodySchema: LifecycleBodySchema,
  rateLimitTier: "medium",
})

const unmuteSignals = buildLifecycleEndpoint({
  command: "unmute",
  name: "unmuteSignals",
  fernMethod: "unmute",
  pathSuffix: "/unmute",
  summary: "Unmute signals",
  description: "Reverts each signal in `signalIds` to an unmuted state.",
  bodySchema: LifecycleBodySchema,
  rateLimitTier: "medium",
})

const SIGNAL_LIFECYCLE_GROUP_VALUES = ["active", "archived"] as const
const ISSUES_SORT_FIELDS = ["lastSeen", "occurrences", "state"] as const

const ListSignalsQuerySchema = PaginatedQueryParamsSchema.extend({
  query: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("Free-text semantic search across the signals' names and descriptions."),
  lifecycleGroup: z
    .enum(SIGNAL_LIFECYCLE_GROUP_VALUES)
    .optional()
    .describe('`"active"` for unmuted signals; `"archived"` for muted signals. Omit to include both.'),
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
    group: "signals",
    sdkMethod: "list",
    summary: "List project signals",
    description:
      "Returns a cursor-paginated page of signals in the project. Each item includes lifecycle `states` plus time-window stats: `firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedSessionsPercent`, `trend`, and `tags`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListSignalsQuerySchema },
    responses: typedResponses({ status: 200, schema: PaginatedSignalsSchema, description: "Page of signals" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const query = input.query
      const orgId = OrganizationId(ctx.organization.id as string)

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
      return {
        status: 200,
        body: {
          items: result.items.map((item) => toSignalResponse(item, ctx.organization.id as string)),
          nextCursor: result.hasMore ? encodeSignalOffsetCursor(offset + result.items.length) : null,
          hasMore: result.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(
        Layer.mergeAll(ScoreAnalyticsRepositoryLive, SessionRepositoryLive, TraceRepositoryLive),
        ctx.clickhouse,
        ctx.organization.id,
      ),
      withAi(AIEmbedLive, ctx.redis),
      withTracing,
    ),
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
    group: "signals",
    sdkMethod: "analytics",
    summary: "Get project signal analytics",
    description:
      "Returns signal analytics for the project: counts of ongoing, new, and escalating signals, plus total occurrences and a per-bucket occurrence series. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: SignalAnalyticsQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: SignalAnalyticsResponseSchema,
      description: "Signal analytics",
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

      const analytics = yield* getSignalAnalyticsUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        ...(fromIso ? { from: new Date(fromIso) } : {}),
        ...(toIso ? { to: new Date(toIso) } : {}),
      })
      return { status: 200, body: toSignalAnalyticsResponse(analytics) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(ScoreAnalyticsRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const getSignal = signalEndpoint({
  route: createRoute({
    method: "get",
    path: "/{signalSlug}",
    name: "getSignal",
    tags: ["Signals"],
    group: "signals",
    sdkMethod: "get",
    summary: "Get project signal",
    description:
      "Returns the full-history detail view of one signal: lifecycle `states`, lifetime activity stats (`firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedSessionsPercent`, `tags`), a 14-day occurrence `trend`, the active `evaluations` monitoring it, and the current `monitoringState`.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema },
    responses: typedResponses({ status: 200, schema: SignalDetailSchema, description: "Signal" }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, signalSlug } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const signalRepo = yield* SignalRepository
      const signal = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

      const details = yield* getSignalDetailsUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: project.id,
        signalId: SignalId(signal.id as string),
      })
      return { status: 200, body: toSignalDetailResponse(details, ctx.organization.id as string) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(
        Layer.mergeAll(ScoreAnalyticsRepositoryLive, SessionRepositoryLive),
        ctx.clickhouse,
        ctx.organization.id,
      ),
      Effect.provide(Layer.succeed(WorkflowQuerier, ctx.workflowQuerier)),
      withTracing,
    ),
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
    group: "signals",
    sdkMethod: "trend",
    summary: "Get signal occurrence histogram",
    description:
      "Returns the occurrence histogram for one signal over `[fromIso, toIso]`. The default range is the trailing 14 days. Buckets are 12-hour wide and UTC-aligned.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema, query: TimeRangeQuerySchema },
    responses: typedResponses({ status: 200, schema: SignalHistogramSchema, description: "Occurrence histogram" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, signalSlug } = input.params
      const { fromIso, toIso } = input.query

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const signalRepo = yield* SignalRepository
      const signal = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

      const trend = yield* getSignalTrendUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: project.id,
        signalId: SignalId(signal.id as string),
        ...(fromIso ? { from: new Date(fromIso) } : {}),
        ...(toIso ? { to: new Date(toIso) } : {}),
      })
      return { status: 200, body: toSignalHistogramResponse(trend) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(ScoreAnalyticsRepositoryLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

const ListSignalTracesQuerySchema = PaginatedQueryParamsSchema

const listSignalTraces = signalEndpoint({
  route: createRoute({
    method: "get",
    path: "/{signalSlug}/traces",
    name: "listSignalTraces",
    tags: ["Signals"],
    group: "signals",
    sdkMethod: "listTraces",
    summary: "List signal traces",
    description:
      "Returns the page of distinct traces that contributed at least one occurrence of the signal, ordered by most recent activity first.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema, query: ListSignalTracesQuerySchema },
    responses: typedResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, signalSlug } = input.params
      const query = input.query

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
      const signal = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

      const result = yield* listSignalTracesUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: project.id,
        signalId: SignalId(signal.id as string),
        limit: query.limit,
        offset,
      })

      const indicators = yield* fetchTraceIndicators({
        projectId: project.id,
        traceIds: result.items.map((trace) => trace.traceId),
      })

      return {
        status: 200,
        body: {
          items: result.items.map((trace) => toTraceResponse(trace, indicators)),
          nextCursor: result.hasMore ? encodeSignalOffsetCursor(offset + result.items.length) : null,
          hasMore: result.hasMore,
        },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, ScoreRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(
        Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive),
        ctx.clickhouse,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const exportSignals = signalEndpoint({
  route: createRoute({
    method: "post",
    path: "/export",
    name: "exportSignals",
    tags: ["Signals"],
    group: "signals",
    sdkMethod: "export",
    summary: "Export project signals (async)",
    description:
      "Enqueues an asynchronous CSV export. The response returns immediately; the download link is emailed to `recipient` when the file is ready. The recipient must be a member of the requesting organization.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(ExportBodySchema) },
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
        // KEEP: the export queue kind is a wire token retained until Phase 9.
        kind: "issues",
        organizationId: ctx.organization.id as string,
        projectId: project.id as string,
        recipientEmail: body.recipient,
        ...(body.signalIds && body.signalIds.length > 0
          ? { selection: { mode: "selected" as const, rowIds: body.signalIds as readonly string[] } }
          : {}),
        ...(body.lifecycleGroup ? { lifecycleGroup: body.lifecycleGroup } : {}),
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
    group: "signals",
    sdkMethod: "monitor",
    summary: "Monitor signal",
    description:
      "Starts (or realigns) monitoring for the signal. When the signal has no active evaluation, a new one is generated. When an active evaluation exists, the call realigns it. The work runs asynchronously and the response returns immediately. Returns 400 when monitoring is already in progress for this signal.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema },
    responses: typedResponses({ status: 202, schema: MonitorResponseSchema, description: "Monitor job enqueued" }),
  }),
  access: "write",
  rateLimitTier: "ultra",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, signalSlug } = input.params
      const actorUserId = ctx.auth.method === "oauth" ? UserId(ctx.auth.userId as string) : undefined

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const signalRepo = yield* SignalRepository
      const signal = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

      const result = yield* monitorSignalUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        signalId: SignalId(signal.id as string),
        isAutomaticallyMonitored: signal.source === "flagger",
        signalOrigin: signal.origin,
        ...(actorUserId !== undefined ? { actorUserId } : {}),
      })
      return { status: 202, body: { jobId: result.jobId, evaluationId: result.evaluationId } } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      Effect.provide(Layer.succeed(WorkflowStarter, ctx.workflowStarter)),
      Effect.provide(Layer.succeed(WorkflowQuerier, ctx.workflowQuerier)),
      withTracing,
    ),
})

const unmonitorSignal = signalEndpoint({
  route: createRoute({
    method: "post",
    path: "/{signalSlug}/unmonitor",
    name: "unmonitorSignal",
    tags: ["Signals"],
    group: "signals",
    sdkMethod: "unmonitor",
    summary: "Unmonitor signal",
    description:
      "Stops monitoring the signal. Idempotent — signals that aren't being monitored return 204 without changing anything.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema },
    responses: { 204: { description: "Signal unmonitored" } },
  }),
  access: "write",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, signalSlug } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)

      const signalRepo = yield* SignalRepository
      const signal = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })

      yield* unmonitorSignalUseCase({
        projectId: ProjectId(project.id as string),
        signalId: SignalId(signal.id as string),
      })
      return { status: 204 } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const SignalEvaluationBodySchema = z
  .union([
    z.object({
      settings: evaluationSettingsSchema.describe(
        "Declarative detector config. `judge` compiles to an LLM script; `rule` compiles to a deterministic script over the session.",
      ),
    }),
    z.object({
      script: z
        .string()
        .min(1)
        .describe("Raw sandbox evaluation script (advanced). Must compile in the QuickJS runtime."),
    }),
  ])
  .describe("The signal's membership detector. Provide exactly one of `settings` or `script`.")

const CreateSignalBodySchema = z
  .object({
    name: z.string().min(1).max(128).describe("Human-readable name. Used to derive the slug."),
    description: z.string().min(1).describe("What this signal captures."),
    priority: z.enum(SIGNAL_PRIORITIES).nullish().describe("Manual triage priority. Null/omitted leaves it unset."),
    filters: FilterSetSchema.nullish().describe(
      "Row-local pre-gate restricting which traces the evaluation runs against. Omitted = all traces.",
    ),
    evaluation: SignalEvaluationBodySchema,
  })
  .openapi("CreateSignalBody")

const UpdateSignalBodySchema = z
  .object({
    name: z.string().min(1).max(128).optional().describe("New name. Omitted leaves it unchanged."),
    description: z.string().min(1).optional().describe("New description. Omitted leaves it unchanged."),
    filters: FilterSetSchema.nullable()
      .optional()
      .describe("New evaluation pre-gate. Explicit `null` clears it; omitted leaves it unchanged."),
  })
  .openapi("UpdateSignalBody")

const CreateSignalResponseSchema = z
  .object({
    id: cuidSchema.describe("Created signal id."),
    slug: z.string().describe("URL-safe identifier; use it on the other signal endpoints."),
    evaluationId: cuidSchema.describe("Id of the signal's detector evaluation."),
  })
  .openapi("CreateSignalResponse")

const UpdateSignalResponseSchema = z
  .object({
    id: cuidSchema.describe("Updated signal id."),
    slug: z.string().describe("URL-safe identifier (stable across updates)."),
    changed: z.boolean().describe("Whether any field actually changed."),
  })
  .openapi("UpdateSignalResponse")

const createSignal = signalEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createSignal",
    tags: ["Signals"],
    group: "signals",
    sdkMethod: "create",
    summary: "Create signal",
    description:
      "Creates a user-defined signal with its membership detector — from `settings` (a `judge` LLM detector or a deterministic `rule`), or a raw `script` (advanced). The script is validated at save time (422 on a compile error). Detectors collect forward from creation; there is no historical backfill.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(CreateSignalBodySchema) },
    responses: typedResponses({ status: 201, schema: CreateSignalResponseSchema, description: "Signal created" }),
  }),
  access: "write",
  rateLimitTier: "ultra",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params
      const body = input.body

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const result = yield* createSignalUseCase({
        organizationId: ctx.organization.id as string,
        projectId: project.id as string,
        name: body.name,
        description: body.description,
        ...(body.priority != null ? { priority: body.priority } : {}),
        ...(body.filters != null ? { filters: body.filters } : {}),
        evaluation: body.evaluation,
      })
      return {
        status: 201,
        body: { id: result.signalId, slug: result.slug, evaluationId: result.evaluationId },
      } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      Effect.provide(QuickJsScriptRuntimeLive),
      withTracing,
    ),
})

const updateSignal = signalEndpoint({
  route: createRoute({
    method: "patch",
    path: "/{signalSlug}",
    name: "updateSignal",
    tags: ["Signals"],
    group: "signals",
    sdkMethod: "update",
    summary: "Update signal",
    description:
      "Updates a signal's name, description, and evaluation pre-gate `filters`. Filter changes apply forward-only — existing membership is never re-evaluated. The slug is stable.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema, body: jsonBody(UpdateSignalBodySchema) },
    responses: typedResponses({ status: 200, schema: UpdateSignalResponseSchema, description: "Signal updated" }),
  }),
  access: "destructive",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, signalSlug } = input.params
      const body = input.body

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const signalRepo = yield* SignalRepository
      const signal = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })
      const result = yield* updateSignalUseCase({
        projectId: project.id as string,
        signalId: SignalId(signal.id as string),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.filters !== undefined ? { filters: body.filters } : {}),
      })
      return { status: 200, body: { id: result.signalId, slug: signalSlug, changed: result.changed } } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

const deleteSignal = signalEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{signalSlug}",
    name: "deleteSignal",
    tags: ["Signals"],
    group: "signals",
    sdkMethod: "delete",
    summary: "Delete signal",
    description:
      "Soft-deletes a signal and archives its detector so it stops matching new traces. Existing scores are retained but excluded from reads; the slug becomes reusable.",
    security: PROTECTED_SECURITY,
    request: { params: SignalSlugParamsSchema },
    responses: { 204: { description: "Signal deleted" } },
  }),
  access: "destructive",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug, signalSlug } = input.params

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const signalRepo = yield* SignalRepository
      const signal = yield* signalRepo.findBySlug({ projectId: project.id, slug: signalSlug })
      yield* deleteSignalUseCase({ projectId: project.id as string, signalId: SignalId(signal.id as string) })
      return { status: 204 } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, EvaluationRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withTracing,
    ),
})

export const signalsModule: OperationModule = {
  path: signalsPath,
  operations: [
    listSignals,
    createSignal,
    updateSignal,
    deleteSignal,
    getSignalAnalytics,
    getSignal,
    getSignalTrend,
    listSignalTraces,
    muteSignals,
    unmuteSignals,
    monitorSignal,
    unmonitorSignal,
    exportSignals,
  ],
}
