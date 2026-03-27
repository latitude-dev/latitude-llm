import { writeAnnotationUseCase } from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
import {
  type AnnotationScore,
  annotationScoreSchema,
  annotationScoreSourceIdSchema,
  scoreValueSchema,
} from "@domain/scores"
import { cuidSchema, ProjectId } from "@domain/shared"
import { sessionIdSchema, spanIdSchema, traceIdSchema } from "@domain/spans"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { OutboxEventWriterLive, ProjectRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { Effect, Layer } from "effect"
import { jsonBody, OrgAndProjectParamsSchema, openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const RequestSchema = z
  .object({
    sourceId: annotationScoreSourceIdSchema.default("API"),
    sessionId: sessionIdSchema.nullable().default(null),
    traceId: traceIdSchema.nullable().default(null),
    spanId: spanIdSchema.nullable().default(null),
    value: scoreValueSchema,
    passed: z.boolean(),
    rawFeedback: z.string().min(1).openapi({ description: "Human-authored feedback text" }),
    messageIndex: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({ description: "Message index in the canonical conversation" }),
    partIndex: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({ description: "Raw GenAI parts[] index inside the target message" }),
    startOffset: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({ description: "Start offset for substring annotations" }),
    endOffset: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .openapi({ description: "End offset for substring annotations" }),
    error: z.string().nullable().default(null),
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

    const layers = Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive)

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        yield* projectRepository.findById(projectId)

        return yield* writeAnnotationUseCase({
          projectId,
          sourceId: body.sourceId,
          sessionId: body.sessionId,
          traceId: body.traceId,
          spanId: body.spanId,
          value: body.value,
          passed: body.passed,
          rawFeedback: body.rawFeedback,
          messageIndex: body.messageIndex,
          partIndex: body.partIndex,
          startOffset: body.startOffset,
          endOffset: body.endOffset,
          error: body.error,
        })
      }).pipe(
        withPostgres(layers, c.var.postgresClient, c.var.organization.id),
        Effect.provide(QueuePublisherLive(c.var.queuePublisher)),
      ),
    )

    return c.json(toResponse(score), 201)
  })

  return app
}
