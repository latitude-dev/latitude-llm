import { resolveLaunchArtifacts, type SnapshotProjectResult, snapshotProjectAgentScore } from "@domain/agent-score"
import { resolveGenerationConfig } from "@domain/ai"
import { FLAGGER_DEFAULT_CLASSIFIER_MODEL } from "@domain/flaggers"
import { OrganizationId, ProjectId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  FlaggerScreeningDecisionRepositoryLive,
  MemoryRepositoryLive,
  OutcomeWindowDecisionSourceLive,
  SafetyWindowDecisionSourceLive,
  ScoreWindowSourceLive,
  SessionAnalysisRepositoryLive,
  SessionAssessmentBulkTelemetrySourceLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SessionSemanticMomentRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  AgentScoreSnapshotRepositoryLive,
  FlaggerRepositoryLive,
  ScoreRepositoryLive,
  SessionAssessmentBulkJudgmentSourceLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { describeActivityCause } from "./activity-error.ts"

const logger = createLogger("workflows-agent-score")

export interface SnapshotAgentScoreActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly date: string
  readonly to?: string
  readonly force?: boolean
}

class AgentScoreSnapshotActivityError extends Data.TaggedError("AgentScoreSnapshotActivityError")<{
  readonly cause: unknown
}> {
  override get message() {
    return `Agent Score snapshot failed: ${describeActivityCause(this.cause)}`
  }
}

const snapshotAgentScoreEffect = Effect.fn("workflows.agentScore.snapshot")(function* (
  input: SnapshotAgentScoreActivityInput,
) {
  const organizationId = OrganizationId(input.organizationId)
  const projectId = ProjectId(input.projectId)
  const judge = Effect.runSync(resolveGenerationConfig("FLAGGER_CLASSIFIER", FLAGGER_DEFAULT_CLASSIFIER_MODEL))
  const artifacts = resolveLaunchArtifacts({ judge })

  return yield* snapshotProjectAgentScore({
    organizationId,
    projectId,
    date: input.date,
    ...(input.to ? { to: new Date(input.to) } : {}),
    ...(input.force ? { force: true } : {}),
    artifact: artifacts.agentScore,
    costArtifact: artifacts.cost,
    catalog: artifacts.catalog,
    latencyArtifact: artifacts.latency,
    judge,
  })
})

export const snapshotAgentScoreActivity = (input: SnapshotAgentScoreActivityInput): Promise<SnapshotProjectResult> =>
  Effect.runPromise(
    snapshotAgentScoreEffect(input).pipe(
      withPostgres(
        Layer.mergeAll(
          AgentScoreSnapshotRepositoryLive,
          FlaggerRepositoryLive,
          SessionAssessmentBulkJudgmentSourceLive.pipe(
            Layer.provideMerge(Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive)),
          ),
          ScoreRepositoryLive,
        ),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(
        Layer.mergeAll(
          ScoreWindowSourceLive,
          OutcomeWindowDecisionSourceLive,
          SafetyWindowDecisionSourceLive,
          SessionAssessmentBulkTelemetrySourceLive.pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                SessionRepositoryLive,
                SpanRepositoryLive,
                SessionAnalysisRepositoryLive,
                SessionSemanticMomentRepositoryLive,
                SessionMomentLabelRepositoryLive,
                FlaggerScreeningDecisionRepositoryLive,
                MemoryRepositoryLive,
              ),
            ),
          ),
        ),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisCacheStoreLive(getRedisClient())),
      withTracing,
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info("Agent Score snapshot activity completed", {
            organizationId: input.organizationId,
            projectId: input.projectId,
            date: input.date,
            result,
          }),
        ),
      ),
      Effect.mapError((cause) => new AgentScoreSnapshotActivityError({ cause })),
    ),
  )
