import { ProjectRepository } from "@domain/projects"
import { ExternalUserId, OrganizationId, ProjectId } from "@domain/shared"
import { buildHistogramBucketScaffold, listUserSignalsUseCase } from "@domain/signals"
import { USER_SORT_FIELDS, UserAnalyticsRepository } from "@domain/spans"
import { listUserBehavioursUseCase } from "@domain/taxonomy"
import { createRoute, z } from "@hono/zod-openapi"
import {
  ScoreAnalyticsRepositoryLive,
  TaxonomyObservationRepositoryLive,
  UserAnalyticsRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  ProjectRepositoryLive,
  SignalRepositoryLive,
  TaxonomyClusterRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import {
  bucketSecondsForRange,
  resolveUserRange,
  toUserActivityResponse,
  toUserBehaviourResponse,
  toUserListResponse,
  toUserProfileResponse,
  toUserSignalResponse,
  toUsersOverviewResponse,
  toUserUsageResponse,
  UserActivityResponseSchema,
  UserBehavioursResponseSchema,
  UserListResponseSchema,
  UserProfileResponseSchema,
  UserSignalsResponseSchema,
  UsersOverviewResponseSchema,
  UserUsageResponseSchema,
} from "../openapi/entities/user.ts"
import { openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const usersPath = "/projects/:projectSlug/users"

const userEndpoint = defineOperation<OrganizationScopedEnv>(usersPath)

const INVALID_RANGE_MESSAGE = "`toIso` must be greater than or equal to `fromIso`."
const isInvalidRange = (fromIso?: string, toIso?: string): boolean =>
  fromIso !== undefined && toIso !== undefined && Date.parse(toIso) < Date.parse(fromIso)

const rangeQuery = {
  fromIso: z.iso
    .datetime()
    .optional()
    .describe("Lower bound (inclusive) of the time range. Defaults to 30 days before `toIso`."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive) of the time range. Defaults to now."),
}

const errorsOnlyQuery = {
  errorsOnly: z
    .enum(["true", "false"])
    .optional()
    .describe("When `true`, scope every aggregate to errored traces only."),
}

const coerceErrorsOnly = (raw: "true" | "false" | undefined): boolean | undefined =>
  raw === undefined ? undefined : raw === "true"

const userIdSchema = z
  .string()
  .min(1)
  .max(512)
  .describe("End-user identifier. URL-encode values containing special characters.")

const UserParamsSchema = ProjectParamsSchema.extend({ userId: userIdSchema })

const listUsers = userEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listUsers",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Users"],
    group: "users",
    sdkMethod: "list",
    summary: "List project end-users with usage metrics",
    description:
      "Returns a page of the project's identified end-users over the range, each with trace, session, token, and cost metrics, plus cost aggregates across every matching user. The range defaults to the trailing 30 days.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({
        ...rangeQuery,
        limit: z.coerce.number().int().min(1).max(100).optional().describe("Page size. Max 100."),
        offset: z.coerce.number().int().min(0).optional().describe("Zero-based offset of the first user to return."),
        sortBy: z.enum(USER_SORT_FIELDS).optional().describe("Field to sort by. Defaults to most recently seen."),
        sortDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction. Defaults to descending."),
        searchQuery: z
          .string()
          .max(500)
          .optional()
          .describe("Case-insensitive substring match on the user's id or email."),
      }),
    },
    responses: openApiResponses({ status: 200, schema: UserListResponseSchema, description: "Page of end-users" }),
  }),
  rateLimitTier: "high",
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const { fromIso, toIso, limit, offset, sortBy, sortDirection, searchQuery } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveUserRange(fromIso, toIso)
    const trimmedSearch = searchQuery?.trim() || undefined

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* UserAnalyticsRepository
        return yield* repo.listByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          options: {
            ...(limit !== undefined ? { limit } : {}),
            ...(offset !== undefined ? { offset } : {}),
            ...(sortBy ? { sortBy, sortDirection: sortDirection ?? "desc" } : {}),
            ...(trimmedSearch ? { searchQuery: trimmedSearch } : {}),
            timeRange: { from, to },
          },
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(UserAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toUserListResponse(page), 200)
  },
})

