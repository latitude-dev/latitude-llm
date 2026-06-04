import { monitorIssueUseCase, unmonitorIssueUseCase } from "@domain/evaluations"
import {
  applyIssueLifecycleCommandUseCase,
  embedIssueSearchQueryUseCase,
  getIssueAnalyticsUseCase,
  getIssueDetailsUseCase,
  getIssueTrendUseCase,
  type IssueLifecycleCommand,
  IssueRepository,
  listIssuesUseCase,
  listIssueTracesUseCase,
} from "@domain/issues"
import { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import { WorkflowQuerier, WorkflowStarter } from "@domain/queue"
import { BadRequestError, cuidSchema, IssueId, OrganizationId, ProjectId, UserId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  IssueDetailSchema,
  IssueHistogramSchema,
  PaginatedIssuesSchema,
  toIssueDetailResponse,
  toIssueHistogramResponse,
  toIssueResponse,
} from "../openapi/entities/issue.ts"
import { IssueAnalyticsResponseSchema, toIssueAnalyticsResponse } from "../openapi/entities/issue-analytics.ts"
import { fetchTraceIndicators, PaginatedTracesSchema, toTraceResponse } from "../openapi/entities/trace.ts"
import { PaginatedQueryParamsSchema } from "../openapi/pagination.ts"
import { jsonBody, openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const issuesFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "issues",
    "x-fern-sdk-method-name": methodName,
  }) as const

const IssueSlugParamsSchema = ProjectParamsSchema.extend({
  issueSlug: z.string().describe("Issue slug."),
})

// Opaque cursor over the wire — base64url JSON of `{ offset: number }`.
const encodeIssueOffsetCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url")

