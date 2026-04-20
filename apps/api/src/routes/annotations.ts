import { submitApiAnnotationInputSchema, submitApiAnnotationUseCase } from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
import { type AnnotationScore, annotationScoreSchema } from "@domain/scores"
import { cuidSchema, ProjectId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ProjectRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { jsonBody, OrgAndProjectParamsSchema, openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

/**
 * POST body: caller-supplied annotation data plus a `trace` ref (id or filters)
 * and an optional `draft` flag (default `false` = published). `projectId` comes
 * from the URL and `sourceId` is forced to `"API"`.
 *
 * Note: we rebuild the schema here (rather than chaining `.openapi()` on the
 * domain export) because Zod-OpenAPI's prototype augmentation does not survive
 * schemas returned from `.omit().extend(...)` across package boundaries — the
 * fresh `z.object` wrapper is the idiomatic way to attach an OpenAPI name.
 */
const RequestSchema = z.object(submitApiAnnotationInputSchema.shape).openapi("CreateAnnotationBody")

const ResponseSchema = z
  .object({
    ...annotationScoreSchema.shape,
    id: cuidSchema,
    organizationId: cuidSchema,
    projectId: cuidSchema,
    draftedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("AnnotationScoreResponse")

const route = createRoute({
  method: "post",
  path: "/",
  tags: ["Annotations"],
  summary: "Create project annotation",
  description:
    'Creates a human-reviewed annotation score. Published by default; pass `draft: true` to keep the annotation editable before publication. The target trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required).',
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndProjectParamsSchema,
    body: jsonBody(RequestSchema),
  },
  responses: openApiResponses({ status: 201, schema: ResponseSchema, description: "Annotation created successfully" }),
})

const toResponse = (score: AnnotationScore) => ({
  id: score.id as string,
  organizationId: score.organizationId,
  projectId: score.projectId,
  sessionId: score.sessionId,
  traceId: score.traceId,
  spanId: score.spanId,
  source: score.source,
  sourceId: score.sourceId,
  simulationId: score.simulationId,
  issueId: score.issueId,
  value: score.value,
  passed: score.passed,
  feedback: score.feedback,
  metadata: score.metadata,
  error: score.error,
  errored: score.errored,
  duration: score.duration,
  tokens: score.tokens,
  cost: score.cost,
  draftedAt: score.draftedAt ? score.draftedAt.toISOString() : null,
  createdAt: score.createdAt.toISOString(),
  updatedAt: score.updatedAt.toISOString(),
})

export const createAnnotationsRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()

  app.openapi(route, async (c) => {
    const body = c.req.valid("json")
    const { projectId: projectIdParam } = c.req.valid("param")
    const projectId = ProjectId(projectIdParam)
    const organizationId = c.var.organization.id

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        yield* projectRepository.findById(projectId)

        return yield* submitApiAnnotationUseCase({
          ...body,
          projectId,
          organizationId,
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(
          Layer.mergeAll(ScoreAnalyticsRepositoryLive, TraceRepositoryLive, SpanRepositoryLive),
          c.var.clickhouse,
          organizationId,
        ),
        Effect.provide(QueuePublisherLive(c.var.queuePublisher)),
        withTracing,
      ),
    )

    return c.json(toResponse(score), 201)
  })

  return app
}
