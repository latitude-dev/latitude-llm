import { ProjectRepository } from "@domain/projects"
import { BadRequestError, OrganizationId, ProjectId } from "@domain/shared"
import { ToolAnalyticsRepository } from "@domain/spans"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ToolAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  decodeToolCallCursor,
  deriveBucketSeconds,
  encodeToolCallCursor,
  MAX_BUCKET_SECONDS,
  MIN_BUCKET_SECONDS,
  PaginatedToolCallsSchema,
  resolveRange,
  ToolContextBreakdownResponseSchema,
  ToolCoOccurrenceResponseSchema,
  ToolDetailResponseSchema,
  ToolErrorBreakdownResponseSchema,
  ToolHistogramResponseSchema,
  ToolParameterStatsResponseSchema,
  ToolsAnalyticsResponseSchema,
  toContextBreakdownResponse,
  toCoOccurrenceResponse,
  toErrorBreakdownResponse,
  toHistogramResponse,
  toParameterStatsResponse,
  toRecentToolCallResponse,
  toToolDetailResponse,
  toToolsAnalyticsResponse,
} from "../openapi/entities/tool.ts"
import { openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

export const toolsPath = "/projects/:projectSlug/tools"

const toolEndpoint = defineApiEndpoint<OrganizationScopedEnv>(toolsPath)

const toolsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "tools",
    "x-fern-sdk-method-name": methodName,
  }) as const

const INVALID_RANGE_MESSAGE = "`toIso` must be greater than or equal to `fromIso`."
const isInvalidRange = (fromIso?: string, toIso?: string): boolean =>
  fromIso !== undefined && toIso !== undefined && Date.parse(toIso) < Date.parse(fromIso)

const rangeQuery = {
  fromIso: z.iso
    .datetime()
    .optional()
    .describe("Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`."),
  toIso: z.iso.datetime().optional().describe("Upper bound (inclusive) of the time range. Defaults to now."),
}

const errorsOnlyQuery = {
  errorsOnly: z.enum(["true", "false"]).optional().describe("When `true`, scope every aggregate to failed calls only."),
}

const bucketSecondsSchema = z.coerce
  .number()
  .int()
  .min(MIN_BUCKET_SECONDS)
  .max(MAX_BUCKET_SECONDS)
  .describe("Bucket width in seconds. Derived from the range (~30 buckets) when omitted.")

const toolNameSchema = z.string().min(1).max(256).describe("Tool name. URL-encode names containing special characters.")

const ToolNameParamsSchema = ProjectParamsSchema.extend({ toolName: toolNameSchema })

const coerceErrorsOnly = (raw: "true" | "false" | undefined): boolean | undefined =>
  raw === undefined ? undefined : raw === "true"

const listTools = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listTools",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("list"),
    summary: "List project tools with usage metrics",
    description:
      "Returns every tool in the project over the range — the union of defined and called tools — with per-tool usage metrics, offered counts, a call trend, and project-wide totals. The range defaults to the trailing 7 days.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({
        ...rangeQuery,
        trendBucketSeconds: bucketSecondsSchema.optional(),
      }),
    },
    responses: openApiResponses({ status: 200, schema: ToolsAnalyticsResponseSchema, description: "Tools analytics" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const { fromIso, toIso, trendBucketSeconds } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)
    const bucket = trendBucketSeconds ?? deriveBucketSeconds(from, to)

    const analytics = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.listToolsWithMetrics({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          trendBucketSeconds: bucket,
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toToolsAnalyticsResponse(analytics), 200)
  },
})

const getToolCallHistogram = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/histogram",
    name: "getToolCallHistogram",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("histogram"),
    summary: "Get tool call histogram",
    description:
      "Returns per-bucket call counts over the range. Omit `toolName` to aggregate across every tool in the project; pass it to scope the histogram to a single tool.",
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      query: z.object({
        ...rangeQuery,
        toolName: toolNameSchema.optional(),
        bucketSeconds: bucketSecondsSchema.optional(),
        ...errorsOnlyQuery,
      }),
    },
    responses: openApiResponses({ status: 200, schema: ToolHistogramResponseSchema, description: "Call histogram" }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const { fromIso, toIso, toolName, bucketSeconds, errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)
    const bucket = bucketSeconds ?? deriveBucketSeconds(from, to)
    const errors = coerceErrorsOnly(errorsOnly)

    const buckets = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolCallHistogram({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          bucketSeconds: bucket,
          ...(toolName === undefined ? {} : { toolName }),
          ...(errors === undefined ? {} : { errorsOnly: errors }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toHistogramResponse(buckets), 200)
  },
})