const getUsersOverview = userEndpoint({
  route: createRoute({
    method: "get",
    path: "/overview",
    name: "getUsersOverview",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Users"],
    group: "users",
    sdkMethod: "overview",
    summary: "Get project end-user overview",
    description:
      "Returns project-wide end-user aggregates over the range — unique and new users, identified vs total traces and sessions — plus a per-bucket activity histogram. The range defaults to the trailing 30 days.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({ ...rangeQuery }),
    },
    responses: openApiResponses({ status: 200, schema: UsersOverviewResponseSchema, description: "Users overview" }),
  }),
  rateLimitTier: "medium",
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const { fromIso, toIso } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveUserRange(fromIso, toIso)
    const bucketSeconds = bucketSecondsForRange(from, to)

    const overview = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* UserAnalyticsRepository
        return yield* repo.getOverviewByProjectId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          timeRange: { from, to },
          bucketSeconds,
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(UserAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toUsersOverviewResponse(overview, { from, to, bucketSeconds }), 200)
  },
})

const getUserActivity = userEndpoint({
  route: createRoute({
    method: "get",
    path: "/{userId}/activity",
    name: "getUserActivity",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Users"],
    group: "users",
    sdkMethod: "activity",
    summary: "Get end-user activity histogram",
    description:
      "Returns the end-user's per-bucket session activity across the range, oldest first. The range defaults to the trailing 30 days.",
    security: PROTECTED_SECURITY,
    request: {
      params: UserParamsSchema,
      query: z.object({ ...rangeQuery, ...errorsOnlyQuery }),
    },
    responses: openApiResponses({ status: 200, schema: UserActivityResponseSchema, description: "Activity histogram" }),
  }),
  rateLimitTier: "medium",
  handler: async (c) => {
    const { projectSlug, userId } = c.req.valid("param")
    const { fromIso, toIso, errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveUserRange(fromIso, toIso)
    const bucketSeconds = bucketSecondsForRange(from, to)
    const scaffold = buildHistogramBucketScaffold({ from, to, bucketSeconds })
    const errors = coerceErrorsOnly(errorsOnly)

    const series = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* UserAnalyticsRepository
        return yield* repo.activityByUserIds({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          userIds: [ExternalUserId(userId)],
          timeRange: { from, to },
          bucketSeconds,
          ...(errors === undefined ? {} : { errorsOnly: errors }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(UserAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toUserActivityResponse(series, scaffold, { from, to, bucketSeconds }), 200)
  },
})

const getUserUsage = userEndpoint({
  route: createRoute({
    method: "get",
    path: "/{userId}/usage",
    name: "getUserUsage",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Users"],
    group: "users",
    sdkMethod: "usage",
    summary: "Get end-user usage breakdown",
    description:
      "Returns the end-user's top values of a usage dimension — `model`, `provider`, or `tool` — ranked by distinct trace count.",
    security: PROTECTED_SECURITY,
    request: {
      params: UserParamsSchema,
      query: z.object({
        dimension: z.enum(["model", "provider", "tool"]).describe("Dimension to break the usage down by."),
        limit: z.coerce.number().int().min(1).max(50).optional().describe("Maximum number of values to return."),
        ...errorsOnlyQuery,
      }),
    },
    responses: openApiResponses({ status: 200, schema: UserUsageResponseSchema, description: "Usage breakdown" }),
  }),
  rateLimitTier: "medium",
  handler: async (c) => {
    const { projectSlug, userId } = c.req.valid("param")
    const { dimension, limit, errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    const errors = coerceErrorsOnly(errorsOnly)

    const slices = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* UserAnalyticsRepository
        return yield* repo.usageBreakdownByUserId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          userId: ExternalUserId(userId),
          dimension,
          ...(limit === undefined ? {} : { limit }),
          ...(errors === undefined ? {} : { errorsOnly: errors }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(UserAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toUserUsageResponse(slices), 200)
  },
})

const listUserSignals = userEndpoint({
  route: createRoute({
    method: "get",
    path: "/{userId}/signals",
    name: "listUserSignals",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Users"],
    group: "users",
    sdkMethod: "signals",
    summary: "List signals on an end-user's traces",
    description:
      "Returns the signals that occurred on the end-user's traces, most recent occurrence first. Occurrence counts are scoped to the user; signal identity and lifecycle states are the project's.",
    security: PROTECTED_SECURITY,
    request: {
      params: UserParamsSchema,
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().describe("Maximum number of signals to return."),
      }),
    },
    responses: openApiResponses({ status: 200, schema: UserSignalsResponseSchema, description: "User signals" }),
  }),
  rateLimitTier: "low",
  handler: async (c) => {
    const { projectSlug, userId } = c.req.valid("param")
    const { limit } = c.req.valid("query")
    const organizationId = c.var.organization.id

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* listUserSignalsUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          userId: ExternalUserId(userId),
          ...(limit === undefined ? {} : { limit }),
        })
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive), c.var.postgresClient, organizationId),
        withClickHouse(ScoreAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json({ items: items.map(toUserSignalResponse) }, 200)
  },
})

const listUserBehaviours = userEndpoint({
  route: createRoute({
    method: "get",
    path: "/{userId}/behaviours",
    name: "listUserBehaviours",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Users"],
    group: "users",
    sdkMethod: "behaviours",
    summary: "List behaviours observed for an end-user",
    description:
      "Returns the behaviour clusters observed on the end-user's sessions, most frequent first. Counts are scoped to the user; cluster identity comes from the project taxonomy.",
    security: PROTECTED_SECURITY,
    request: {
      params: UserParamsSchema,
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().describe("Maximum number of behaviours to return."),
      }),
    },
    responses: openApiResponses({ status: 200, schema: UserBehavioursResponseSchema, description: "User behaviours" }),
  }),
  rateLimitTier: "low",
  handler: async (c) => {
    const { projectSlug, userId } = c.req.valid("param")
    const { limit } = c.req.valid("query")
    const organizationId = c.var.organization.id

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        return yield* listUserBehavioursUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          userId: ExternalUserId(userId),
          ...(limit === undefined ? {} : { limit }),
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, TaxonomyClusterRepositoryLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(TaxonomyObservationRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json({ items: items.map(toUserBehaviourResponse) }, 200)
  },
})