const decodeIssueOffsetCursor = (raw: string): number | null => {
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

const ISSUE_LIFECYCLE_GROUPS = ["active", "archived"] as const

const ExportBodySchema = z
  .object({
    recipient: z
      .email()
      .describe("Email address the download link is sent to. Must belong to a member of the requesting organization."),
    issueIds: z
      .array(cuidSchema)
      .optional()
      .describe("Restrict the export to this subset of issues. Omit to export every issue in the project."),
    lifecycleGroup: z
      .enum(ISSUE_LIFECYCLE_GROUPS)
      .optional()
      .describe('`"active"` for unresolved/unignored issues; `"archived"` for the rest. Omit to include both.'),
  })
  .openapi("ExportIssuesBody")

const ExportResponseSchema = z
  .object({
    status: z.literal("queued").describe('Always `"queued"`. The CSV is emailed to `recipient` when ready.'),
  })
  .openapi("ExportIssuesResponse")

const LifecycleBodySchema = z
  .object({
    issueIds: z
      .array(cuidSchema)
      .min(1)
      .describe("Non-empty list of issue ids. Operations are idempotent — already-applied issues are unchanged."),
  })
  .openapi("IssuesLifecycleBody")

const ResolveBodySchema = LifecycleBodySchema.extend({
  keepMonitoring: z
    .boolean()
    .optional()
    .describe(
      "When `true`, monitoring continues after the issues are resolved. When `false`, monitoring stops. Defaults to the project setting.",
    ),
}).openapi("ResolveIssuesBody")

const LifecycleItemSchema = z
  .object({
    issueId: cuidSchema.describe("Issue this entry applies to."),
    resolvedAt: z.string().nullable().describe("ISO-8601 timestamp at which the issue was resolved, or `null`."),
    ignoredAt: z.string().nullable().describe("ISO-8601 timestamp at which the issue was ignored, or `null`."),
    updatedAt: z.string().describe("ISO-8601 timestamp of the last update."),
    changed: z
      .boolean()
      .describe("`true` when this call changed the issue, `false` when it was already in that state."),
  })
  .openapi("IssueLifecycleItem")

const LifecycleResponseSchema = z
  .object({
    items: z.array(LifecycleItemSchema).describe("Per-issue result, in the order requested."),
  })
  .openapi("IssuesLifecycleResponse")

export const issuesPath = "/projects/:projectSlug/issues"

const issueEndpoint = defineApiEndpoint<OrganizationScopedEnv>(issuesPath)

const buildLifecycleEndpoint = ({
  command,
  name,
  fernMethod,
  pathSuffix,
  summary,
  description,
  bodySchema,
}: {
  command: IssueLifecycleCommand
  name: string
  fernMethod: string
  pathSuffix: "/resolve" | "/unresolve" | "/ignore" | "/unignore"
  summary: string
  description: string
  bodySchema: typeof LifecycleBodySchema | typeof ResolveBodySchema
}) =>
  issueEndpoint({
    route: createRoute({
      method: "post",
      path: pathSuffix,
      name,
      tags: ["Issues"],
      ...issuesFernGroup(fernMethod),
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

          return yield* applyIssueLifecycleCommandUseCase({
            projectId: project.id,
            issueIds: body.issueIds.map((id) => IssueId(id)),
            command,
            ...(command === "resolve" && "keepMonitoring" in body && body.keepMonitoring !== undefined
              ? { keepMonitoring: body.keepMonitoring }
              : {}),
          })
        }).pipe(
          withPostgres(
            Layer.mergeAll(
              ProjectRepositoryLive,
              IssueRepositoryLive,
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
            issueId: item.issueId,
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

const resolveIssues = buildLifecycleEndpoint({
  command: "resolve",
  name: "resolveIssues",
  fernMethod: "resolve",
  pathSuffix: "/resolve",
  summary: "Resolve issues",
  description:
    "Marks each issue in `issueIds` as resolved. When `keepMonitoring` is `false`, monitoring is also stopped for each resolved issue; when omitted, the project's default applies.",
  bodySchema: ResolveBodySchema,
})

const unresolveIssues = buildLifecycleEndpoint({
  command: "unresolve",
  name: "unresolveIssues",
  fernMethod: "unresolve",
  pathSuffix: "/unresolve",
  summary: "Unresolve issues",
  description: "Reverts each issue in `issueIds` to the unresolved state.",
  bodySchema: LifecycleBodySchema,
})

const ignoreIssues = buildLifecycleEndpoint({
  command: "ignore",
  name: "ignoreIssues",
  fernMethod: "ignore",
  pathSuffix: "/ignore",
  summary: "Ignore issues",
  description: "Marks each issue in `issueIds` as ignored. Monitoring is also stopped for each ignored issue.",
  bodySchema: LifecycleBodySchema,
})

const unignoreIssues = buildLifecycleEndpoint({
  command: "unignore",
  name: "unignoreIssues",
  fernMethod: "unignore",
  pathSuffix: "/unignore",
  summary: "Unignore issues",
  description: "Reverts each issue in `issueIds` to a non-ignored state.",
  bodySchema: LifecycleBodySchema,
})

const ISSUE_LIFECYCLE_GROUP_VALUES = ["active", "archived"] as const
const ISSUES_SORT_FIELDS = ["lastSeen", "occurrences", "state"] as const

const ListIssuesQuerySchema = PaginatedQueryParamsSchema.extend({
  query: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("Free-text semantic search across the issues' names and descriptions."),
  lifecycleGroup: z
    .enum(ISSUE_LIFECYCLE_GROUP_VALUES)
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

const listIssues = issueEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listIssues",
    tags: ["Issues"],
    ...issuesFernGroup("list"),
    summary: "List project issues",
    description:
      "Returns a cursor-paginated page of issues in the project. Each item includes lifecycle `states` plus time-window stats: `firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedTracesPercent`, `trend`, and `tags`.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: ListIssuesQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedIssuesSchema, description: "Page of issues" }),
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
          const decoded = decodeIssueOffsetCursor(query.cursor)
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
          ? yield* embedIssueSearchQueryUseCase({
              organizationId: orgId,
              projectId: project.id,
              query: query.query,
            })
          : undefined

        const result = yield* listIssuesUseCase({
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
          Layer.mergeAll(ProjectRepositoryLive, IssueRepositoryLive, EvaluationRepositoryLive),
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
        items: page.result.items.map((item) => toIssueResponse(item, organizationId as string)),
        nextCursor: page.result.hasMore ? encodeIssueOffsetCursor(page.offset + page.result.items.length) : null,
        hasMore: page.result.hasMore,
      },
      200,
    )
  },
})

const IssueAnalyticsQuerySchema = z.object({
  fromIso: z.iso
    .datetime()
    .optional()
    .describe("Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive) of the time range. Defaults to now."),
})

const getIssueAnalytics = issueEndpoint({
  route: createRoute({
    method: "get",
    path: "/analytics",
    name: "getIssueAnalytics",
    tags: ["Issues"],
    ...issuesFernGroup("analytics"),
    summary: "Get project issue analytics",
    description:
      "Returns issue analytics for the project: counts of ongoing, new, escalating, regressed, and resolved issues, plus total occurrences and a per-bucket occurrence series. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: IssueAnalyticsQuerySchema },
    responses: openApiResponses({
      status: 200,
      schema: IssueAnalyticsResponseSchema,
      description: "Issue analytics",
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

        return yield* getIssueAnalyticsUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          ...(fromIso ? { from: new Date(fromIso) } : {}),
          ...(toIso ? { to: new Date(toIso) } : {}),
        })
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, IssueRepositoryLive), c.var.postgresClient, organizationId),
        withClickHouse(ScoreAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toIssueAnalyticsResponse(analytics), 200)
  },
})

const getIssue = issueEndpoint({
  route: createRoute({
    method: "get",
    path: "/{issueSlug}",
    name: "getIssue",
    tags: ["Issues"],
    ...issuesFernGroup("get"),
    summary: "Get project issue",
    description:
      "Returns the full-history detail view of one issue: lifecycle `states`, lifetime activity stats (`firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedTracesPercent`, `tags`), a 14-day occurrence `trend`, the active `evaluations` monitoring it, and the current `monitoringState`.",
    security: PROTECTED_SECURITY,
    request: { params: IssueSlugParamsSchema },
    responses: openApiResponses({ status: 200, schema: IssueDetailSchema, description: "Issue" }),
  }),
  handler: async (c) => {
    const { projectSlug, issueSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const details = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const issueRepo = yield* IssueRepository
        const issue = yield* issueRepo.findBySlug({ projectId: project.id, slug: issueSlug })

        return yield* getIssueDetailsUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: project.id,
          issueId: IssueId(issue.id as string),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, IssueRepositoryLive, EvaluationRepositoryLive),
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

    return c.json(toIssueDetailResponse(details, organizationId as string), 200)
  },
})

const TimeRangeQuerySchema = z.object({
  fromIso: z.iso.datetime().optional().describe("Lower bound (inclusive). Defaults to ~14 days before `toIso`."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive). Defaults to now."),
})

const getIssueTrend = issueEndpoint({
  route: createRoute({
    method: "get",
    path: "/{issueSlug}/trend",
    name: "getIssueTrend",
    tags: ["Issues"],
    ...issuesFernGroup("trend"),
    summary: "Get issue occurrence histogram",
    description:
      "Returns the occurrence histogram for one issue over `[fromIso, toIso]`. The default range is the trailing 14 days. Buckets are 12-hour wide and UTC-aligned.",
    security: PROTECTED_SECURITY,
    request: { params: IssueSlugParamsSchema, query: TimeRangeQuerySchema },
    responses: openApiResponses({ status: 200, schema: IssueHistogramSchema, description: "Occurrence histogram" }),
  }),
  handler: async (c) => {
    const { projectSlug, issueSlug } = c.req.valid("param")
    const { fromIso, toIso } = c.req.valid("query")
    const organizationId = c.var.organization.id

    const trend = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const issueRepo = yield* IssueRepository
        const issue = yield* issueRepo.findBySlug({ projectId: project.id, slug: issueSlug })

        return yield* getIssueTrendUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: project.id,
          issueId: IssueId(issue.id as string),
          ...(fromIso ? { from: new Date(fromIso) } : {}),
          ...(toIso ? { to: new Date(toIso) } : {}),
        })
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, IssueRepositoryLive), c.var.postgresClient, organizationId),
        withClickHouse(ScoreAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toIssueHistogramResponse(trend), 200)
  },
})

