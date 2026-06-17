import { type SyncScoreAnalyticsInput, syncScoreAnalyticsUseCase } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import {
  type AssignOrCreateSignalInput,
  type AssignScoreToSignalInput,
  assignOrCreateSignalUseCase,
  assignScoreToSignalUseCase,
  type CheckEligibilityInput,
  type CreateSignalFromScoreInput,
  checkEligibilityUseCase,
  createSignalFromScoreUseCase,
  type EmbedScoreFeedbackInput,
  embedScoreFeedbackUseCase,
  isEligibilityError,
  SignalDiscoveryLockUnavailableError,
} from "@domain/signals"
import { AIEmbedLive, AIGenerateLive, AIRerankLive, withAi } from "@platform/ai"
import { RedisDistributedLockRepositoryLive } from "@platform/cache-redis"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ScoreRepositoryLive, SignalRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("workflows-issue-discovery")

export const checkEligibility = async (input: CheckEligibilityInput) => {
  try {
    await Effect.runPromise(
      checkEligibilityUseCase(input).pipe(
        withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
        withTracing,
      ),
    )

    return {
      status: "eligible",
    }
  } catch (error) {
    if (isEligibilityError(error)) {
      return {
        status: "skipped",
        reason: error._tag,
      }
    }

    logger.error("Signal discovery eligibility check failed", {
      scoreId: input.scoreId,
      error,
    })
    throw error
  }
}

export const embedScoreFeedback = async (input: EmbedScoreFeedbackInput) =>
  Effect.runPromise(
    embedScoreFeedbackUseCase(input).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withAi(AIEmbedLive, getRedisClient()),
      withTracing,
    ),
  )

export const createSignalFromScore = async (input: CreateSignalFromScoreInput) =>
  Effect.runPromise(
    createSignalFromScoreUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(AIGenerateLive, getRedisClient()),
      withTracing,
    ),
  )

export const assignOrCreateSignal = async (input: AssignOrCreateSignalInput) =>
  Effect.runPromise(
    assignOrCreateSignalUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisDistributedLockRepositoryLive(getRedisClient())),
      // TODO(issue-discovery-rerank): drop AIRerankLive when assignOrCreateSignal
      // relies on Postgres pgvector hybrid search directly.
      withAi(Layer.mergeAll(AIGenerateLive, AIRerankLive), getRedisClient()),
      withTracing,
      Effect.match({
        onFailure: (error) => {
          if (error instanceof SignalDiscoveryLockUnavailableError) {
            return { status: "lock-unavailable" as const }
          }

          throw error
        },
        onSuccess: (result) =>
          result.action === "skipped"
            ? { status: "skipped" as const, reason: result.reason }
            : { status: "serialized" as const, assignment: result },
      }),
    ),
  )

export const assignScoreToSignal = async (input: AssignScoreToSignalInput) =>
  Effect.runPromise(
    assignScoreToSignalUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      Effect.provide(RedisDistributedLockRepositoryLive(getRedisClient())),
      withTracing,
      Effect.match({
        onFailure: (error) => {
          if (error instanceof SignalDiscoveryLockUnavailableError) {
            return { status: "lock-unavailable" as const }
          }

          throw error
        },
        onSuccess: (assignment) => ({ status: "assigned" as const, assignment }),
      }),
    ),
  )

export const syncScoreAnalytics = async (input: SyncScoreAnalyticsInput) =>
  Effect.runPromise(
    syncScoreAnalyticsUseCase(input).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
      withTracing,
    ),
  )
