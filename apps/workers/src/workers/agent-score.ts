import { resolveLaunchArtifacts, utcDateOf } from "@domain/agent-score"
import { FLAGGER_DEFAULT_CLASSIFIER_MODEL } from "@domain/flaggers"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import type { RedisClient } from "@platform/cache-redis"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import {
  FlaggerScreeningDecisionRepositoryLive,
  MemoryRepositoryLive,
  OutcomeWindowDecisionSourceLive,
  SafetyWindowDecisionSourceLive,
  ScoreProjectSweepSourceLive,
  ScoreWindowSourceLive,
  SessionAnalysisRepositoryLive,
  SessionAssessmentBulkTelemetrySourceLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SessionSemanticMomentRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  AgentScoreSnapshotRepositoryLive,
  FlaggerRepositoryLive,
  ScoreRepositoryLive,
  SessionAssessmentBulkJudgmentSourceLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { snapshotProjectAgentScore } from "./agent-score-snapshot.ts"
import { fanOutAgentScoreSweep } from "./agent-score-sweep.ts"

const logger = createLogger("agent-score")

interface AgentScoreWorkerDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
  readonly redisClient: RedisClient
}

export const createAgentScoreWorker = ({
  consumer,
  publisher,
  postgresClient,
  clickhouseClient,
  redisClient,
}: AgentScoreWorkerDeps) => {
  // One judge for the whole run: it decides the scoring version, and a version that varied per
  // project would make two projects' numbers incomparable for a reason neither of them chose.
  const artifacts = resolveLaunchArtifacts({ judge: FLAGGER_DEFAULT_CLASSIFIER_MODEL })

  consumer.subscribe("agent-score", {
    sweep: () => {
      const now = new Date()
      const date = utcDateOf(now)

      return fanOutAgentScoreSweep({
        publish: (payload) => publisher.publish("agent-score", "snapshotProject", payload),
      })({
        date,
        to: now,
        maxStepDays: Math.max(...artifacts.agentScore.window.stepDays),
        sessionFloor: artifacts.agentScore.window.sessionFloor,
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              result.status === "fanned-out"
                ? `agent-score: fan-out for ${result.publishedCount} project(s) on ${date}`
                : `agent-score: no project reached the session floor on ${date}`,
            ),
          ),
        ),
        Effect.tapError((error) => Effect.sync(() => logger.error("agent-score sweep failed", error))),
        // Cross-organisation by design: the sweep has to see every project to decide who gets a task.
        withClickHouse(ScoreProjectSweepSourceLive, clickhouseClient, OrganizationId("system")),
        withTracing,
        Effect.asVoid,
      )
    },

    snapshotProject: (payload) => {
      const organizationId = OrganizationId(payload.organizationId)
      const projectId = ProjectId(payload.projectId)

      return snapshotProjectAgentScore({
        organizationId,
        projectId,
        date: payload.date,
        ...(payload.force ? { force: true } : {}),
        artifact: artifacts.agentScore,
        costArtifact: artifacts.cost,
        catalog: artifacts.catalog,
        latencyArtifact: artifacts.latency,
        judge: FLAGGER_DEFAULT_CLASSIFIER_MODEL,
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.status === "published" || result.status === "refreshed") {
              logger.info(
                `agent-score: ${projectId} scored ${result.score.toFixed(1)} on ${payload.date}` +
                  (result.status === "refreshed" ? " (evidence refreshed, stored score unchanged)" : ""),
              )
            } else if (result.status === "withheld") {
              // A withheld day is a gap in the trend, and the floor it missed is what explains it.
              logger.info(`agent-score: ${projectId} withheld on ${payload.date} (${result.reason})`)
            }
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`agent-score snapshot failed for ${projectId}`, error)),
        ),
        // Scoped to the project's own organisation, so row-level security covers every read.
        withPostgres(
          Layer.mergeAll(
            AgentScoreSnapshotRepositoryLive,
            FlaggerRepositoryLive,
            SessionAssessmentBulkJudgmentSourceLive.pipe(
              Layer.provideMerge(Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive)),
            ),
            ScoreRepositoryLive,
          ),
          postgresClient,
          organizationId,
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
          clickhouseClient,
          organizationId,
        ),
        Effect.provide(RedisCacheStoreLive(redisClient)),
        withTracing,
        Effect.asVoid,
      )
    },
  })
}
