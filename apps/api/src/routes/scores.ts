import { ProjectRepository } from "@domain/projects"
import {
  type CustomScore,
  type EvaluationScore,
  SCORE_SOURCE_ID_MAX_LENGTH,
  type SubmitApiScoreInput,
  submitApiScoreUseCase,
} from "@domain/scores"
import { cuidSchema } from "@domain/shared"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ProjectRepositoryLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineApiEndpoint } from "../mcp/index.ts"
import {
  jsonBody,
  openApiResponses,
  PROTECTED_SECURITY,
  ProjectParamsSchema,
  sessionIdSchema,
  spanIdSchema,
  TraceRefSchema,
  traceIdSchema,
} from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

// Lifecycle / measurement fields shared between custom and evaluation score
// request bodies. Field shapes mirror `baseSubmitApiScoreSchema` from
// `@domain/scores` (constraints + defaults preserved); redeclared here so each
// property carries an SDK / MCP description (the domain schema is bare).
const scoreBodyCommonFields = {
  simulationId: cuidSchema
    .nullable()
    .default(null)
    .describe("Simulation this score is tied to, if any. `null` (default) when not part of a simulation."),
  value: z.number().min(0).max(1).describe("Normalized score value in [0, 1]. Higher = better."),
  passed: z.boolean().describe("Whether the scored output passes the evaluator's bar."),
  feedback: z.string().describe("Free-text feedback explaining the score."),
  error: z
    .string()
    .min(1)
    .nullable()
    .default(null)
    .describe("Generation error text, when score generation itself failed. `null` (default) for successful scores."),
  duration: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Score generation duration in nanoseconds. `0` for externally-computed scores."),
  tokens: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("LLM tokens consumed generating the score, if any. `0` for externally-computed scores."),
  cost: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Score cost in microcents (1/1,000,000 of a USD). `0` for externally-computed scores."),
  trace: TraceRefSchema.describe("Target trace. Either an explicit id or a filter set matching exactly one trace."),
} as const

const CreateCustomScoreBodySchema = z
  .object({
    ...scoreBodyCommonFields,
    sourceId: z
      .string()
      .min(1)
      .max(SCORE_SOURCE_ID_MAX_LENGTH)
      .describe('User-supplied tag identifying the score\'s origin (e.g. `"prod-pipeline"`, `"qa-script-v2"`).'),
    metadata: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Arbitrary user-supplied metadata persisted alongside the score."),
    _evaluation: z
      .literal(false)
      .optional()
      .default(false)
      .describe("Discriminator: omit (or `false`) for custom scores. Required `true` for evaluation scores."),
  })
  .openapi("CreateCustomScoreBody")

const EvaluationScoreMetadataSchema = z
  .object({
    evaluationHash: z
      .string()
      .describe(
        "Hash of the evaluation script that produced this score; lets the platform track which version generated it.",
      ),
  })
  .openapi("EvaluationScoreMetadata")

const CreateEvaluationScoreBodySchema = z
  .object({
    ...scoreBodyCommonFields,
    _evaluation: z
      .literal(true)
      .describe("Discriminator: `true` flags the body as an evaluation score (internal); `false`/omit for custom."),
    sourceId: cuidSchema.describe("CUID of the evaluation that produced this score."),
    metadata: EvaluationScoreMetadataSchema.describe("Evaluation-specific metadata."),
  })
  .openapi("CreateEvaluationScoreBody", { description: "Internal, don't use" })

const RequestSchema = z.union([CreateCustomScoreBodySchema, CreateEvaluationScoreBodySchema]).openapi("CreateScoreBody")

// Lifecycle / measurement fields on the response, shared between custom and
// evaluation variants. Field shapes mirror `baseScoreSchema` from
// `@domain/scores` (with branded-ID schemas replaced by plain strings — the
// domain transforms aren't representable in JSON Schema and would break the
// MCP tool's `outputSchema`).
const scoreResponseCommonFields = {
  id: cuidSchema.describe("Stable score identifier."),
  organizationId: cuidSchema.describe("Organization that owns this score."),
  projectId: cuidSchema.describe("Project this score lives in."),
  sessionId: sessionIdSchema
    .nullable()
    .describe("Session id lifted from the trace, when set. `null` when the trace has no session."),
  traceId: traceIdSchema.nullable().describe("Identifier of the scored trace."),
  spanId: spanIdSchema.nullable().describe("Span the score pins to. Defaults to the trace's last LLM-completion span."),
  simulationId: cuidSchema.nullable().describe("Simulation reference, if any."),
  issueId: cuidSchema.nullable().describe("Issue this score contributes to, if any."),
  value: z.number().min(0).max(1).describe("Normalized score value in [0, 1]."),
  passed: z.boolean().describe("Whether the score marks the output as passing."),
  feedback: z.string().describe("Free-text feedback explaining the score."),
  error: z
    .string()
    .min(1)
    .nullable()
    .describe("Generation error text, when score generation itself errored. `null` for successful scores."),
  errored: z.boolean().describe("`true` when the score could not be generated successfully."),
  duration: z.number().int().nonnegative().describe("Score generation duration in nanoseconds."),
  tokens: z.number().int().nonnegative().describe("LLM tokens consumed generating the score."),
  cost: z.number().int().nonnegative().describe("Score cost in microcents (1/1,000,000 of a USD)."),
  draftedAt: z.iso
    .datetime()
    .nullable()
    .describe(
      "ISO-8601 timestamp while the score is awaiting human confirmation. `null` for published / system scores.",
    ),
  annotatorId: cuidSchema.nullable().describe("User who authored the score, if any."),
  createdAt: z.iso.datetime().describe("ISO-8601 timestamp at which the score was created."),
  updatedAt: z.iso.datetime().describe("ISO-8601 timestamp of the last metadata update."),
} as const