const getToolParameters = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/{toolName}/parameters",
    name: "getToolParameters",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("parameters"),
    summary: "Get tool parameter stats",
    description:
      "Returns the most common top-level input keys and their most common values for the tool, computed over a sample of the most recent calls in the range.",
    security: PROTECTED_SECURITY,
    request: {
      params: ToolNameParamsSchema,
      query: z.object({
        ...rangeQuery,
        topKeys: z.coerce.number().int().min(1).max(50).optional().describe("Maximum number of keys to return."),
        topValuesPerKey: z.coerce
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Maximum number of values to return per key."),
        ...errorsOnlyQuery,
      }),
    },
    responses: openApiResponses({
      status: 200,
      schema: ToolParameterStatsResponseSchema,
      description: "Parameter stats",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, toolName } = c.req.valid("param")
    const { fromIso, toIso, topKeys, topValuesPerKey, errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)
    const errors = coerceErrorsOnly(errorsOnly)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolParameterStats({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          toolName,
          ...(topKeys === undefined ? {} : { topKeys }),
          ...(topValuesPerKey === undefined ? {} : { topValuesPerKey }),
          ...(errors === undefined ? {} : { errorsOnly: errors }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toParameterStatsResponse(result), 200)
  },
})

const getToolContext = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/{toolName}/context",
    name: "getToolContext",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("context"),
    summary: "Get tool context breakdown",
    description:
      "Returns where the tool is used, broken down by a dimension: `model` and `provider` attribute the tool's traces via their chat spans; `tag` reads tags on the tool-call spans themselves.",
    security: PROTECTED_SECURITY,
    request: {
      params: ToolNameParamsSchema,
      query: z.object({
        ...rangeQuery,
        dimension: z.enum(["model", "provider", "tag"]).describe("Dimension to break the usage down by."),
        ...errorsOnlyQuery,
      }),
    },
    responses: openApiResponses({
      status: 200,
      schema: ToolContextBreakdownResponseSchema,
      description: "Context breakdown",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, toolName } = c.req.valid("param")
    const { fromIso, toIso, dimension, errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)
    const errors = coerceErrorsOnly(errorsOnly)

    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolContextBreakdown({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          toolName,
          dimension,
          ...(errors === undefined ? {} : { errorsOnly: errors }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toContextBreakdownResponse(rows), 200)
  },
})

const getToolCoOccurrence = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/{toolName}/co-occurrence",
    name: "getToolCoOccurrence",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("coOccurrence"),
    summary: "Get co-occurring tools",
    description: "Returns other tools called in the same traces as this one, ranked by shared trace count.",
    security: PROTECTED_SECURITY,
    request: {
      params: ToolNameParamsSchema,
      query: z.object({
        ...rangeQuery,
        limit: z.coerce.number().int().min(1).max(50).optional().describe("Maximum number of tools to return."),
        ...errorsOnlyQuery,
      }),
    },
    responses: openApiResponses({
      status: 200,
      schema: ToolCoOccurrenceResponseSchema,
      description: "Co-occurring tools",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, toolName } = c.req.valid("param")
    const { fromIso, toIso, limit, errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)
    const errors = coerceErrorsOnly(errorsOnly)

    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolCoOccurrence({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          toolName,
          ...(limit === undefined ? {} : { limit }),
          ...(errors === undefined ? {} : { errorsOnly: errors }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toCoOccurrenceResponse(rows), 200)
  },
})

const getToolErrors = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/{toolName}/errors",
    name: "getToolErrors",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("errors"),
    summary: "Get tool error breakdown",
    description:
      "Returns the most common error outputs of the tool's failed calls, grouped into clusters by a normalized form so variable fragments don't split one error into many buckets.",
    security: PROTECTED_SECURITY,
    request: {
      params: ToolNameParamsSchema,
      query: z.object({
        ...rangeQuery,
        limit: z.coerce.number().int().min(1).max(50).optional().describe("Maximum number of clusters to return."),
      }),
    },
    responses: openApiResponses({
      status: 200,
      schema: ToolErrorBreakdownResponseSchema,
      description: "Error breakdown",
    }),
  }),
  handler: async (c) => {
    const { projectSlug, toolName } = c.req.valid("param")
    const { fromIso, toIso, limit } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)

    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.getToolErrorBreakdown({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          toolName,
          ...(limit === undefined ? {} : { limit }),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toErrorBreakdownResponse(rows), 200)
  },
})

