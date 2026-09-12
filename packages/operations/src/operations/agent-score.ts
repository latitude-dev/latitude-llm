import {
  type AgentScoreExplanation,
  type AgentScoreSnapshot,
  getAgentScoreExplanation,
  getCurrentAgentScore,
  listAgentScoreHistory,
} from "@domain/agent-score"
import { ProjectRepository } from "@domain/projects"
import { OrganizationId, ProjectId, SCORE_DIMENSIONS } from "@domain/shared"
import { createRoute, z } from "@hono/zod-openapi"
import { RedisCacheStoreLive } from "@platform/cache-redis"
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

const CauseRowSchema = z
  .object({
    causeId: z.string().describe("Stable identifier of the metric, claim or finding kind behind this row."),
    label: z.string().describe("Human-readable name for the cause."),
    attributedDeficit: z
      .number()
      .describe(
        "Points of the dimension's deficit attributed to this cause. Attributed deficits across a dimension add up; they are not a prediction of what fixing it returns.",
      ),
    fixGain: z
      .number()
      .describe(
        "Points the dimension would recover if this cause alone disappeared. Fix gains overlap between causes and must never be summed.",
      ),
    evidence: z
      .enum(["measured", "associated"])
      .describe(
        "`measured` when the reader observed the effect directly; `associated` when it was estimated from matched comparison sessions and no causal claim is made.",
      ),
    nativeEffect: z
      .object({
        value: z.number().describe("Size of the effect in its own unit, before it became score points."),
        unit: z.string().describe("Unit the value is in, such as nanoseconds, sessions, or a Cost family."),
      })
      .describe("The effect in the dimension's own terms, which is what the row shows beside the points."),
    observationCount: z
      .number()
      .int()
      .describe("Independent observations behind the row. Coverage context, not a score."),
  })
  .openapi("AgentScoreCauseRow")

const DimensionAttributionSchema = z
  .object({
    scoreDimension: z.enum(["outcome", "reliability", "cost", "speed", "safety"]).describe("Dimension explained."),
    rows: z.array(CauseRowSchema).describe("Causes, most responsible first."),
    residual: z.number().describe("Points of the deficit no named cause accounts for, including estimation error."),
    totalDeficit: z.number().describe("The dimension's whole distance from healthy, in points."),
    method: z.enum(["exact", "sampled"]).describe("`sampled` when there were too many causes to attribute exactly."),
    approximationError: z
      .number()
      .nullable()
      .describe("Standard error of the sampled shares in points, or `null` when attribution was exact."),
  })
  .openapi("AgentScoreDimensionAttribution")

const IssueRowSchema = z
  .object({
    issueKey: z.string().describe("Stable identifier for the issue."),
    label: z.string().describe("Human-readable name for the issue."),
    signalIds: z.array(z.string()).describe("Signals this issue was observed through, if any."),
    estimatedReach: z
      .number()
      .nullable()
      .describe(
        "Sessions the issue touched, corrected for how often it could be observed. `null` when the correction is unknown.",
      ),
    estimatedAdverseReach: z
      .number()
      .nullable()
      .describe("Sessions it touched that went badly, corrected the same way. `null` when unknown."),
    examinedSessions: z.number().int().describe("Raw sessions examined. Coverage context, never a ranking key."),
    examinedAdverseSessions: z.number().int().describe("Raw examined sessions that went badly."),
    ranked: z
      .boolean()
      .describe(
        "`false` when a required joint observation probability was unknown, so the row explains without claiming a position.",
      ),
  })
  .openapi("AgentScoreIssueRow")

const ExplanationSchema = z
  .object({
    computedAt: z
      .string()
      .describe(
        "When this evidence was read, as an ISO-8601 timestamp. It explains present behaviour, not the stored score.",
      ),
    scoringVersion: z.string().describe("Scoring version the evidence was read under."),
    windowDays: z.number().int().describe("Length in days of the window the evidence covers."),
    eligibleSessionCount: z.number().int().describe("Production sessions in that window."),
    attribution: z
      .array(DimensionAttributionSchema)
      .describe("Per-dimension cause rows for the dimensions that support a counterfactual."),
    outcomeIssues: z
      .array(IssueRowSchema)
      .describe("Where task failures concentrate. Reach only; these rows carry no share of the score."),
    safetyConfirmedHarm: z.array(IssueRowSchema).describe("Issues where the agent caused confirmed harm."),
    safetyExposure: z
      .array(IssueRowSchema)
      .describe("Hostile or sensitive content the agent received. Exposure is context and never lowers Safety."),
  })
  .openapi("AgentScoreExplanation")