const ListIssueTracesQuerySchema = PaginatedQueryParamsSchema

const listIssueTraces = issueEndpoint({
  route: createRoute({
    method: "get",
    path: "/{issueSlug}/traces",
    name: "listIssueTraces",
    tags: ["Issues"],
    ...issuesFernGroup("listTraces"),
    summary: "List issue traces",
    description:
      "Returns the page of distinct traces that contributed at least one occurrence of the issue, ordered by most recent activity first.",
    security: PROTECTED_SECURITY,
    request: { params: IssueSlugParamsSchema, query: ListIssueTracesQuerySchema },
    responses: openApiResponses({ status: 200, schema: PaginatedTracesSchema, description: "Page of traces" }),
  }),
  handler: async (c) => {
    const { projectSlug, issueSlug } = c.req.valid("param")
    const query = c.req.valid("query")
    const organizationId = c.var.organization.id

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        let offset = 0
        if (query.cursor) {
          const decoded = decodeIssueOffsetCursor(query.cursor)
          if (decoded === null) {
            return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          }
          offset = decoded
        }

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const issueRepo = yield* IssueRepository
        const issue = yield* issueRepo.findBySlug({ projectId: project.id, slug: issueSlug })

        const result = yield* listIssueTracesUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: project.id,
          issueId: IssueId(issue.id as string),
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
          Layer.mergeAll(ProjectRepositoryLive, IssueRepositoryLive, ScoreRepositoryLive),
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
        nextCursor: page.result.hasMore ? encodeIssueOffsetCursor(page.offset + page.result.items.length) : null,
        hasMore: page.result.hasMore,
      },
      200,
    )
  },
})