const CustomScoreResponseSchema = z
  .object({
    ...scoreResponseCommonFields,
    source: z.literal("custom").describe('Discriminator. `"custom"` denotes a user-supplied score.'),
    sourceId: z
      .string()
      .min(1)
      .max(SCORE_SOURCE_ID_MAX_LENGTH)
      .describe("User-supplied tag identifying the score's origin (echoed from the request)."),
    metadata: z
      .record(z.string(), z.unknown())
      .describe("Arbitrary user-supplied metadata persisted alongside the score."),
  })
  .openapi("CustomScoreResponse")

const EvaluationScoreResponseSchema = z
  .object({
    ...scoreResponseCommonFields,
    source: z
      .literal("evaluation")
      .describe('Discriminator. `"evaluation"` denotes a platform-generated evaluation score.'),
    sourceId: cuidSchema.describe("CUID of the evaluation that produced this score."),
    metadata: EvaluationScoreMetadataSchema.describe("Evaluation-specific metadata."),
  })
  .openapi("EvaluationScoreResponse")

const ResponseSchema = z.union([CustomScoreResponseSchema, EvaluationScoreResponseSchema]).openapi("ScoreResponse")

type ApiScore = CustomScore | EvaluationScore

const scoresFernGroup = (methodName: string) =>
  ({
    "x-fern-sdk-group-name": "scores",
    "x-fern-sdk-method-name": methodName,
  }) as const

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

export const scoresPath = "/projects/:projectSlug/scores"

const scoreEndpoint = defineApiEndpoint<OrganizationScopedEnv>(scoresPath)

const createScore = scoreEndpoint({
  route: createRoute({
    method: "post",
    path: "/",
    name: "createScore",
    tags: ["Scores"],
    ...scoresFernGroup("create"),
    summary: "Create project score",
    description:
      'Creates a score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required). Annotations use the separate `/annotations` endpoint.',
    security: PROTECTED_SECURITY,
    request: {
      params: ProjectParamsSchema,
      body: jsonBody(RequestSchema),
    },
    responses: openApiResponses({
      status: 201,
      schema: ResponseSchema,
      description: "Score created",
    }),
  }),
  handler: async (c) => {
    const body = c.req.valid("json")
    const { projectSlug } = c.req.valid("param")
    const organizationId = c.var.organization.id

    const score = await Effect.runPromise(
      Effect.gen(function* () {
        const projectRepository = yield* ProjectRepository
        const project = yield* projectRepository.findBySlug(projectSlug)

        // The route exposes `_evaluation: boolean` for the public OpenAPI shape;
        // the use case takes the discriminated `source` shape used internally.
        // The variant fields (`source`/`sourceId`/`metadata`) live inside the
        // ternary so TypeScript keeps each branch's discriminator narrowed; the
        // rest of the body is shared.
        const variantFields =
          body._evaluation === true
            ? { source: "evaluation" as const, sourceId: body.sourceId, metadata: body.metadata }
            : { source: "custom" as const, sourceId: body.sourceId, metadata: body.metadata }

        const submitInput: SubmitApiScoreInput & { organizationId: string; projectId: typeof project.id } = {
          ...variantFields,
          trace: body.trace,
          simulationId: body.simulationId,
          value: body.value,
          passed: body.passed,
          feedback: body.feedback,
          error: body.error,
          duration: body.duration,
          tokens: body.tokens,
          cost: body.cost,
          organizationId,
          projectId: project.id,
        }

        return (yield* submitApiScoreUseCase(submitInput)) as ApiScore
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
        withTracing,
      ),
    )

    return c.json(toResponse(score), 201)
  },
})

export const createScoresRoutes = () => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  createScore.mountHttp(app)
  return app
}
