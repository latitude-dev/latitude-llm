import { submitApiAnnotationInputSchema, submitApiAnnotationUseCase } from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
import { type AnnotationScore, annotationScoreSchema } from "@domain/scores"
import { cuidSchema } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
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
import {
  jsonBody,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  TraceRefSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// `trace` is overridden so the named `TraceRefSchema` is what the OpenAPI emitter
// sees — the un-named domain version inlines the discriminated union and trips
// a Fern name-mangling bug. See `../openapi/schemas.ts` for details.
//
// `id` is dropped: the public API doesn't expose annotation update — every
// submission creates a new annotation.
const RequestSchema = z
  .object({
    ...submitApiAnnotationInputSchema.omit({ id: true }).shape,
    trace: TraceRefSchema,
  })
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
  operationId: "annotations.create",
  tags: ["Annotations"],
  summary: "Create project annotation",
  description:
    'Creates a published annotation score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required).',
  security: PROTECTED_SECURITY,
  request: {
    params: ProjectParamsSchema,
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
    const { projectSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        const project = yield* projectRepository.findBySlug(projectSlug)

        return yield* submitApiAnnotationUseCase({
          ...body,
          projectId: project.id,
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
        withAi(AIEmbedLive, c.var.redis),
        Effect.provide(QueuePublisherLive(c.var.queuePublisher)),
        withTracing,
      ),
    )

    return c.json(toResponse(score), 201)
  })

  return app
}