const listToolCalls = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/{toolName}/calls",
    name: "listToolCalls",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("listCalls"),
    summary: "List recent tool calls",
    description:
      "Returns a cursor-paginated page of the tool's most recent calls, newest first, with payloads truncated to a bounded preview. Use a span point-lookup for full payloads.",
    security: PROTECTED_SECURITY,
    request: {
      params: ToolNameParamsSchema,
      query: z.object({
        ...rangeQuery,
        limit: z.coerce.number().int().min(1).max(50).default(50).describe("Page size. Defaults to 50; max 50."),
        ...errorsOnlyQuery,
        cursor: z
          .string()
          .optional()
          .describe("Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page."),
      }),
    },
    responses: openApiResponses({ status: 200, schema: PaginatedToolCallsSchema, description: "Page of tool calls" }),
  }),
  handler: async (c) => {
    const { projectSlug, toolName } = c.req.valid("param")
    const { fromIso, toIso, limit, errorsOnly, cursor } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)
    const errors = coerceErrorsOnly(errorsOnly)

    const page = await Effect.runPromise(
      Effect.gen(function* () {
        let decodedCursor: { startTime: Date; spanId: string } | undefined
        if (cursor) {
          const decoded = decodeToolCallCursor(cursor)
          if (!decoded) return yield* new BadRequestError({ message: "Invalid `cursor` value." })
          decodedCursor = decoded
        }

        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        return yield* repo.listRecentToolCalls({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
          toolName,
          limit,
          ...(errors === undefined ? {} : { errorsOnly: errors }),
          ...(decodedCursor ? { cursor: decodedCursor } : {}),
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(
      {
        items: page.items.map(toRecentToolCallResponse),
        nextCursor: page.nextCursor ? encodeToolCallCursor(page.nextCursor) : null,
        hasMore: page.hasMore,
      },
      200,
    )
  },
})

const getTool = toolEndpoint({
  route: createRoute({
    method: "get",
    path: "/{toolName}",
    name: "getTool",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Tools"],
    ...toolsFernGroup("get"),
    summary: "Get tool detail",
    description:
      "Returns the latest definition seen for the tool plus its global usage metrics. Pass `errorsOnly=true` to also include failed-calls-only metrics for failure analysis.",
    security: PROTECTED_SECURITY,
    request: {
      params: ToolNameParamsSchema,
      query: z.object({ ...rangeQuery, ...errorsOnlyQuery }),
    },
    responses: openApiResponses({ status: 200, schema: ToolDetailResponseSchema, description: "Tool detail" }),
  }),
  handler: async (c) => {
    const { projectSlug, toolName } = c.req.valid("param")
    const { fromIso, toIso, errorsOnly } = c.req.valid("query")
    const organizationId = c.var.organization.id
    if (isInvalidRange(fromIso, toIso)) return c.json({ error: INVALID_RANGE_MESSAGE }, 400)
    const { from, to } = resolveRange(fromIso, toIso)
    const errors = coerceErrorsOnly(errorsOnly)

    const detail = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)
        const repo = yield* ToolAnalyticsRepository
        const scope = {
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          from,
          to,
        }
        const [definition, usage, errorsUsage] = yield* Effect.all(
          [
            repo.getToolDefinition({ ...scope, toolName }),
            repo.getToolUsageSummary({ ...scope, toolName }),
            errors ? repo.getToolUsageSummary({ ...scope, toolName, errorsOnly: true }) : Effect.succeed(null),
          ],
          { concurrency: 3 },
        )
        return { definition, usage, errorsUsage }
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(ToolAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toToolDetailResponse(detail.definition, detail.usage, detail.errorsUsage), 200)
  },
})

export const createToolsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  // Static segments before the `/{toolName}` param route so `/histogram` isn't
  // captured as a tool name (Hono resolves in registration order).
  listTools.mountHttp(app, createTierRateLimiter("high"))
  getToolCallHistogram.mountHttp(app, createTierRateLimiter("medium"))
  getToolParameters.mountHttp(app, createTierRateLimiter("medium"))
  getToolContext.mountHttp(app, createTierRateLimiter("medium"))
  getToolCoOccurrence.mountHttp(app, createTierRateLimiter("low"))
  getToolErrors.mountHttp(app, createTierRateLimiter("low"))
  listToolCalls.mountHttp(app, createTierRateLimiter("low"))
  getTool.mountHttp(app, createTierRateLimiter("low"))
  return app
}
