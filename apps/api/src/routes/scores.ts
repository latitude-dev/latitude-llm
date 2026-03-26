import { ProjectRepository } from "@domain/projects"
import {
  baseWriteScoreInputSchema,
  type CustomScore,
  customScoreSchema,
  type EvaluationScore,
  evaluationScoreSchema,
  writeScoreUseCase,
} from "@domain/scores"
import { cuidSchema, ProjectId } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { ProjectRepositoryLive, ScoreEventWriterLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { ErrorSchema, OrgAndProjectParamsSchema, PROTECTED_SECURITY } from "../openapi/schemas.ts"
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

const CreateScoreBodySchema = z
  .union([CreateCustomScoreBodySchema, CreateEvaluationScoreBodySchema])
  .openapi("CreateScoreBody")

const apiScoreResponseOverrides = {
  id: cuidSchema,
  organizationId: cuidSchema,
  projectId: cuidSchema,
  draftedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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

const ScoreResponseSchema = z.union([CustomScoreResponseSchema, EvaluationScoreResponseSchema]).openapi("ScoreResponse")

type ApiScore = CustomScore | EvaluationScore

const createScoreRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Scores"],
  summary: "Create project score",
  description: "Creates a score grouped by a source. Annotations use the separate `/annotations` endpoint.",
  security: PROTECTED_SECURITY,
  request: {
    params: OrgAndProjectParamsSchema,
    body: {
      content: { "application/json": { schema: CreateScoreBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ScoreResponseSchema } },
      description: "Score created successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Validation error",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Project not found",
    },
  },
})

const toScoreResponse = (score: ApiScore) => {
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
  const app = new OpenAPIHono<OrganizationScopedEnv>({
    defaultHook(result, c) {
      if (!result.success) {
        const error = result.error.issues.map((issue) => issue.message).join(", ")
        return c.json({ error }, 400)
      }
    },
  })

  app.openapi(createScoreRoute, async (c) => {
    const body = c.req.valid("json")
    const { projectId: projectIdParam } = c.req.valid("param")
    const projectId = ProjectId(projectIdParam)

    const repositoriesLayer = Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, ScoreEventWriterLive)

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        yield* projectRepository.findById(projectId)

        if (body._evaluation === true) {
          return yield* writeScoreUseCase({
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
        }

        return yield* writeScoreUseCase({
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
      }).pipe(withPostgres(repositoriesLayer, c.var.postgresClient, c.var.organization.id)),
    )

    if (score.source === "annotation") {
      throw new Error("Unexpected annotation score returned from score API writer")
    }

    return c.json(toScoreResponse(score), 201)
  })

  return app
}
