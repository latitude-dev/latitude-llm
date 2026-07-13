import { ProjectRepository } from "@domain/projects"
import { analyticsQuerySchema, isValidAnalyticsRange, OrganizationId, ProjectId } from "@domain/shared"
import { queryAnalyticsUseCase } from "@domain/spans"
import { createRoute } from "@hono/zod-openapi"
import { AnalyticsQueryReaderLive, withClickHouse } from "@platform/db-clickhouse"
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
  AnalyticsQueryBodySchema,
  AnalyticsSeriesResponseSchema,
  toAnalyticsResponse,
} from "../openapi/entities/analytics.ts"
import { resolveBreakdownLabels } from "../openapi/entities/analytics-labels.ts"
import { jsonBody, PROTECTED_SECURITY, ProjectParamsSchema, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const analyticsPath = "/projects/:projectSlug/analytics"

const analyticsEndpoint = defineOperation<OrganizationScopedEnv>(analyticsPath)

const queryAnalytics = analyticsEndpoint({
  route: createRoute({
    method: "post",
    path: "/query",
    name: "queryAnalytics",
    tags: ["Analytics"],
    group: "analytics",
    sdkMethod: "query",
    summary: "Run an analytics query",
    description:
      "Compute a metric over a filtered stream (`traces`/`sessions`/`spans`), optionally broken down by a dimension and/or bucketed over time. Returns a tidy series — one point per breakdown value and/or time bucket — suitable for charts and dashboards.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, body: jsonBody(AnalyticsQueryBodySchema) },
    responses: typedResponses({
      status: 200,
      schema: AnalyticsSeriesResponseSchema,
      description: "The analytics series",
    }),
  }),
  access: "read-only",
  rateLimitTier: "high",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const { projectSlug } = input.params

      // Re-validate through the domain schema for the filter constraints + typing;
      // the body schema above is the Fern-friendly mirror used for docs/SDK.
      const parsed = analyticsQuerySchema.safeParse(input.body)
      if (!parsed.success) {
        return { status: 400, body: { error: parsed.error.issues[0]?.message ?? "Invalid analytics query." } } as const
      }
      if (!isValidAnalyticsRange(parsed.data.range)) {
        return { status: 400, body: { error: "`range.fromIso` must be strictly before `range.toIso`." } } as const
      }

      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(projectSlug)
      const projectId = ProjectId(project.id as string)

      const series = yield* queryAnalyticsUseCase({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId,
        query: parsed.data,
      })

      const keys = [...new Set(series.map((point) => point.key).filter((k): k is string => Boolean(k)))]
      const labels = yield* resolveBreakdownLabels({
        stream: parsed.data.stream,
        breakdown: parsed.data.breakdown,
        projectId,
        keys,
      })

      return { status: 200, body: toAnalyticsResponse(series, labels) } as const
    }).pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, SignalRepositoryLive, TaxonomyClusterRepositoryLive),
        ctx.postgresClient,
        ctx.organization.id,
      ),
      withClickHouse(AnalyticsQueryReaderLive, ctx.clickhouse, ctx.organization.id),
      withTracing,
    ),
})

export const analyticsModule: OperationModule = {
  path: analyticsPath,
  operations: [queryAnalytics],
}
