import { ProjectRepository } from "@domain/projects"
import {
  baseWriteScoreInputSchema,
  type CustomScore,
  customScoreSchema,
  type EvaluationScore,
  evaluationScoreSchema,
  type WriteScoreInput,
  writeScoreUseCase,
} from "@domain/scores"
import { cuidSchema } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ProjectRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { jsonBody, openApiResponses, PROTECTED_SECURITY, ProjectParamsSchema } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const ApiScoreBodyCommonSchema = z.object({
  ...baseWriteScoreInputSchema.omit({
    id: true,
    projectId: true,
    issueId: true,
    draftedAt: true,
  }).shape,
})

const CreateCustomScoreBodySchema = z
  .object({
    ...ApiScoreBodyCommonSchema.shape,
    sourceId: customScoreSchema.shape.sourceId,
    metadata: customScoreSchema.shape.metadata.default({}),
    _evaluation: z.literal(false).optional().default(false),
  })
  .openapi("CreateCustomScoreBody")

const CreateEvaluationScoreBodySchema = z
  .object({
    ...ApiScoreBodyCommonSchema.shape,
    _evaluation: z.literal(true),
    sourceId: evaluationScoreSchema.shape.sourceId,
    metadata: evaluationScoreSchema.shape.metadata,
  })
  .openapi("CreateEvaluationScoreBody", { description: "Internal, don't use" })

const RequestSchema = z.union([CreateCustomScoreBodySchema, CreateEvaluationScoreBodySchema]).openapi("CreateScoreBody")

const apiScoreResponseOverrides = {
  id: cuidSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  draftedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
} as const

const CustomScoreResponseSchema = z
  .object({
    ...customScoreSchema.shape,
    ...apiScoreResponseOverrides,
  })
  .openapi("CustomScoreResponse")

const EvaluationScoreResponseSchema = z
  .object({
    ...evaluationScoreSchema.shape,
    ...apiScoreResponseOverrides,
  })
  .openapi("EvaluationScoreResponse")

const ResponseSchema = z.union([CustomScoreResponseSchema, EvaluationScoreResponseSchema]).openapi("ScoreResponse")

type ApiScore = CustomScore | EvaluationScore

const route = createRoute({
  method: "post",
  path: "/",
  operationId: "scores.create",
  tags: ["Scores"],
  summary: "Create project score",
  description: "Creates a score grouped by a source. Annotations use the separate `/annotations` endpoint.",
  security: PROTECTED_SECURITY,
  request: {
    params: ProjectParamsSchema,
    body: jsonBody(RequestSchema),
  },
  responses: openApiResponses({
    status: 201,
    schema: ResponseSchema,
    description: "Score created successfully",
  }),
})

const toResponse = (score: ApiScore) => {
  const baseResponse = {
    id: score.id as string,
    organizationId: score.organizationId,
    projectId: score.projectId,
    sessionId: score.sessionId,
    traceId: score.traceId,
    spanId: score.spanId,
    simulationId: score.simulationId,
    issueId: score.issueId,
    value: score.value,
    passed: score.passed,
    feedback: score.feedback,
    error: score.error,
    errored: score.errored,
    duration: score.duration,
    tokens: score.tokens,
    cost: score.cost,
    draftedAt: score.draftedAt ? score.draftedAt.toISOString() : null,
    createdAt: score.createdAt.toISOString(),
    updatedAt: score.updatedAt.toISOString(),
  }

  if (score.source === "evaluation") {
    return {
      ...baseResponse,
      source: "evaluation" as const,
      sourceId: score.sourceId,
      metadata: score.metadata,
    }
  }

  return {
    ...baseResponse,
    source: "custom" as const,
    sourceId: score.sourceId,
    metadata: score.metadata,
  }
}

export const createScoresRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()

  app.openapi(route, async (c) => {
    const body = c.req.valid("json")
    const { projectSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        const project = yield* projectRepository.findBySlug(projectSlug)
        const projectId = project.id

        const sharedWriteInput = {
          projectId,
          sourceId: body.sourceId,
          sessionId: body.sessionId,
          traceId: body.traceId,
          spanId: body.spanId,
          simulationId: body.simulationId,
          value: body.value,
          passed: body.passed,
          feedback: body.feedback,
          metadata: body.metadata,
          error: body.error,
          duration: body.duration,
          tokens: body.tokens,
          cost: body.cost,
        }

        const writeInput: WriteScoreInput =
          body._evaluation === true
            ? {
                ...sharedWriteInput,
                source: "evaluation",
                metadata: body.metadata,
              }
            : {
                ...sharedWriteInput,
                source: "custom",
                metadata: body.metadata,
              }

        const score = yield* writeScoreUseCase(writeInput)

        return score as ApiScore
      }).pipe(
        withPostgres(
          Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive),
          c.var.postgresClient,
          organizationId,
        ),
        withClickHouse(ScoreAnalyticsRepositoryLive, c.var.clickhouse, organizationId),
        withTracing,
      ),
    )

    return c.json(toResponse(score), 201)
  })

  return app
}
