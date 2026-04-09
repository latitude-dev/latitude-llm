import {
  type AssignScoreToIssueInput,
  assignScoreToIssueUseCase,
  type CheckEligibilityInput,
  type CreateIssueFromScoreInput,
  checkEligibilityUseCase,
  createIssueFromScoreUseCase,
  type EmbedScoreFeedbackInput,
  embedScoreFeedbackUseCase,
  type HybridSearchIssuesInput,
  hybridSearchIssuesUseCase,
  isEligibilityError,
  type RerankIssueCandidatesInput,
  type ResolveMatchedIssueInput,
  rerankIssueCandidatesUseCase,
  resolveMatchedIssueUseCase,
  type SyncIssueProjectionsInput,
  syncIssueProjectionsUseCase,
} from "@domain/issues"
import { type SyncScoreAnalyticsInput, syncScoreAnalyticsUseCase } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive, AIRerankLive } from "@platform/ai-voyage"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { IssueRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { IssueProjectionRepositoryLive, withWeaviate } from "@platform/db-weaviate"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient, getWeaviateClient } from "../clients.ts"

const logger = createLogger("workflows-issue-discovery")

export const checkEligibility = async (input: CheckEligibilityInput) =>
  Effect.runPromise(
    checkEligibilityUseCase(input).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (isEligibilityError(error)) return
          logger.error("Issue discovery eligibility check failed", {
            scoreId: input.scoreId,
            error,
          })
        }),
      ),
    ),
  )

export const embedScoreFeedback = async (input: EmbedScoreFeedbackInput) =>
  Effect.runPromise(
    embedScoreFeedbackUseCase(input).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withAi(AIEmbedLive, getRedisClient()),
    ),
  )

export const hybridSearchIssues = async (input: HybridSearchIssuesInput) =>
  Effect.runPromise(
    hybridSearchIssuesUseCase(input).pipe(
      withWeaviate(IssueProjectionRepositoryLive, await getWeaviateClient(), OrganizationId(input.organizationId)),
    ),
  )

export const rerankIssueCandidates = async (input: RerankIssueCandidatesInput) =>
  Effect.runPromise(rerankIssueCandidatesUseCase(input).pipe(withAi(AIRerankLive, getRedisClient())))

export const resolveMatchedIssue = async (input: ResolveMatchedIssueInput) =>
  Effect.runPromise(
    resolveMatchedIssueUseCase(input).pipe(
      withPostgres(IssueRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
    ),
  )

export const createIssueFromScore = async (input: CreateIssueFromScoreInput) =>
  Effect.runPromise(
    createIssueFromScoreUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, IssueRepositoryLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(AIGenerateLive, getRedisClient()),
    ),
  )

export const assignScoreToIssue = async (input: AssignScoreToIssueInput) =>
  Effect.runPromise(
    assignScoreToIssueUseCase(input).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, IssueRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
    ),
  )

export const syncScoreAnalytics = async (input: SyncScoreAnalyticsInput) =>
  Effect.runPromise(
    syncScoreAnalyticsUseCase(input).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
    ),
  )

export const syncIssueProjections = async (input: SyncIssueProjectionsInput) =>
  Effect.runPromise(
    syncIssueProjectionsUseCase(input).pipe(
      withPostgres(IssueRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withWeaviate(IssueProjectionRepositoryLive, await getWeaviateClient(), OrganizationId(input.organizationId)),
    ),
  )

export { runFlagger } from "./flagger.ts"