const AgentScoreCausesSchema = z
  .object({
    status: z
      .enum(["ready", "notComputed"])
      .describe("`notComputed` when the explanation has not been prepared yet; the scores are still valid."),
    explanation: ExplanationSchema.nullable().describe("The evidence, or `null` when it is not ready."),
  })
  .openapi("AgentScoreCauses")

const toIssueRows = (rows: AgentScoreExplanation["issues"]["outcome"]) =>
  rows.map((row) => ({
    issueKey: row.issueKey,
    label: row.label,
    signalIds: [...row.signalIds],
    estimatedReach: row.estimatedReach ?? null,
    estimatedAdverseReach: row.estimatedAdverseReach ?? null,
    examinedSessions: row.examinedSessions,
    examinedAdverseSessions: row.examinedAdverseSessions,
    ranked: row.ranked,
  }))

const toExplanationResponse = (explanation: AgentScoreExplanation) => ({
  computedAt: explanation.computedAt,
  scoringVersion: explanation.scoringVersion,
  windowDays: explanation.window.stepDays,
  eligibleSessionCount: explanation.eligibleSessionCount,
  attribution: explanation.attribution.map((dimension) => ({
    scoreDimension: dimension.scoreDimension,
    rows: dimension.rows.map((row) => ({
      causeId: row.causeId,
      label: row.label,
      attributedDeficit: row.attributedDeficit,
      fixGain: row.fixGain,
      evidence: row.evidence,
      nativeEffect: row.nativeEffect,
      observationCount: row.observationCount,
    })),
    residual: dimension.residual,
    totalDeficit: dimension.totalDeficit,
    method: dimension.method,
    approximationError: dimension.approximationError ?? null,
  })),
  outcomeIssues: toIssueRows(explanation.issues.outcome),
  safetyConfirmedHarm: toIssueRows(explanation.issues.safety.confirmedHarm),
  safetyExposure: toIssueRows(explanation.issues.safety.exposure),
})

const getAgentScoreCauses = agentScoreOperation({
  route: createRoute({
    method: "get",
    path: "/causes",
    name: "getAgentScoreCauses",
    tags: ["Agent Score"],
    group: "agentScore",
    sdkMethod: "causes",
    summary: "Get Agent Score causes",
    description:
      "Returns what explains the project's current Agent Score: ranked causes per dimension, and where Outcome failures and Safety harm concentrate. This is current evidence from the live window and does not reconstruct any stored score.",
    security: PROTECTED_SECURITY,
    request: { params: ProjectParamsSchema },
    responses: typedResponses({
      status: 200,
      schema: AgentScoreCausesSchema,
      description: "Current cause rows, or an explicit absence",
    }),
  }),
  access: "read-only",
  rateLimitTier: "medium",
  execute: (input, ctx) =>
    Effect.gen(function* () {
      const projectRepo = yield* ProjectRepository
      const project = yield* projectRepo.findBySlug(input.params.projectSlug)
      const result = yield* getAgentScoreExplanation({
        organizationId: OrganizationId(ctx.organization.id as string),
        projectId: ProjectId(project.id as string),
      })

      return {
        status: 200,
        body: {
          status: result.status,
          explanation: result.status === "ready" ? toExplanationResponse(result.explanation) : null,
        },
      } as const
    }).pipe(
      withPostgres(agentScoreLayers, ctx.postgresClient, ctx.organization.id),
      Effect.provide(RedisCacheStoreLive(ctx.redis)),
      withTracing,
    ),
})

export const agentScoreModule: OperationModule = {
  path: agentScorePath,
  operations: [getAgentScoreHistory, getAgentScoreCauses, getAgentScore],
}
