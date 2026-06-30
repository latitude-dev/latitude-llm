import { ProjectRepository } from "@domain/projects"
import { analyticsQuerySchema, isValidAnalyticsRange, OrganizationId, ProjectId } from "@domain/shared"
import { queryAnalyticsUseCase } from "@domain/spans"
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { AnalyticsQueryReaderLive, withClickHouse } from "@platform/db-clickhouse"
import { ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import { createTierRateLimiter } from "../middleware/rate-limiter.ts"
import {
  AnalyticsQueryBodySchema,
  AnalyticsSeriesResponseSchema,
  toAnalyticsResponse,
} from "../openapi/entities/analytics.ts"
import { jsonBody, openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

export const analyticsPath = "/projects/:projectSlug/analytics"

const analyticsFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "analytics",
    "x-fern-sdk-method-name": methodName,
  }) as const

const analyticsEndpoint = defineApiEndpoint<OrganizationScopedEnv>(analyticsPath)

const queryAnalytics = analyticsEndpoint({
  route: createRoute({
    method: "post",
    path: "/query",
    name: "queryAnalytics",
    annotations: { readOnlyHint: true, destructiveHint: false },
    tags: ["Analytics"],
    ...analyticsFernGroup("query"),
    summary: "Run an analytics query",
    description:
      "Compute a metric over a filtered stream (`traces`/`sessions`/`spans`), optionally broken down by a dimension and/or bucketed over time. Returns a tidy series — one point per breakdown value and/or time bucket — suitable for charts and dashboards.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(AnalyticsQueryBodySchema) },
    responses: openApiResponses({
      status: 200,
      schema: AnalyticsSeriesResponseSchema,
      description: "The analytics series",
    }),
  }),
  handler: async (c) => {
    const { projectSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    // Re-validate through the domain schema for the filter constraints + typing;
    // the body schema above is the Fern-friendly mirror used for docs/SDK.
    const parsed = analyticsQuerySchema.safeParse(c.req.valid("json"))
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid analytics query." }, 400)
    }
    if (!isValidAnalyticsRange(parsed.data.range)) {
      return c.json({ error: "`range.fromIso` must be strictly before `range.toIso`." }, 400)
    }

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepo = yield* ProjectRepository
        const project = yield* projectRepo.findBySlug(projectSlug)

        return yield* queryAnalyticsUseCase({
          organizationId: OrganizationId(organizationId as string),
          projectId: ProjectId(project.id as string),
          query: parsed.data,
        })
      }).pipe(
        withPostgres(ProjectRepositoryLive, c.var.postgresClient, organizationId),
        withClickHouse(AnalyticsQueryReaderLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toAnalyticsResponse(result), 200)
  },
})

export const createAnalyticsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  queryAnalytics.mountHttp(app, createTierRateLimiter("high"))
  return app
}
