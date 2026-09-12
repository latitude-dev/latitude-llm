import { type AgentScoreSnapshot, getCurrentAgentScore, listAgentScoreHistory } from "@domain/agent-score"
import { ProjectRepository } from "@domain/projects"
import { OrganizationId, ProjectId, SCORE_DIMENSIONS } from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import { AgentScoreSnapshotRepositoryLive, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { defineOperation } from "../core/define-operation.ts"
import type { OperationModule } from "../core/mount.ts"
import { PROTECTED_SECURITY, ProjectParamsSchema, typedResponses } from "../openapi/schemas.ts"
import type { OrganizationScopedEnv } from "../types.ts"

const agentScorePath = "/projects/:projectSlug/agent-score"
const agentScoreOperation = defineOperation<OrganizationScopedEnv>(agentScorePath)

const ScoreIntervalSchema = z
  .object({
    lower: z.number().describe("Lower bound of the 95% interval, on the same 0 to 100 scale."),
    upper: z.number().describe("Upper bound of the 95% interval, on the same 0 to 100 scale."),
  })
  .openapi("AgentScoreInterval")

const DimensionScoreSchema = z
  .object({
    score: z.number().describe("Dimension score from 0 to 100. Read it with the dimension's own meaning."),
    interval: ScoreIntervalSchema,
  })
  .openapi("AgentScoreDimension")

const SnapshotSchema = z
  .object({
    date: z.string().describe("UTC date the score was published for, as `YYYY-MM-DD`."),
    score: z.number().describe("Agent Score from 0 to 100: the weighted mean of the five dimensions for this window."),
    interval: ScoreIntervalSchema,
    dimensions: z
      .object({
        outcome: DimensionScoreSchema.describe("Share of comparable sessions expected to accomplish the user's task."),
        reliability: DimensionScoreSchema.describe(
          "Chance the agent completes a reference run of 20 sessions without a terminal operational failure.",
        ),
        cost: DimensionScoreSchema.describe("Health of the agent's use of paid and token-bearing resources."),
        speed: DimensionScoreSchema.describe("Share of user-visible critical-path time that was necessary."),
        safety: DimensionScoreSchema.describe(
          "Chance a reference run of 100 sessions contains no confirmed agent-caused harm.",
        ),
      })
      .openapi("AgentScoreDimensions"),
    scoringVersion: z
      .string()
      .describe(
        "Version of the formulas, prompts and frozen references that produced this score. Scores from different versions are not directly comparable.",
      ),
    windowDays: z.number().int().describe("Length in days of the rolling window this score covers."),
    eligibleSessionCount: z.number().int().describe("Production sessions in the window the score was computed over."),
    policyCap: z
      .number()
      .nullable()
      .describe("Ceiling a safety policy rule applied to the score, or `null` when no rule applied."),
  })
  .openapi("AgentScoreSnapshot")

const CurrentAgentScoreSchema = z
  .object({
    available: z
      .boolean()
      .describe(
        "Whether a score was published for today. `false` when a dimension did not meet its coverage or confidence floor; no earlier score is substituted.",
      ),
    date: z.string().describe("UTC date the answer refers to, as `YYYY-MM-DD`."),
    snapshot: SnapshotSchema.nullable().describe("Today's score, or `null` when none was published."),
  })
  .openapi("CurrentAgentScore")

const AgentScoreHistorySchema = z
  .object({
    snapshots: z
      .array(SnapshotSchema)
      .describe("Published scores in the range, oldest first. Days without a published score are absent, not zero."),
  })
  .openapi("AgentScoreHistory")

const HistoryQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Inclusive start date as `YYYY-MM-DD`. Defaults to 90 days before `to`."),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Inclusive end date as `YYYY-MM-DD`. Defaults to today."),
})

const toSnapshotResponse = (snapshot: AgentScoreSnapshot) => ({
  date: snapshot.date,
  score: snapshot.score,
  interval: snapshot.interval,
  dimensions: Object.fromEntries(
    SCORE_DIMENSIONS.map((dimension) => [dimension, snapshot.dimensions[dimension]]),
  ) as Record<(typeof SCORE_DIMENSIONS)[number], { score: number; interval: { lower: number; upper: number } }>,
  scoringVersion: snapshot.scoringVersion,
  windowDays: snapshot.windowDays,
  eligibleSessionCount: snapshot.eligibleSessionCount,
  policyCap: snapshot.policyCap ?? null,
})

const agentScoreLayers = Layer.mergeAll(ProjectRepositoryLive, AgentScoreSnapshotRepositoryLive)

const getAgentScore = agentScoreOperation({
  route: createRoute({
    method: "get",
    path: "/",
    name: "getAgentScore",
    tags: ["Agent Score"],
    group: "agentScore",
    sdkMethod: "get",
    summary: "Get Agent Score",
    description:
      "Returns the project's Agent Score for today: one number from 0 to 100 and the five dimensions behind it. A score is published only when every dimension meets its coverage and confidence floors, so a project can have no score for a day.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: typedResponses({
      status: 200,
      schema: CurrentAgentScoreSchema,
      description: "Today's Agent Score, or an explicit absence",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const current = yield* getCurrentAgentScore({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
      })

      return {
        status: 200,
        body: {
          available: current.available,
          date: current.date,
          snapshot: current.available ? toSnapshotResponse(current.snapshot) : null,
        },
      } as const
    }).pipe(withPostgres(agentScoreLayers, ctx.postgresClient, ctx.organization.id), withTracing),
})

const getAgentScoreHistory = agentScoreOperation({
  route: createRoute({
    method: "get",
    path: "/history",
    name: "listAgentScoreHistory",
    tags: ["Agent Score"],
    group: "agentScore",
    sdkMethod: "history",
    summary: "List Agent Score history",
    description:
      "Returns the project's published Agent Scores in a date range, oldest first. Days the project did not publish are absent from the list.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema, query: HistoryQuerySchema },
    responses: typedResponses({
      status: 200,
      schema: AgentScoreHistorySchema,
      description: "Published Agent Scores in the range",
    }),
  }),
  access: "read-only",
  rateLimitTier: "low",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const snapshots = yield* listAgentScoreHistory({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
        ...(input.query.from ? { from: input.query.from } : {}),
        ...(input.query.to ? { to: input.query.to } : {}),
      })

      return { status: 200, body: { snapshots: snapshots.map(toSnapshotResponse) } } as const
    }).pipe(withPostgres(agentScoreLayers, ctx.postgresClient, ctx.organization.id), withTracing),
})

export const agentScoreModule: OperationModule = {
  path: agentScorePath,
  operations: [getAgentScoreHistory, getAgentScore],
}
