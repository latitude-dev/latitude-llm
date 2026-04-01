import { ProjectRepository } from "@domain/projects"
import {
  baseWriteScoreInputSchema,
  type CustomScore,
  customScoreSchema,
  type EvaluationScore,
  evaluationScoreSchema,
  isImmutableScore,
  syncScoreAnalyticsUseCase,
  writeScoreUseCase,
} from "@domain/scores"
import { cuidSchema, ProjectId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ProjectRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { jsonBody, OrgAndProjectParamsSchema, openApiResponses, PROTECTED_SECURITY } from "../openapi/schemas.ts"
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
  tags: ["Scores"],
  summary: "Create project score",
  description: "Creates a score grouped by a source. Annotations use the separate `/annotations` endpoint.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndProjectParamsSchema,
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
    const { projectId: projectIdParam } = c.req.valid("param")
    const projectId = ProjectId(projectIdParam)

    const repositoriesLayer = Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive)

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        yield* projectRepository.findById(projectId)

        let score: ApiScore
        if (body._evaluation === true) {
          const evaluationScore = yield* writeScoreUseCase({
            projectId,
            source: "evaluation",
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
          })
          score = evaluationScore as EvaluationScore
        } else {
          const customScore = yield* writeScoreUseCase({
            projectId,
            source: "custom",
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
          })
          score = customScore as CustomScore
        }

        if (isImmutableScore(score)) {
          yield* syncScoreAnalyticsUseCase({ scoreId: score.id })
        }

        return score
      }).pipe(
        withPostgres(repositoriesLayer, c.var.postgresClient, c.var.organization.id),
        withClickHouse(ScoreAnalyticsRepositoryLive, c.var.clickhouse, c.var.organization.id),
      ),
    )

    return c.json(toResponse(score), 201)
  })

  return app
}