const exportIssues = issueEndpoint({
  route: createRoute({
    method: "post",
    path: "/export",
    name: "exportIssues",
    tags: ["Issues"],
    ...issuesFernGroup("export"),
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
          ...(body.issueIds && body.issueIds.length > 0
            ? { selection: { mode: "selected" as const, rowIds: body.issueIds as readonly string[] } }
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
  .openapi("MonitorIssueResponse")

const monitorIssue = issueEndpoint({
  route: createRoute({
    method: "post",
    path: "/{issueSlug}/monitor",
    name: "monitorIssue",
    tags: ["Issues"],
    ...issuesFernGroup("monitor"),
    summary: "Monitor issue",
    description:
      "Starts (or realigns) monitoring for the issue. When the issue has no active evaluation, a new one is generated. When an active evaluation exists, the call realigns it. The work runs asynchronously and the response returns immediately. Returns 400 when monitoring is already in progress for this issue.",
    security: PROTECTED_SECURITY,
    request: { params: IssueSlugParamsSchema },
    responses: openApiResponses({ status: 202, schema: MonitorResponseSchema, description: "Monitor job enqueued" }),
  }),
  handler: async (c) => {
    const { projectSlug, issueSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id
    const actorUserId = c.var.auth?.method === "oauth" ? UserId(c.var.auth.userId as string) : undefined

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const issueRepo = yield* IssueRepository
        const issue = yield* issueRepo.findBySlug({ projectId: project.id, slug: issueSlug })

        return yield* monitorIssueUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          issueId: IssueId(issue.id as string),
          isAutomaticallyMonitored: issue.source === "flagger",
          ...(actorUserId !== undefined ? { actorUserId } : {}),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, IssueRepositoryLive, EvaluationRepositoryLive, OutboxEventWriterLive),
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

const unmonitorIssue = issueEndpoint({
  route: createRoute({
    method: "post",
    path: "/{issueSlug}/unmonitor",
    name: "unmonitorIssue",
    tags: ["Issues"],
    ...issuesFernGroup("unmonitor"),
    summary: "Unmonitor issue",
    description:
      "Stops monitoring the issue. Idempotent — issues that aren't being monitored return 204 without changing anything.",
    security: PROTECTED_SECURITY,
    request: { params: IssueSlugParamsSchema },
    responses: { 204: { description: "Issue unmonitored" } },
  }),
  handler: async (c) => {
    const { projectSlug, issueSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        const issueRepo = yield* IssueRepository
        const issue = yield* issueRepo.findBySlug({ projectId: project.id, slug: issueSlug })

        yield* unmonitorIssueUseCase({
          projectId: ProjectId(project.id as string),
          issueId: IssueId(issue.id as string),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, IssueRepositoryLive, EvaluationRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withTracing,
      ),
    )

    return c.body(null, 204)
  },
})

export const createIssuesRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  listIssues.mountHttp(app, createTierRateLimiter("low"))
  getIssueAnalytics.mountHttp(app, createTierRateLimiter("medium"))
  getIssue.mountHttp(app, createTierRateLimiter("low"))
  getIssueTrend.mountHttp(app, createTierRateLimiter("medium"))
  listIssueTraces.mountHttp(app, createTierRateLimiter("medium"))
  resolveIssues.mountHttp(app, createTierRateLimiter("medium"))
  unresolveIssues.mountHttp(app, createTierRateLimiter("medium"))
  ignoreIssues.mountHttp(app, createTierRateLimiter("medium"))
  unignoreIssues.mountHttp(app, createTierRateLimiter("medium"))
  monitorIssue.mountHttp(app, createTierRateLimiter("critical"))
  unmonitorIssue.mountHttp(app, createTierRateLimiter("medium"))
  exportIssues.mountHttp(app, createTierRateLimiter("critical"))
  return app
}