const getUser = userEndpoint({
  route: createRoute({
    method: "get",
    path: "/{userId}",
    name: "getUser",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Users"],
    group: "users",
    sdkMethod: "get",
    summary: "Get end-user profile",
    description:
      "Returns the lifetime profile of one end-user — trace, session, token, cost, and activity rollups across all of the user's traces (not range-bound).",
    security: PROTECTED_SECURITY,
    request: {
      params: UserParamsSchema,
      query: z.object({ ...errorsOnlyQuery }),
    },
    responses: openApiResponses({ status: 200, schema: UserProfileResponseSchema, description: "User profile" }),
  }),
  rateLimitTier: "low",
  handler: async (c) => {
    const { projectSlug, userId } = c.req.valid("param")
    const { errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    const errors = coerceErrorsOnly(errorsOnly)

    const profile = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* UserAnalyticsRepository
        return yield* repo.findByUserId({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          userId: ExternalUserId(userId),
          ...(errors === undefined ? {} : { errorsOnly: errors }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(UserAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toUserProfileResponse(profile), 200)
  },
})

export const usersModule: OperationModule = {
  path: usersPath,
  // Static `/overview` before the `/{userId}` param route so it isn't captured
  // as a user id (Hono resolves in registration order).
  operations: [
    listUsers,
    getUsersOverview,
    getUserActivity,
    getUserUsage,
    listUserSignals,
    listUserBehaviours,
    getUser,
  ],
}
