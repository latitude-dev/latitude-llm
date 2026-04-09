import { writeAnnotationInputSchema, writeAnnotationUseCase } from "@domain/annotations"
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
import { Effect, Layer } from "effect"
import { jsonBody, OrgAndProjectParamsSchema, openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

/**
 * POST body: use-case input without `projectId` (URL) or
 * `sourceId` (forced to `"API"`). */
const RequestSchema = writeAnnotationInputSchema
  .omit({ projectId: true, sourceId: true })
  .openapi("CreateAnnotationBody")

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
    "Creates a human-reviewed annotation score. Annotations are the strongest human signal in the reliability system.",
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

        return yield* writeAnnotationUseCase({
          ...body,
          projectId,
          sourceId: "API",
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
      ),
    )

    return c.json(toResponse(score), 201)
  })

  return app
}
